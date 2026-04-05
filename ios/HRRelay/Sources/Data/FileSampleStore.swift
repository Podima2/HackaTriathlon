import Foundation

actor FileSampleStore {
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let baseDirectory: URL
    private let queueURL: URL
    private let sessionURL: URL

    private var queue: [QueuedSample] = []
    private var currentSession: SessionRecord?

    init(baseDirectory: URL? = nil) {
        let root = baseDirectory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        self.baseDirectory = root.appendingPathComponent("HRRelay", isDirectory: true)
        self.queueURL = self.baseDirectory.appendingPathComponent("sample-queue.json")
        self.sessionURL = self.baseDirectory.appendingPathComponent("active-session.json")
        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    func loadFromDisk() async {
        try? FileManager.default.createDirectory(at: baseDirectory, withIntermediateDirectories: true, attributes: nil)

        if let data = try? Data(contentsOf: queueURL),
           let decoded = try? decoder.decode([QueuedSample].self, from: data) {
            queue = decoded
        }

        if let data = try? Data(contentsOf: sessionURL),
           let decoded = try? decoder.decode(SessionRecord.self, from: data) {
            currentSession = decoded
        }
    }

    func activateSession(_ session: SessionRecord) async {
        currentSession = session
        await persistSession()
    }

    func activeSession() async -> SessionRecord? {
        currentSession
    }

    func finalizeSession(sessionId: String) async {
        if currentSession?.sessionId == sessionId {
            currentSession = nil
            try? FileManager.default.removeItem(at: sessionURL)
        }
    }

    func append(reading: HeartRateReading) async {
        guard let currentSession else { return }
        let sessionStart = currentSession.clientStartedAt ?? currentSession.createdAt
        let elapsedMs = max(0, Int(reading.phoneObservedAt.timeIntervalSince(sessionStart) * 1000))

        queue.append(QueuedSample(
            id: UUID(),
            sessionId: currentSession.sessionId,
            sampleSeq: reading.sampleSeq,
            bpm: reading.bpm,
            rrIntervalsMs: reading.rrIntervalsMs,
            rmssd: reading.rmssd,
            sdnn: reading.sdnn,
            deviceObservedAt: reading.deviceObservedAt,
            phoneObservedAt: reading.phoneObservedAt,
            steps: reading.steps,
            elapsedMsSinceSessionStart: elapsedMs,
            acked: false
        ))

        await persistQueue()
    }

    func pendingSamples(sessionId: String, limit: Int) async -> [QueuedSample] {
        Array(queue.filter { !$0.acked && $0.sessionId == sessionId }.prefix(limit))
    }

    func markAcknowledged(sessionId: String, through sequence: Int) async {
        queue = queue.map { sample in
            var updated = sample
            if updated.sessionId == sessionId && updated.sampleSeq <= sequence {
                updated.acked = true
            }
            return updated
        }
        await persistQueue()
    }

    func pendingSampleCount() async -> Int {
        queue.filter { !$0.acked }.count
    }

    func pendingSampleCount(sessionId: String) async -> Int {
        queue.filter { !$0.acked && $0.sessionId == sessionId }.count
    }

    func latestAckedSequence() async -> Int? {
        queue.filter(\.acked).map(\.sampleSeq).max()
    }

    private func persistQueue() async {
        guard let data = try? encoder.encode(queue) else { return }
        try? data.write(to: queueURL, options: [.atomic])
    }

    private func persistSession() async {
        guard let currentSession,
              let data = try? encoder.encode(currentSession) else {
            return
        }
        try? data.write(to: sessionURL, options: [.atomic])
    }
}
