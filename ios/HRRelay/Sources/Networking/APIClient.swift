import Foundation

protocol APIClient: Sendable {
    func createSession(draft: SessionDraft) async throws -> SessionRecord
    func uploadSamples(sessionId: String, samples: [QueuedSample]) async throws -> SampleBatchAck
    func finalizeSession(sessionId: String) async throws
    func sessionStatus(sessionId: String) async throws -> SessionStatusResponse
}

struct LiveAPIClient: APIClient {
    let baseURL: URL
    let apiKey: String?

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(DateCoder.string(from: date))
        }
        return encoder
    }()

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            guard let date = DateCoder.date(from: value) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date string: \(value)")
            }
            return date
        }
        return decoder
    }()

    func createSession(draft: SessionDraft) async throws -> SessionRecord {
        var request = makeRequest(path: "sessions", method: "POST")
        request.httpMethod = "POST"
        request.httpBody = try encoder.encode(draft)

        let data = try await send(request)
        return try decode(SessionRecord.self, from: data)
    }

    func uploadSamples(sessionId: String, samples: [QueuedSample]) async throws -> SampleBatchAck {
        var request = makeRequest(path: "sessions/\(sessionId)/samples", method: "POST")
        let payload = SampleBatchPayload(samples: samples.map {
            SamplePayload(
                sampleSeq: $0.sampleSeq,
                bpm: $0.bpm,
                deviceObservedAt: $0.deviceObservedAt,
                phoneObservedAt: $0.phoneObservedAt,
                elapsedMsSinceSessionStart: $0.elapsedMsSinceSessionStart
            )
        })
        request.httpBody = try encoder.encode(payload)

        let data = try await send(request)
        return try decode(SampleBatchAck.self, from: data)
    }

    func finalizeSession(sessionId: String) async throws {
        let request = makeRequest(path: "sessions/\(sessionId)/finalize", method: "POST")
        _ = try await send(request)
    }

    func sessionStatus(sessionId: String) async throws -> SessionStatusResponse {
        let request = makeRequest(path: "sessions/\(sessionId)/status", method: "GET")
        let data = try await send(request)
        return try decode(SessionStatusResponse.self, from: data)
    }

    private func makeRequest(path: String, method: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let apiKey {
            request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        }
        return request
    }

    private func send(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIClientError.httpError(statusCode: httpResponse.statusCode, body: body)
        }
        return data
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            let body = String(data: data, encoding: .utf8) ?? "<non-utf8 body>"
            throw APIClientError.decodingError(body)
        }
    }
}

enum DateCoder {
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let plainFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func date(from value: String) -> Date? {
        fractionalFormatter.date(from: value) ?? plainFormatter.date(from: value)
    }

    static func string(from date: Date) -> String {
        fractionalFormatter.string(from: date)
    }
}

actor MockAPIClient: APIClient {
    private var sessions: [String: SessionRecord] = [:]
    private var acceptedSequence: [String: Int] = [:]

    func createSession(draft: SessionDraft) async throws -> SessionRecord {
        let sessionId = UUID().uuidString.lowercased()
        let session = SessionRecord(
            sessionId: sessionId,
            athleteId: draft.athleteId,
            eventId: draft.eventId,
            notes: draft.notes,
            createdAt: Date(),
            eventTimezone: draft.eventTimezone,
            eventUtcOffsetSeconds: draft.eventUtcOffsetSeconds,
            clientStartedAt: draft.clientStartedAt,
            status: "active"
        )
        sessions[sessionId] = session
        acceptedSequence[sessionId] = 0
        return session
    }

    func uploadSamples(sessionId: String, samples: [QueuedSample]) async throws -> SampleBatchAck {
        let maxSeq = samples.map(\.sampleSeq).max() ?? acceptedSequence[sessionId] ?? 0
        acceptedSequence[sessionId] = maxSeq
        return SampleBatchAck(acceptedThroughSeq: maxSeq, serverReceivedAt: Date())
    }

    func finalizeSession(sessionId: String) async throws {
        guard let session = sessions[sessionId] else { return }
        sessions[sessionId] = SessionRecord(
            sessionId: session.sessionId,
            athleteId: session.athleteId,
            eventId: session.eventId,
            notes: session.notes,
            createdAt: session.createdAt,
            eventTimezone: session.eventTimezone,
            eventUtcOffsetSeconds: session.eventUtcOffsetSeconds,
            clientStartedAt: session.clientStartedAt,
            status: "finalized"
        )
    }

    func sessionStatus(sessionId: String) async throws -> SessionStatusResponse {
        SessionStatusResponse(
            latestAckedSeq: acceptedSequence[sessionId],
            pendingCount: 0,
            status: sessions[sessionId]?.status ?? "unknown"
        )
    }
}
