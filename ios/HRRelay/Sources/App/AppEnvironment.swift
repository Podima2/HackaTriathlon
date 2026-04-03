import Foundation

struct AppEnvironment {
    let apiClient: APIClient
    let backendBaseURL: String

    static let mock = AppEnvironment(apiClient: MockAPIClient(), backendBaseURL: "Mock backend")

    static func live(baseURL: URL, apiKey: String?) -> AppEnvironment {
        AppEnvironment(
            apiClient: LiveAPIClient(baseURL: baseURL, apiKey: apiKey),
            backendBaseURL: baseURL.absoluteString
        )
    }
}
