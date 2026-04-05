import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var discoveredDevices: [BLEDevice] = []
    @Published private(set) var connectionStatus: BLEConnectionStatus = .idle
    @Published private(set) var latestReading: HeartRateReading?
    @Published private(set) var latestMotionReading: MotionTelemetryReading?
    @Published private(set) var activeSession: SessionRecord?
    @Published private(set) var diagnostics = DiagnosticsSnapshot.empty
    @Published private(set) var isStartingSession = false
    @Published private(set) var isEndingSession = false
    @Published private(set) var sessionFeedback: String?
    @Published var athleteId = ""
    @Published var eventId = ""
    @Published var notes = ""

    let bleManager: BLEHeartRateManager
    let motionManager: MotionTelemetryManager
    let sampleStore: FileSampleStore
    let logStore: FileLogStore
    let environment: AppEnvironment
    let uploadWorker: UploadWorker

    init(environment: AppEnvironment, sampleStore: FileSampleStore, logStore: FileLogStore) {
        self.environment = environment
        self.sampleStore = sampleStore
        self.logStore = logStore
        self.bleManager = BLEHeartRateManager()
        self.motionManager = MotionTelemetryManager()
        self.uploadWorker = UploadWorker(apiClient: environment.apiClient, sampleStore: sampleStore, logStore: logStore)
        self.uploadWorker.onStatusChange = { [weak self] state, sessionId, timestamp, error in
            guard let self else { return }
            await MainActor.run {
                self.diagnostics.uploadState = state
                self.diagnostics.lastUploadSessionId = sessionId ?? self.diagnostics.lastUploadSessionId
                self.diagnostics.lastUploadAt = timestamp ?? self.diagnostics.lastUploadAt
                if let error {
                    self.diagnostics.lastError = error
                }
            }
        }
    }

    func bootstrap() async {
        await sampleStore.loadFromDisk()
        activeSession = await sampleStore.activeSession()
        diagnostics.pendingSamples = await sampleStore.pendingSampleCount()
        bindBLECallbacks()
        if let activeSession {
            startMotionTracking(for: activeSession)
        }
        uploadWorker.start()
        uploadWorker.wake()
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
            startMotionTracking(for: session)
            uploadWorker.wake()
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
            motionManager.stop()
            latestMotionReading = nil
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
        let activeSession = await sampleStore.activeSession()
        snapshot.pendingSamples = if let sessionId = activeSession?.sessionId {
            await sampleStore.pendingSampleCount(sessionId: sessionId)
        } else {
            await sampleStore.pendingSampleCount()
        }
        snapshot.lastAckedSequence = await sampleStore.latestAckedSequence()
        snapshot.activeSessionId = activeSession?.sessionId
        snapshot.strapName = bleManager.connectedDeviceName
        snapshot.connectionStatus = connectionStatus
        snapshot.currentBPM = latestReading?.bpm
        snapshot.currentSteps = latestMotionReading?.steps ?? latestReading?.steps
        snapshot.lastSampleAt = latestReading?.phoneObservedAt
        snapshot.backendBaseURL = environment.backendBaseURL
        snapshot.motionStatus = motionManager.status
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
                let enrichedReading = await MainActor.run {
                    self.enriched(reading: reading)
                }
                await self.sampleStore.append(reading: enrichedReading)
                let rrCount = reading.rrIntervalsMs?.count ?? 0
                let rmssd = reading.rmssd.map { " rmssd=\($0)" } ?? ""
                let sdnn = reading.sdnn.map { " sdnn=\($0)" } ?? ""
                let steps = enrichedReading.steps.map { " steps=\($0)" } ?? ""
                await self.logStore.append("HR sample seq=\(reading.sampleSeq) bpm=\(reading.bpm)\(steps) rrCount=\(rrCount)\(rmssd)\(sdnn)")
                await MainActor.run {
                    self.latestReading = enrichedReading
                }
                self.uploadWorker.wake()
                await self.refreshDiagnostics()
            }
        }

        motionManager.onUpdate = { [weak self] reading in
            guard let self else { return }
            Task { @MainActor in
                self.latestMotionReading = reading
                await self.refreshDiagnostics()
            }
        }

        bleManager.onLog = { [weak self] line in
            Task {
                await self?.logStore.append(line)
            }
        }

        motionManager.onLog = { [weak self] line in
            Task {
                await self?.logStore.append(line)
            }
        }
    }

    private func startMotionTracking(for session: SessionRecord) {
        let sessionStart = session.clientStartedAt ?? session.createdAt
        motionManager.start(from: sessionStart)
    }

    private func enriched(reading: HeartRateReading) -> HeartRateReading {
        HeartRateReading(
            sampleSeq: reading.sampleSeq,
            bpm: reading.bpm,
            rrIntervalsMs: reading.rrIntervalsMs,
            rmssd: reading.rmssd,
            sdnn: reading.sdnn,
            deviceObservedAt: reading.deviceObservedAt,
            phoneObservedAt: reading.phoneObservedAt,
            steps: latestMotionReading?.steps
        )
    }
}

private extension String {
    var nilIfBlank: String? {
        trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self
    }
}
