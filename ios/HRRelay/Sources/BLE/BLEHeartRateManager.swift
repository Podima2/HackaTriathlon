import CoreBluetooth
import Foundation

final class BLEHeartRateManager: NSObject {
    var onDevicesChanged: (([BLEDevice]) -> Void)?
    var onConnectionStatusChanged: ((BLEConnectionStatus) -> Void)?
    var onReading: ((HeartRateReading) -> Void)?
    var onLog: ((String) -> Void)?

    private let centralManager: CBCentralManager
    private let heartRateServiceUUID = CBUUID(string: "180D")
    private let heartRateMeasurementUUID = CBUUID(string: "2A37")

    private var discovered: [UUID: BLEDevice] = [:]
    private var peripherals: [UUID: CBPeripheral] = [:]
    private var connectedPeripheral: CBPeripheral?
    private var desiredPeripheralID: UUID?
    private var shouldAutoReconnect = false
    private var reconnectTask: Task<Void, Never>?
    private var sampleSequence = 0
    private let hrvComputer = HRVComputer()

    var connectedDeviceName: String? {
        connectedPeripheral?.name
    }

    override init() {
        centralManager = CBCentralManager(delegate: nil, queue: nil)
        super.init()
        centralManager.delegate = self
    }

    func startScan() {
        guard centralManager.state == .poweredOn else {
            publishStatus(for: centralManager.state)
            return
        }

        discovered.removeAll()
        onConnectionStatusChanged?(.scanning)
        centralManager.scanForPeripherals(withServices: [heartRateServiceUUID], options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false
        ])
        onLog?("Started BLE scan")
    }

    func stopScan() {
        centralManager.stopScan()
        if connectedPeripheral == nil {
            onConnectionStatusChanged?(.idle)
        }
        onLog?("Stopped BLE scan")
    }

    func connect(to id: UUID) {
        let peripheral = peripherals[id] ?? centralManager.retrievePeripherals(withIdentifiers: [id]).first
        guard let peripheral else { return }
        peripherals[id] = peripheral
        desiredPeripheralID = id
        shouldAutoReconnect = true
        reconnectTask?.cancel()
        centralManager.stopScan()
        onConnectionStatusChanged?(.connecting)
        centralManager.connect(peripheral)
        onLog?("Connecting to \(peripheral.name ?? id.uuidString)")
    }

    func disconnect() {
        shouldAutoReconnect = false
        reconnectTask?.cancel()
        guard let connectedPeripheral else { return }
        centralManager.cancelPeripheralConnection(connectedPeripheral)
    }

    private func scheduleReconnect() {
        guard shouldAutoReconnect, let desiredPeripheralID else { return }
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard let self, !Task.isCancelled else { return }
            await MainActor.run {
                guard self.shouldAutoReconnect else { return }
                self.onConnectionStatusChanged?(.connecting)
                if self.peripherals[desiredPeripheralID] == nil,
                   let restored = self.centralManager.retrievePeripherals(withIdentifiers: [desiredPeripheralID]).first {
                    self.peripherals[desiredPeripheralID] = restored
                }
                if self.peripherals[desiredPeripheralID] != nil {
                    self.connect(to: desiredPeripheralID)
                } else {
                    self.startScan()
                }
                self.onLog?("Attempting automatic reconnect to \(desiredPeripheralID.uuidString)")
            }
        }
    }
}

extension BLEHeartRateManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        publishStatus(for: central.state)
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let device = BLEDevice(
            id: peripheral.identifier,
            name: peripheral.name ?? "Unknown Strap",
            rssi: RSSI.intValue
        )

        discovered[device.id] = device
        peripherals[device.id] = peripheral
        onDevicesChanged?(discovered.values.sorted { $0.name < $1.name })
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectedPeripheral = peripheral
        desiredPeripheralID = peripheral.identifier
        reconnectTask?.cancel()
        peripheral.delegate = self
        peripheral.discoverServices([heartRateServiceUUID])
        onConnectionStatusChanged?(.connected)
        onLog?("Connected to \(peripheral.name ?? peripheral.identifier.uuidString)")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        connectedPeripheral = nil
        onConnectionStatusChanged?(.disconnected)
        onLog?("Disconnected from \(peripheral.name ?? peripheral.identifier.uuidString)")
        if let error {
            onLog?("Disconnect error: \(error.localizedDescription)")
        }
        scheduleReconnect()
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        onConnectionStatusChanged?(.failed)
        onLog?("Failed to connect \(peripheral.name ?? peripheral.identifier.uuidString)")
        if let error {
            onLog?("Connection error: \(error.localizedDescription)")
        }
        scheduleReconnect()
    }

    private func publishStatus(for state: CBManagerState) {
        let status: BLEConnectionStatus
        switch state {
        case .poweredOn:
            status = connectedPeripheral == nil ? .idle : .connected
            if connectedPeripheral == nil, shouldAutoReconnect {
                scheduleReconnect()
            }
        case .poweredOff, .resetting:
            status = .unavailable
        case .unauthorized:
            status = .unauthorized
        case .unsupported:
            status = .unavailable
        case .unknown:
            status = .idle
        @unknown default:
            status = .failed
        }
        onConnectionStatusChanged?(status)
    }
}

