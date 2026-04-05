import Foundation
import Network

final class UploadWorker: @unchecked Sendable {
    private let apiClient: APIClient
    private let sampleStore: FileSampleStore
    private let logStore: FileLogStore
    private let pathMonitor = NWPathMonitor()
    private let pathQueue = DispatchQueue(label: "hrrelay.uploadworker.network")
    private var task: Task<Void, Never>?
    private var networkAvailable = true
    private var nextAttemptAt = Date.distantPast
    var onStatusChange: (@Sendable (String, String?, Date?, String?) async -> Void)?

    init(apiClient: APIClient, sampleStore: FileSampleStore, logStore: FileLogStore) {
        self.apiClient = apiClient
        self.sampleStore = sampleStore
        self.logStore = logStore
        pathMonitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let available = path.status == .satisfied
            self.networkAvailable = available
            if available {
                self.nextAttemptAt = .distantPast
                Task {
                    await self.logStore.append("Network restored, resuming uploads")
                    await self.onStatusChange?("Network restored", nil, nil, nil)
                }
            } else {
                Task {
                    await self.logStore.append("Network unavailable, upload queue paused")
                    await self.onStatusChange?("Waiting for network", nil, nil, nil)
                }
            }
        }
    }

    func start() {
        guard task == nil else { return }
        pathMonitor.start(queue: pathQueue)
        task = Task {
            await loop()
        }
    }

    func wake() {
        nextAttemptAt = .distantPast
    }

    private func loop() async {
        var backoffNs: UInt64 = 1_000_000_000

        while !Task.isCancelled {
            do {
                guard let session = await sampleStore.activeSession() else {
                    await onStatusChange?("Idle", nil, nil, nil)
                    try await Task.sleep(nanoseconds: 2_000_000_000)
                    continue
                }

                let pending = await sampleStore.pendingSamples(sessionId: session.sessionId, limit: 25)
                guard pending.isEmpty == false else {
                    await onStatusChange?("Connected", session.sessionId, nil, nil)
                    try await Task.sleep(nanoseconds: 2_000_000_000)
                    continue
                }

                if !networkAvailable {
                    await onStatusChange?("Waiting for network", session.sessionId, nil, nil)
                    try await Task.sleep(nanoseconds: 1_000_000_000)
                    continue
                }

                let now = Date()
                if now < nextAttemptAt {
                    let remainingNs = UInt64(max(0.25, nextAttemptAt.timeIntervalSince(now)) * 1_000_000_000)
                    try await Task.sleep(nanoseconds: remainingNs)
                    continue
                }

                await onStatusChange?("Uploading \(pending.count)", session.sessionId, nil, nil)
                let ack = try await apiClient.uploadSamples(sessionId: session.sessionId, samples: pending)
                await sampleStore.markAcknowledged(sessionId: session.sessionId, through: ack.acceptedThroughSeq)
                await logStore.append("Uploaded batch count=\(pending.count) throughSeq=\(ack.acceptedThroughSeq)")
                await onStatusChange?("Uploaded through \(ack.acceptedThroughSeq)", session.sessionId, ack.serverReceivedAt, nil)
                backoffNs = 1_000_000_000
                nextAttemptAt = .distantPast
            } catch {
                await logStore.append("Upload failed: \(error.localizedDescription)")
                await onStatusChange?("Upload failed", nil, nil, error.localizedDescription)
                nextAttemptAt = Date().addingTimeInterval(Double(backoffNs) / 1_000_000_000)
                try? await Task.sleep(nanoseconds: min(backoffNs, 2_000_000_000))
                backoffNs = min(backoffNs * 2, 10_000_000_000)
            }
        }
    }
}
