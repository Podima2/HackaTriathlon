# Plan v2: HR + Pedometer Telemetry Collection

## Context

The HRRelay iOS app currently collects heart rate from a BLE chest strap.

To strengthen the Arc prediction market bounty submission, the cheapest useful additions are:

- RR intervals from the existing BLE heart rate measurement
- Derived HRV metrics from those RR intervals
- Pedometer-based steps, cadence, and pace-like motion signals from the phone

This plan intentionally excludes GPS. It adds cost, permissions, battery risk, and privacy risk without being necessary for the current MVP.

Important correction: the app handles BPM today, but it does **not** yet extract RR intervals or compute HRV.

---

## MVP Scope

### Phase 1: RR intervals + HRV

Use the existing BLE heart rate stream to extract RR intervals and compute short-window HRV metrics.

Why first:

- Zero new permissions
- No new Apple entitlements
- No new UX prompts
- Highest signal-to-effort ratio
- Fits naturally into the current BLE pipeline

### Phase 2: Pedometer

Use `CMPedometer` to collect:

- cumulative steps
- current cadence
- current pace when available
- pedometer-estimated distance when available
- floors ascended / descended when available

Why second:

- One extra permission only
- No GPS/privacy concern
- Useful for pace and movement predictions
- Reasonable implementation complexity

### Explicitly out of scope for MVP

- GPS speed/distance/location
- HealthKit active calories
- FFT-based HRV metrics such as LF/HF
- Background workout-grade location collection

---

## Data Sources

### 1. BLE Heart Rate Measurement: RR intervals

The BLE Heart Rate Measurement characteristic (`0x2A37`) may include RR intervals when the strap supports them.

Current state:

- `BLEHeartRateManager.parseHeartRateMeasurement()` currently returns BPM only
- RR intervals are ignored

Implementation:

- Parse heart rate exactly as today
- Check flag bit 4 for RR presence
- Read trailing `UInt16` RR values in units of `1/1024` second
- Convert to milliseconds
- Attach `[Double]` RR interval values to `HeartRateReading`

### 2. CoreMotion: Pedometer

Use `CMPedometer`.

Start behavior:

- Call `startUpdates(from: sessionStartDate)` when the HRRelay session starts
- Stop updates when the session ends

Fields to consume from `CMPedometerData`:

- `numberOfSteps`
- `distance`
- `currentPace`
- `currentCadence`
- `floorsAscended`
- `floorsDescended`

Notes:

- `currentPace` and `distance` are optional and device/activity dependent
- Pedometer values should be treated as best-effort telemetry, not workout-grade truth

---

## Derived Metrics

### HRV from RR intervals

MVP metrics:

- `RMSSD`
- `SDNN`

Window:

- 30-second sliding window on-device

Behavior:

- If RR intervals are absent from the strap payload, leave `rrIntervalsMs`, `rmssd`, and `sdnn` as `nil`
- Keep BPM collection working exactly as it does today

Defer:

- `pNN50`
- `LF/HF`
- recovery heuristics beyond simple backend-side analysis

### Pedometer-derived calories

Optional in Phase 2, not required for initial pedometer shipping.

If included, calculate only a rough estimate from distance/cadence and clearly treat it as estimated. Do not present it as device-measured calories.

---

## Data Model Changes

### Extend `HeartRateReading`

```swift
struct HeartRateReading: Codable, Equatable {
    let sampleSeq: Int
    let bpm: Int
    let rrIntervalsMs: [Double]?
    let rmssd: Double?
    let sdnn: Double?
    let deviceObservedAt: Date?
    let phoneObservedAt: Date
}
```

### Add `MotionReading`

```swift
struct MotionReading: Codable, Equatable {
    let sampleSeq: Int
    let phoneObservedAt: Date
    let elapsedMsSinceSessionStart: Int

    let steps: Int
    let pedometerDistanceMeters: Double?
    let currentPaceSecPerMeter: Double?
    let currentCadenceStepsPerSec: Double?
    let floorsAscended: Int?
    let floorsDescended: Int?

    let estimatedActiveKcal: Double?
}
```

Important: `MotionReading.sampleSeq` is a motion-sequence number, not part of the HR sequence.

---

## Queue and Ack Strategy

This is the part that must stay explicit.

Do **not** mix HR and motion samples inside one queue item type with one shared ack cursor.

Use two queues:

- `QueuedHeartRateSample`
- `QueuedMotionSample`

Use two payloads/endpoints:

- existing HR upload path for heart rate samples
- `/api/upload-motion` for motion samples

