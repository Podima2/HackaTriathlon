## Chainlink CRE Integration

Target architecture:

`iPhone relay -> Supabase-backed telemetry API -> Chainlink CRE -> onchain telemetry feed -> frontend`

### CRE read API

These routes are exposed by the backend and are intended for CRE HTTP reads:

- `GET /api/cre`
  Simple route index.

- `GET /api/cre/sessions/current`
  Returns the newest active sampled session.

- `GET /api/cre/sessions/:sessionId/latest-snapshot?bucketMs=5000&staleAfterMs=10000`
  Returns the latest HR sample for a session plus:
  - `sessionIdHash`
  - `bucketStartMs`
  - `stale`
  - `dataAgeMs`

- `GET /api/cre/sessions/current/latest-snapshot?bucketMs=5000&staleAfterMs=10000`
  Convenience route for the current active sampled session.

- `GET /api/cre/sessions/:sessionId/interval-close?intervalStartMs=300000&intervalMs=300000`
  Returns the official close value for an interval using:
  - close rule: `latest-sample-at-or-before-interval-end`

- `GET /api/cre/sessions/current/interval-close?intervalStartMs=300000&intervalMs=300000`
  Convenience route for the current active sampled session.

- `GET /api/cre/markets/:marketId/threshold-settlement`
  Reads the onchain market spec from `PredictionMarket`, resolves telemetry, and returns:
  - `sessionId`
  - `t`
  - `thresholdBpm`
  - `direction`
  - `observedBpm`
  - `value`

### Onchain telemetry feed

`contracts/ChainlinkTelemetryFeed.sol`

Purpose:
- store official snapshot points published by CRE
- store official 5-minute interval closes published by CRE
- give the frontend a chain-first read surface

Core writes:
- `reportSnapshot(...)`
- `reportIntervalClose(...)`

### CRE simulation status

Actual CRE workflow scaffold now lives under:

- [cre-workflows](/Users/agustinschiariti/Desktop/PreCannes/cre-workflows)
- [snapshot-publisher/main.ts](/Users/agustinschiariti/Desktop/PreCannes/cre-workflows/snapshot-publisher/main.ts)
- [snapshot-publisher/workflow.ts](/Users/agustinschiariti/Desktop/PreCannes/cre-workflows/snapshot-publisher/workflow.ts)

CRE-compatible consumer deployed on Base Sepolia:

- `CRETelemetryReceiver`: `0x1D5F0dFC9DBbD2C35a14A663D29Bc951d9754E78`

Successful CRE CLI simulation with `--broadcast`:

- tx: `0xb2176a12ce3cceb745c9d9f1b786ac663c5df8837b1b6a111eb0c8e9b3c75ef5`

Onchain verification of that simulation:

- `latestSnapshots(0xbb4ea88707e60a451a0d9013ebdb197f79730ee90e720a58929f92bfd9364615)`
  - `exists: true`
  - `bucketStartMs: 500000`
  - `sampleElapsedMs: 500338`
  - `reportedAt: 1775336098873`
- `sampleSeq: 12350`
- `bpm: 79`

### Local CRE automation

Single command:

```bash
npm run cre:autopilot
```

What it does:

- runs the real CRE CLI snapshot workflow on a loop
- keeps interval market generation running
- keeps threshold settlement running
- leaves the frontend as a read-only chain consumer for the live interval feed

Operational split:

- Supabase / Railway:
  - raw telemetry history
  - CRE read endpoints
- CRE automation:
  - snapshot publication onchain
  - interval close publication onchain
  - threshold settlement publication onchain
- frontend:
  - reads the chain-backed interval feed and market state

Recommended CRE workflows:

1. Live snapshot workflow
- trigger: cron every 5s / 10s / 15s
- read: `/api/cre/sessions/:sessionId/latest-snapshot`
- write: `reportSnapshot(...)`

2. Interval close workflow
- trigger: cron every minute
- read: `/api/cre/sessions/:sessionId/interval-close`
- write: `reportIntervalClose(...)`

3. Threshold settlement workflow
- trigger: `SettlementRequested` event from `PredictionMarket`
- read: `/api/cre/markets/:marketId/threshold-settlement`
- write: `PredictionMarket.fulfillSettlement(...)`

### Manual publisher scripts

Until CRE deploy access is available, you can test the full flow with these scripts:

- Latest snapshot to onchain feed:

```bash
npm run cre:publish-snapshot
```

- Latest closed 5-minute interval to onchain feed:

```bash
npm run cre:publish-interval-close
```

- Settle a threshold market from the CRE settlement route:

```bash
MARKET_ID=<id> npm run cre:settle-threshold
```

- Continuous local CRE-style loop:

```bash
npm run cre:runner
```

Optional environment variables:
- `SESSION_ID`
- `INTERVAL_START_MS`
- `INTERVAL_MS`
- `SNAPSHOT_BUCKET_MS`
- `STALE_AFTER_MS`
- `ALLOW_STALE=true`
- `CRE_RUNNER_POLL_MS`
- `CRE_RUNNER_INTERVAL_MARKETS=true|false`
- `CRE_RUNNER_SETTLE_THRESHOLD=true|false`

### Example payloads

Latest snapshot:

```json
{
  "ok": true,
  "sessionId": "5337f5ce-35d7-458a-a120-21bbf088e782",
  "sessionIdHash": "0x...",
  "bucketMs": 5000,
  "staleAfterMs": 10000,
  "stale": false,
  "dataAgeMs": 1820,
  "snapshot": {
    "bucketStartMs": 30000,
    "bpm": 82,
    "sampleSeq": 91,
    "sampleElapsedMs": 31284,
    "phoneObservedAt": "2026-04-04T21:14:09.750Z",
    "serverReceivedAt": "2026-04-04T21:14:09.901Z"
  }
}
```

Interval close:

```json
{
  "ok": true,
  "sessionId": "5337f5ce-35d7-458a-a120-21bbf088e782",
  "sessionIdHash": "0x...",
  "closeRule": "latest-sample-at-or-before-interval-end",
  "intervalStartMs": 300000,
  "intervalEndMs": 600000,
  "result": {
    "value": 87,
    "sampleSeq": 590,
    "sampleElapsedMs": 599211,
    "withinInterval": true
  }
}
```
