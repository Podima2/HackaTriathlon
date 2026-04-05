import CoreMotion
import Foundation

@MainActor
final class MotionTelemetryManager {
    var onUpdate: ((MotionTelemetryReading) -> Void)?
    var onLog: ((String) -> Void)?

    private let pedometer = CMPedometer()
    private(set) var latestReading: MotionTelemetryReading?
    private(set) var status: String = CMPedometer.isStepCountingAvailable() ? "Idle" : "Unavailable"
    private var activeStart: Date?

    func start(from startDate: Date) {
        stop(resetLatestReading: false)

        guard CMPedometer.isStepCountingAvailable() else {
            status = "Unavailable"
            onLog?("Step telemetry unavailable on this device")
            return
        }

        activeStart = startDate
        status = "Tracking steps"
        onLog?("Starting step telemetry from \(DateCoder.string(from: startDate))")

        pedometer.startUpdates(from: startDate) { [weak self] data, error in
            guard let self else { return }
            Task { @MainActor in
                if let error {
                    self.status = "Failed"
                    self.onLog?("Step telemetry failed: \(error.localizedDescription)")
                    return
                }

                guard let data else {
                    return
                }

                let reading = MotionTelemetryReading(
                    steps: max(0, data.numberOfSteps.intValue),
                    phoneObservedAt: Date()
                )
                self.latestReading = reading
                self.status = "Tracking steps"
                self.onUpdate?(reading)
            }
        }
    }

    func stop(resetLatestReading: Bool = true) {
        pedometer.stopUpdates()
        activeStart = nil
        if resetLatestReading {
            latestReading = nil
        }
        status = CMPedometer.isStepCountingAvailable() ? "Idle" : "Unavailable"
    }
}
