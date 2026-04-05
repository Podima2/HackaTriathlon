import SwiftUI

struct DiagnosticsView: View {
    @EnvironmentObject private var appModel: AppModel
    @State private var exportURL: URL?

    var body: some View {
        NavigationStack {
            List {
                Section("Live State") {
                    row("Strap", appModel.diagnostics.strapName ?? "Not connected")
                    row("BLE Status", appModel.diagnostics.connectionStatus.rawValue.capitalized)
                    row("Motion", appModel.diagnostics.motionStatus)
                    row("Backend", appModel.diagnostics.backendBaseURL ?? "Unknown")
                    row("Upload State", appModel.diagnostics.uploadState)
                    row("Upload Session", appModel.diagnostics.lastUploadSessionId ?? "N/A")
                    row("Last Upload", appModel.diagnostics.lastUploadAt?.formatted(date: .numeric, time: .standard) ?? "N/A")
                    row("Current BPM", appModel.diagnostics.currentBPM.map(String.init) ?? "N/A")
                    row("Current Steps", appModel.diagnostics.currentSteps.map(String.init) ?? "N/A")
                    row("Pending Samples", "\(appModel.diagnostics.pendingSamples)")
                    row("Last Acked Seq", appModel.diagnostics.lastAckedSequence.map(String.init) ?? "N/A")
                    row("Active Session", appModel.diagnostics.activeSessionId ?? "None")
                    row("Last Sample", appModel.diagnostics.lastSampleAt?.formatted(date: .numeric, time: .standard) ?? "N/A")
                    row("Last Error", appModel.diagnostics.lastError ?? "None")
                }

                Section("Actions") {
                    Button("Refresh") {
                        Task { await appModel.refreshDiagnostics() }
                    }

                    Button("Export Logs") {
                        Task {
                            exportURL = await appModel.exportLogs()
                        }
                    }
                }

                if let exportURL {
                    Section("Export") {
                        ShareLink(item: exportURL) {
                            Text("Share relay.log")
                        }
                    }
                }
            }
            .navigationTitle("Diagnostics")
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        LabeledContent(label, value: value)
    }
}
