import Foundation

final class UploadWorker: @unchecked Sendable {
    private let apiClient: APIClient
    private let sampleStore: FileSampleStore
    private let logStore: FileLogStore
    private var task: Task<Void, Never>?

    init(apiClient: APIClient, sampleStore: FileSampleStore, logStore: FileLogStore) {
        self.apiClient = apiClient
        self.sampleStore = sampleStore
        self.logStore = logStore
    }

    func start() {
        guard task == nil else { return }
        task = Task {
            await loop()
        }
    }

    private func loop() async {
        var backoffNs: UInt64 = 3_000_000_000

        while !Task.isCancelled {
            do {
                guard let session = await sampleStore.activeSession() else {
                    try await Task.sleep(nanoseconds: 2_000_000_000)
                    continue
                }

                let pending = await sampleStore.pendingSamples(limit: 25)
                guard pending.isEmpty == false else {
                    try await Task.sleep(nanoseconds: 2_000_000_000)
                    continue
                }

                let ack = try await apiClient.uploadSamples(sessionId: session.sessionId, samples: pending)
                await sampleStore.markAcknowledged(sessionId: session.sessionId, through: ack.acceptedThroughSeq)
                await logStore.append("Uploaded batch count=\(pending.count) throughSeq=\(ack.acceptedThroughSeq)")
                backoffNs = 3_000_000_000
            } catch {
                await logStore.append("Upload failed: \(error.localizedDescription)")
                try? await Task.sleep(nanoseconds: backoffNs)
                backoffNs = min(backoffNs * 2, 60_000_000_000)
            }
        }
    }
}