extension BLEHeartRateManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            onLog?("Service discovery failed: \(error.localizedDescription)")
            return
        }

        peripheral.services?
            .filter { $0.uuid == heartRateServiceUUID }
            .forEach { peripheral.discoverCharacteristics([heartRateMeasurementUUID], for: $0) }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error {
            onLog?("Characteristic discovery failed: \(error.localizedDescription)")
            return
        }

        service.characteristics?
            .filter { $0.uuid == heartRateMeasurementUUID }
            .forEach { peripheral.setNotifyValue(true, for: $0) }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error {
            onLog?("Value update failed: \(error.localizedDescription)")
            return
        }

        guard characteristic.uuid == heartRateMeasurementUUID,
              let data = characteristic.value,
              let measurement = Self.parseHeartRateMeasurement(data) else {
            return
        }

        sampleSequence += 1
        let observedAt = Date()
        let hrv = hrvComputer.ingest(rrIntervalsMs: measurement.rrIntervalsMs, observedAt: observedAt)
        onReading?(HeartRateReading(
            sampleSeq: sampleSequence,
            bpm: measurement.bpm,
            rrIntervalsMs: measurement.rrIntervalsMs.isEmpty ? nil : measurement.rrIntervalsMs,
            rmssd: hrv.rmssd,
            sdnn: hrv.sdnn,
            deviceObservedAt: nil,
            phoneObservedAt: observedAt
        ))
    }

    private static func parseHeartRateMeasurement(_ data: Data) -> HeartRateMeasurement? {
        guard data.count >= 2 else { return nil }
        let flags = data[0]
        let isUInt16 = (flags & 0x01) != 0
        let hasEnergyExpended = (flags & 0x08) != 0
        let hasRRIntervals = (flags & 0x10) != 0

        let bpm: Int
        var index: Int

        if isUInt16 {
            guard data.count >= 3 else { return nil }
            bpm = Int(UInt16(data[1]) | (UInt16(data[2]) << 8))
            index = 3
        } else {
            bpm = Int(data[1])
            index = 2
        }

        if hasEnergyExpended {
            guard data.count >= index + 2 else { return HeartRateMeasurement(bpm: bpm, rrIntervalsMs: []) }
            index += 2
        }

        guard hasRRIntervals else {
            return HeartRateMeasurement(bpm: bpm, rrIntervalsMs: [])
        }

        var rrIntervalsMs: [Double] = []
        while index + 1 < data.count {
            let raw = UInt16(data[index]) | (UInt16(data[index + 1]) << 8)
            rrIntervalsMs.append(Double(raw) * 1000.0 / 1024.0)
            index += 2
        }

        return HeartRateMeasurement(bpm: bpm, rrIntervalsMs: rrIntervalsMs)
    }
}

private struct HeartRateMeasurement {
    let bpm: Int
    let rrIntervalsMs: [Double]
}

private final class HRVComputer {
    private struct RRIntervalSample {
        let milliseconds: Double
        let observedAt: Date
    }

    private let windowDuration: TimeInterval = 30
    private var intervals: [RRIntervalSample] = []

    func ingest(rrIntervalsMs: [Double], observedAt: Date) -> (rmssd: Double?, sdnn: Double?) {
        if !rrIntervalsMs.isEmpty {
            intervals.append(contentsOf: rrIntervalsMs.map { RRIntervalSample(milliseconds: $0, observedAt: observedAt) })
        }

        let cutoff = observedAt.addingTimeInterval(-windowDuration)
        intervals.removeAll { $0.observedAt < cutoff }

        let values = intervals.map(\.milliseconds)
        guard values.count >= 2 else {
            return (nil, nil)
        }

        let mean = values.reduce(0, +) / Double(values.count)
        let variance = values.reduce(0) { partial, value in
            let delta = value - mean
            return partial + (delta * delta)
        } / Double(values.count)
        let sdnn = sqrt(variance)

        let successiveDiffs = zip(values, values.dropFirst()).map { current, next in
            let delta = next - current
            return delta * delta
        }
        let rmssd = successiveDiffs.isEmpty
            ? nil
            : sqrt(successiveDiffs.reduce(0, +) / Double(successiveDiffs.count))

        return (
            rmssd.map { Self.roundToTwoDecimals($0) },
            Self.roundToTwoDecimals(sdnn)
        )
    }

    private static func roundToTwoDecimals(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }
}
