import Foundation

struct BLEDevice: Identifiable, Equatable {
    let id: UUID
    let name: String
    let rssi: Int?
}

enum BLEConnectionStatus: String {
    case idle
    case scanning
    case connecting
    case connected
    case disconnected
    case unauthorized
    case unavailable
    case failed
}

struct HeartRateReading: Codable, Equatable {
    let sampleSeq: Int
    let bpm: Int
    let deviceObservedAt: Date?
    let phoneObservedAt: Date
}

struct SessionDraft: Codable {
    let athleteId: String?
    let eventId: String?
    let notes: String?
    let eventTimezone: String
    let eventUtcOffsetSeconds: Int
    let clientStartedAt: Date
}

struct SessionRecord: Codable, Equatable {
    let sessionId: String
    let athleteId: String?
    let eventId: String?
    let notes: String?
    let createdAt: Date
    let eventTimezone: String?
    let eventUtcOffsetSeconds: Int?
    let clientStartedAt: Date?
    let status: String
}

struct QueuedSample: Codable, Equatable, Identifiable {
    let id: UUID
    let sessionId: String
    let sampleSeq: Int
    let bpm: Int
    let deviceObservedAt: Date?
    let phoneObservedAt: Date
    let elapsedMsSinceSessionStart: Int
    var acked: Bool
}

struct SampleBatchPayload: Codable {
    let samples: [SamplePayload]
}

struct SamplePayload: Codable {
    let sampleSeq: Int
    let bpm: Int
    let deviceObservedAt: Date?
    let phoneObservedAt: Date
    let elapsedMsSinceSessionStart: Int
}

struct SampleBatchAck: Codable {
    let acceptedThroughSeq: Int
    let serverReceivedAt: Date
}

struct SessionStatusResponse: Codable {
    let latestAckedSeq: Int?
    let pendingCount: Int
    let status: String
}

struct DiagnosticsSnapshot {
    var strapName: String?
    var connectionStatus: BLEConnectionStatus = .idle
    var currentBPM: Int?
    var pendingSamples: Int = 0
    var lastAckedSequence: Int?
    var activeSessionId: String?
    var lastSampleAt: Date?
    var lastError: String?
    var backendBaseURL: String?

    static let empty = DiagnosticsSnapshot()
}

enum APIClientError: LocalizedError {
    case invalidResponse
    case httpError(statusCode: Int, body: String)
    case decodingError(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Server returned an invalid response."
        case let .httpError(statusCode, body):
            return body.isEmpty ? "Server error \(statusCode)" : "Server error \(statusCode): \(body)"
        case let .decodingError(body):
            return "Could not decode server response: \(body)"
        }
    }
}
