import SwiftUI

struct PairingView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        NavigationStack {
            List {
                Section("BLE Status") {
                    LabeledContent("State", value: appModel.connectionStatus.rawValue.capitalized)

                    HStack {
                        Button("Scan") {
                            appModel.startScan()
                        }
                        .buttonStyle(.borderedProminent)

                        Button("Stop") {
                            appModel.stopScan()
                        }
                        .buttonStyle(.bordered)

                        Button("Disconnect") {
                            appModel.disconnect()
                        }
                        .buttonStyle(.bordered)
                    }
                }

                Section("Discovered Devices") {
                    if appModel.discoveredDevices.isEmpty {
                        Text("No heart-rate devices found yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(appModel.discoveredDevices) { device in
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(device.name)
                                    Text(device.id.uuidString)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }

                                Spacer()

                                if let rssi = device.rssi {
                                    Text("\(rssi) dBm")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }

                                Button("Connect") {
                                    appModel.connect(to: device)
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Pairing")
        }
    }
}
