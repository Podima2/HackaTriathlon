import SwiftUI

struct TelemetryView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(spacing: 12) {
                    Text(appModel.latestReading.map { "\($0.bpm)" } ?? "--")
                        .font(.system(size: 72, weight: .bold, design: .rounded))
                    Text("BPM")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .padding()
                .frame(maxWidth: .infinity)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 24))

                VStack(spacing: 12) {
                    statusRow("BLE", appModel.connectionStatus.rawValue.capitalized)
                    statusRow("Motion", appModel.diagnostics.motionStatus)
                    statusRow("Last Sample Local", lastSampleLocal)
                    statusRow("Last Sample UTC", lastSampleUTC)
                    statusRow("Sequence", sequenceText)
                    statusRow("Steps", currentSteps)
                    statusRow("Session", appModel.activeSession?.sessionId ?? "No active session")
                    statusRow("Timezone", appModel.activeSession?.eventTimezone ?? TimeZone.current.identifier)
                    statusRow("Pending Queue", "\(appModel.diagnostics.pendingSamples)")
                    statusRow("Last Acked", lastAckedText)
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Telemetry")
        }
    }

    private func statusRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .multilineTextAlignment(.trailing)
        }
        .padding()
        .background(Color.gray.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var lastSampleLocal: String {
        guard let reading = appModel.latestReading else { return "N/A" }
        return Self.localFormatter.string(from: reading.phoneObservedAt)
    }

    private var lastSampleUTC: String {
        guard let reading = appModel.latestReading else { return "N/A" }
        return Self.utcFormatter.string(from: reading.phoneObservedAt)
    }

    private var sequenceText: String {
        guard let reading = appModel.latestReading else { return "N/A" }
        return String(reading.sampleSeq)
    }

    private var currentSteps: String {
        if let steps = appModel.diagnostics.currentSteps {
            return String(steps)
        }
        return "N/A"
    }

    private var lastAckedText: String {
        guard let lastAcked = appModel.diagnostics.lastAckedSequence else { return "N/A" }
        return String(lastAcked)
    }

    private static let localFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .medium
        formatter.locale = .current
        formatter.timeZone = .current
        return formatter
    }()

    private static let utcFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss 'UTC'"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }()
}
