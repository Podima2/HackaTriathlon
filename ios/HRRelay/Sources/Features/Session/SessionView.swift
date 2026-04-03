import SwiftUI

struct SessionView: View {
    @EnvironmentObject private var appModel: AppModel

    var body: some View {
        NavigationStack {
            Form {
                Section("Event") {
                    TextField("Athlete ID", text: $appModel.athleteId)
                    TextField("Event ID", text: $appModel.eventId)
                    TextField("Notes", text: $appModel.notes, axis: .vertical)
                        .lineLimit(3...5)
                }

                Section("Session Status") {
                    LabeledContent("Active Session", value: appModel.activeSession?.sessionId ?? "None")
                    LabeledContent("Created At", value: appModel.activeSession?.createdAt.formatted(date: .numeric, time: .standard) ?? "N/A")
                    LabeledContent("State", value: appModel.activeSession?.status.capitalized ?? "Idle")
                    LabeledContent("Request", value: appModel.isStartingSession ? "Starting..." : appModel.isEndingSession ? "Ending..." : "Idle")
                    if let sessionFeedback = appModel.sessionFeedback {
                        Text(sessionFeedback)
                            .font(.footnote)
                            .foregroundStyle(sessionFeedback.contains("started") || sessionFeedback.contains("ended") ? .green : .red)
                    }
                }

                Section {
                    Button("Start Session") {
                        Task { await appModel.startSession() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(appModel.activeSession != nil || appModel.isStartingSession)

                    Button("End Session") {
                        Task { await appModel.endSession() }
                    }
                    .buttonStyle(.bordered)
                    .disabled(appModel.activeSession == nil || appModel.isEndingSession)
                }
            }
            .navigationTitle("Session")
        }
    }
}
