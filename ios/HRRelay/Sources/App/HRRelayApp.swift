import SwiftUI

@main
struct HRRelayApp: App {
    @StateObject private var appModel = AppModel(
        environment: Self.makeEnvironment(),
        sampleStore: FileSampleStore(),
        logStore: FileLogStore()
    )

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(appModel)
                .task {
                    await appModel.bootstrap()
                }
        }
    }

    private static func makeEnvironment() -> AppEnvironment {
        guard let baseURLString = Bundle.main.object(forInfoDictionaryKey: "HRRelayAPIBaseURL") as? String,
              let baseURL = URL(string: baseURLString),
              baseURLString.isEmpty == false else {
            return .mock
        }

        let apiKey = Bundle.main.object(forInfoDictionaryKey: "HRRelayAPIKey") as? String
        let normalizedKey = apiKey?.trimmingCharacters(in: .whitespacesAndNewlines)
        return .live(baseURL: baseURL, apiKey: normalizedKey?.isEmpty == true ? nil : normalizedKey)
    }
}