Use two ack cursors:

- `acceptedHeartRateThroughSeq`
- `acceptedMotionThroughSeq`

Why:

- HR and pedometer samples arrive at different cadences
- They may upload in different batch sizes
- Separate ack cursors prevent one telemetry type from blocking or incorrectly acknowledging the other
- Logs can still share the same session ID and timestamp alignment without sharing sequence numbers

The metrics do not become “mixed” in a harmful way if they are stored separately and aligned by:

- `sessionId`
- `elapsedMsSinceSessionStart`
- `phoneObservedAt`

That is enough to correlate them later without coupling transport semantics.

---

## Fallback Behavior

### Strap has no RR intervals

- Continue collecting BPM
- Set RR/HRV fields to `nil`
- Do not fail the session

### User denies Motion & Fitness permission

- Continue running HR-only session
- Do not block session start
- Surface a diagnostics/log message that pedometer telemetry is unavailable

### Pedometer fields are unavailable on a device/activity

- Store `nil` for unavailable optional fields
- Keep steps if steps are available

---

## Files

### New files

- `ios/HRRelay/Sources/Motion/PedometerManager.swift`
- `ios/HRRelay/Sources/Domain/HRVComputer.swift`

### Modified files

- `ios/HRRelay/Sources/BLE/BLEHeartRateManager.swift`
- `ios/HRRelay/Sources/Domain/Models.swift`
- `ios/HRRelay/Sources/App/AppModel.swift`
- `ios/HRRelay/Sources/Data/FileSampleStore.swift`
- `ios/HRRelay/Sources/Networking/APIClient.swift`
- `ios/HRRelay/Sources/Networking/UploadWorker.swift`
- `ios/HRRelay/Config/Info.plist`

Potential store-model addition:

- add a separate motion queue model alongside the existing queued HR sample model

---

## Sampling Strategy

### HR

- Keep the current BLE notification cadence
- Compute HRV from the most recent 30 seconds of RR intervals

### Pedometer

- Accept `CMPedometer` callback cadence as delivered
- Normalize into one `MotionReading` every 1 to 2 seconds if needed for cleaner upload batching
- Compute `elapsedMsSinceSessionStart` using the same session-start anchor as HR

---

## Permissions

Only one new permission is required for this v2 plan:

- `NSMotionUsageDescription`

Suggested copy:

`HRRelay uses motion data to track steps, cadence, and pace-related movement during your session.`

No location permissions should be added in this version.

---

## Implementation Order

1. RR interval extraction in `BLEHeartRateManager`
2. `HRVComputer` with 30-second sliding window for `RMSSD` and `SDNN`
3. Extend HR models, queue payloads, and upload path for RR/HRV fields
4. Add `PedometerManager`
5. Add motion queue, motion payload, and separate motion upload ack path
6. Add diagnostics/logging for pedometer availability and permission state

---

## Cost / Difficulty Assessment

### Cheapest addition: RR intervals

This is the cheapest implementation by a clear margin.

Why:

- It modifies one existing acquisition path instead of adding a new subsystem
- No new permission flow
- No Info.plist churn beyond what already exists
- No new OS framework lifecycle to manage beyond BLE
- No privacy copy or feature gating

Expected difficulty: low to medium.

Most of the work is:

- BLE payload parsing
- a small HRV utility
- extending persistence and upload models

### Pedometer inclusion

Pedometer is still reasonable, but it is materially more work than RR extraction.

Expected difficulty: medium.

Main work items:

- add `CMPedometer` manager lifecycle
- request and handle Motion & Fitness authorization
- start/stop with session lifecycle
- map pedometer callbacks into a stable `MotionReading`
- add a second queue and second upload path
- handle optional/unavailable pedometer fields cleanly

What makes pedometer harder is not the API itself. `CMPedometer` is straightforward. The real cost is integrating a second telemetry stream into storage, upload, diagnostics, and fallback behavior without corrupting the clean semantics of the current HR pipeline.

---

## Verification

1. Run on a physical iPhone
2. Start a session with a strap that supports RR intervals
3. Confirm BPM continues to stream normally
4. Confirm RR intervals appear when available
5. Confirm `RMSSD` and `SDNN` populate after enough RR history accumulates
6. Start a session with pedometer permission granted and walk for 1 to 2 minutes
7. Confirm steps increase and cadence/pace fields populate when available
8. Confirm HR uploads and motion uploads acknowledge independently
9. Confirm session still works correctly when motion permission is denied
