import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var discoveredDevices: [BLEDevice] = []
    @Published private(set) var connectionStatus: BLEConnectionStatus = .idle
    @Published private(set) var latestReading: HeartRateReading?
    @Published private(set) var activeSession: SessionRecord?
    @Published private(set) var diagnostics = DiagnosticsSnapshot.empty
    @Published private(set) var isStartingSession = false
    @Published private(set) var isEndingSession = false
    @Published private(set) var sessionFeedback: String?
    @Published var athleteId = ""
    @Published var eventId = ""
    @Published var notes = ""

    let bleManager: BLEHeartRateManager
    let sampleStore: FileSampleStore
    let logStore: FileLogStore
    let environment: AppEnvironment
    let uploadWorker: UploadWorker

    init(environment: AppEnvironment, sampleStore: FileSampleStore, logStore: FileLogStore) {
        self.environment = environment
        self.sampleStore = sampleStore
        self.logStore = logStore
        self.bleManager = BLEHeartRateManager()
        self.uploadWorker = UploadWorker(apiClient: environment.apiClient, sampleStore: sampleStore, logStore: logStore)
    }

    func bootstrap() async {
        await sampleStore.loadFromDisk()
        activeSession = await sampleStore.activeSession()
        diagnostics.pendingSamples = await sampleStore.pendingSampleCount()
        bindBLECallbacks()
        uploadWorker.start()
        await refreshDiagnostics()
    }

    func startScan() {
        bleManager.startScan()
    }

    func stopScan() {
        bleManager.stopScan()
    }

    func connect(to device: BLEDevice) {
        bleManager.connect(to: device.id)
    }

    func disconnect() {
        bleManager.disconnect()
    }

    func startSession() async {
        guard activeSession == nil else { return }
        isStartingSession = true
        sessionFeedback = nil

        let draft = SessionDraft(
            athleteId: athleteId.nilIfBlank,
            eventId: eventId.nilIfBlank,
            notes: notes.nilIfBlank,
            eventTimezone: TimeZone.current.identifier,
            eventUtcOffsetSeconds: TimeZone.current.secondsFromGMT(),
            clientStartedAt: Date()
        )

        do {
            let session = try await environment.apiClient.createSession(draft: draft)
            await sampleStore.activateSession(session)
            activeSession = session
            await logStore.append("Started session \(session.sessionId)")
            sessionFeedback = "Session started"
            await refreshDiagnostics()
        } catch {
            await logStore.append("Failed to create session: \(error.localizedDescription)")
            var snapshot = diagnostics
            snapshot.lastError = error.localizedDescription
            diagnostics = snapshot
            sessionFeedback = error.localizedDescription
        }
        isStartingSession = false
    }

    func endSession() async {
        guard let session = activeSession else { return }
        isEndingSession = true
        sessionFeedback = nil

        do {
            try await environment.apiClient.finalizeSession(sessionId: session.sessionId)
            await sampleStore.finalizeSession(sessionId: session.sessionId)
            activeSession = nil
            await logStore.append("Finalized session \(session.sessionId)")
            sessionFeedback = "Session ended"
            await refreshDiagnostics()
        } catch {
            await logStore.append("Failed to finalize session: \(error.localizedDescription)")
            var snapshot = diagnostics
            snapshot.lastError = error.localizedDescription
            diagnostics = snapshot
            sessionFeedback = error.localizedDescription
        }
        isEndingSession = false
    }

    func exportLogs() async -> URL? {
        await logStore.exportLogs()
    }

    func refreshDiagnostics() async {
        var snapshot = diagnostics
        snapshot.pendingSamples = await sampleStore.pendingSampleCount()
        snapshot.lastAckedSequence = await sampleStore.latestAckedSequence()
        snapshot.activeSessionId = await sampleStore.activeSession()?.sessionId
        snapshot.strapName = bleManager.connectedDeviceName
        snapshot.connectionStatus = connectionStatus
        snapshot.currentBPM = latestReading?.bpm
        snapshot.lastSampleAt = latestReading?.phoneObservedAt
        snapshot.backendBaseURL = environment.backendBaseURL
        diagnostics = snapshot
    }

    private func bindBLECallbacks() {
        bleManager.onDevicesChanged = { [weak self] devices in
            Task { @MainActor in
                self?.discoveredDevices = devices
            }
        }

        bleManager.onConnectionStatusChanged = { [weak self] status in
            Task { @MainActor in
                self?.connectionStatus = status
                await self?.refreshDiagnostics()
            }
        }

        bleManager.onReading = { [weak self] reading in
            guard let self else { return }
            Task {
                await self.sampleStore.append(reading: reading)
                await self.logStore.append("HR sample seq=\(reading.sampleSeq) bpm=\(reading.bpm)")
                await MainActor.run {
                    self.latestReading = reading
                }
                await self.refreshDiagnostics()
            }
        }

        bleManager.onLog = { [weak self] line in
            Task {
                await self?.logStore.append(line)
            }
        }
    }
}

private extension String {
    var nilIfBlank: String? {
        trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self
    }
}
