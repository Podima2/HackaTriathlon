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
    private var sampleSequence = 0

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
        guard let peripheral = peripherals[id] else { return }
        centralManager.stopScan()
        onConnectionStatusChanged?(.connecting)
        centralManager.connect(peripheral)
        onLog?("Connecting to \(peripheral.name ?? id.uuidString)")
    }

    func disconnect() {
        guard let connectedPeripheral else { return }
        centralManager.cancelPeripheralConnection(connectedPeripheral)
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
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        onConnectionStatusChanged?(.failed)
        onLog?("Failed to connect \(peripheral.name ?? peripheral.identifier.uuidString)")
        if let error {
            onLog?("Connection error: \(error.localizedDescription)")
        }
    }

    private func publishStatus(for state: CBManagerState) {
        let status: BLEConnectionStatus
        switch state {
        case .poweredOn:
            status = connectedPeripheral == nil ? .idle : .connected
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
              let bpm = Self.parseHeartRateMeasurement(data) else {
            return
        }

        sampleSequence += 1
        onReading?(HeartRateReading(
            sampleSeq: sampleSequence,
            bpm: bpm,
            deviceObservedAt: nil,
            phoneObservedAt: Date()
        ))
    }

    private static func parseHeartRateMeasurement(_ data: Data) -> Int? {
        guard data.count >= 2 else { return nil }
        let flags = data[0]
        let isUInt16 = (flags & 0x01) != 0

        if isUInt16 {
            guard data.count >= 3 else { return nil }
            return Int(UInt16(data[1]) | (UInt16(data[2]) << 8))
        } else {
            return Int(data[1])
        }
    }
}
