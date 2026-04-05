import {
  apiBaseUrl,
  bigintFromNumber,
  env,
  feedAbi,
  fetchJson,
  parimutuelIntervalMarketAbi,
  parimutuelIntervalMarketAddress,
  predictionMarketAbi,
  predictionMarketAddress,
  publicClient,
  telemetryFeedAddress,
  unixSeconds,
  walletClient,
} from "./cre-common.mjs";
import { keccak256, stringToHex } from "viem";

const sessionSelector = process.argv[2] ?? env("SESSION_ID") ?? "current";
const pollMs = Number(env("CRE_RUNNER_POLL_MS", "5000"));
const snapshotBucketMs = Number(env("SNAPSHOT_BUCKET_MS", "5000"));
const staleAfterMs = Number(env("STALE_AFTER_MS", "10000"));
const intervalMs = Number(env("INTERVAL_MS", "300000"));
const autoIntervalMarkets = env("CRE_RUNNER_INTERVAL_MARKETS", "true") === "true";
const autoSettleThreshold = env("CRE_RUNNER_SETTLE_THRESHOLD", "true") === "true";
const autoPublishSnapshot = env("CRE_RUNNER_PUBLISH_SNAPSHOT", "true") === "true";
const telemetryApiKey = env("TELEMETRY_API_KEY", "");

if (!telemetryFeedAddress) {
  throw new Error("Missing CHAINLINK_TELEMETRY_FEED or VITE_CHAINLINK_TELEMETRY_FEED");
}
if (!predictionMarketAddress) {
  throw new Error("Missing PREDICTION_MARKET or VITE_PREDICTION_MARKET");
}
if (!parimutuelIntervalMarketAddress) {
  throw new Error("Missing PARIMUTUEL_INTERVAL_MARKET or VITE_PARIMUTUEL_INTERVAL_MARKET");
}
if (!walletClient.account?.address) {
  throw new Error("Wallet account is not configured");
}

const feedReadAbi = [
  ...feedAbi,
  {
    type: "function",
    name: "latestSnapshots",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "exists", type: "bool" },
      { name: "bucketStartMs", type: "uint64" },
      { name: "sampleElapsedMs", type: "uint64" },
      { name: "reportedAt", type: "uint64" },
      { name: "sampleSeq", type: "uint32" },
      { name: "bpm", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "intervalCloses",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }, { name: "", type: "uint64" }],
    outputs: [
      { name: "exists", type: "bool" },
      { name: "intervalStartMs", type: "uint64" },
      { name: "intervalEndMs", type: "uint64" },
      { name: "sampleElapsedMs", type: "uint64" },
      { name: "reportedAt", type: "uint64" },
      { name: "sampleSeq", type: "uint32" },
      { name: "closeBpm", type: "uint32" },
    ],
  },
];

const seenSnapshotKeys = new Set();
const seenIntervalKeys = new Set();
const seenSettlementKeys = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(event, details = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...details,
  }));
}

async function postJson(path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(telemetryApiKey ? { "x-api-key": telemetryApiKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`Expected JSON from ${path}, received: ${raw.slice(0, 120)}`);
  }
  if (!response.ok) {
    throw new Error(parsed?.error ?? `HTTP ${response.status} for ${path}`);
  }
  return parsed;
}

function signalTypeForMetric(metric) {
  if (metric === "rr") {
    return 7;
  }
  if (metric === "steps") {
    return 3;
  }
  return 0;
}

function intervalRegistryType(metric) {
  if (metric === "rr") return "rr_interval_direction";
  if (metric === "steps") return "steps_interval_direction";
  return "hr_interval_direction";
}

function hashSessionId(sessionId) {
  return keccak256(stringToHex(sessionId));
}

function hashMetricSessionId(sessionId, metric) {
  return metric === "rr" ? hashSessionId(`rr:${sessionId}`) : hashSessionId(sessionId);
}

async function readMarket(marketId) {
  return publicClient.readContract({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: "markets",
    args: [BigInt(marketId)],
  });
}

async function readIntervalMarket(marketId) {
  return publicClient.readContract({
    address: parimutuelIntervalMarketAddress,
    abi: parimutuelIntervalMarketAbi,
    functionName: "markets",
    args: [BigInt(marketId)],
  });
}

async function waitForMarketStatus(marketId, expectedStatus, attempts = 10, delayMs = 600) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const market = await readMarket(marketId);
    if (Number(market[9]) === expectedStatus) {
      return market;
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }
  return readMarket(marketId);
}

async function nextPendingNonce(address = walletClient.account.address) {
  return publicClient.getTransactionCount({
    address,
    blockTag: "pending",
  });
}

async function writeContractWithRetry(requestBuilder, attempts = 3, client = walletClient) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const nonce = await nextPendingNonce(client.account.address);
      const txHash = await client.writeContract({
        ...requestBuilder(),
        nonce,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return txHash;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/nonce too low|replacement transaction underpriced|already known/i.test(message) || attempt === attempts - 1) {
        throw error;
      }
      await sleep(500 + attempt * 250);
    }
  }
  throw lastError ?? new Error("write failed");
}

async function createCurrentIntervalMarket(session, metric = "hr") {
  const intervalStartMs = Math.floor(Number(session.lastElapsedMs ?? 0) / intervalMs) * intervalMs;
  if (!Number.isFinite(intervalStartMs) || intervalStartMs < 0) {
    return { ok: false, created: false, reason: "no-live-interval-yet" };
  }

  const registry = await fetchJson(`/api/interval-markets?sessionId=${encodeURIComponent(session.sessionId)}&metric=${metric}`);
  const existing = (registry.markets ?? []).find((record) => (
    record.metric === metric &&
    record.sessionId === session.sessionId &&
    record.windowStartElapsedMs === intervalStartMs
  ));
  if (existing) {
    return { ok: true, created: false, marketId: existing.marketId, reason: "already-registered" };
  }

  const window = await fetchJson(
    `/api/cre/sessions/${session.sessionId}/interval-window?intervalStartMs=${intervalStartMs}&intervalMs=${intervalMs}&metric=${metric}`,
  );
  if (typeof window.referenceValue !== "number") {
    return { ok: false, created: false, reason: "reference-unavailable" };
  }

  const nextMarketId = await publicClient.readContract({
    address: parimutuelIntervalMarketAddress,
    abi: parimutuelIntervalMarketAbi,
    functionName: "nextMarketId",
  });
  const marketId = Number(nextMarketId);
  const signalType = signalTypeForMetric(metric);
  const sessionIdHash = hashMetricSessionId(session.sessionId, metric);
  const startedAt = new Date(session.clientStartedAt ?? session.createdAt);
  const closesAtTimestamp = Math.floor((startedAt.getTime() + window.intervalEndMs) / 1000);
  if (closesAtTimestamp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, created: false, reason: "interval-already-closed" };
  }

  await writeContractWithRetry(() => ({
    address: parimutuelIntervalMarketAddress,
    abi: parimutuelIntervalMarketAbi,
    functionName: "createIntervalMarket",
    args: [
      sessionIdHash,
      BigInt(window.intervalStartMs),
      BigInt(window.intervalEndMs),
      BigInt(closesAtTimestamp),
      BigInt(window.referenceValue),
      signalType,
    ],
  }));

  const registerPayload = {
    marketId,
    sessionId: session.sessionId,
    metric,
    signalType,
    referenceValue: window.referenceValue,
    windowStartElapsedMs: window.intervalStartMs,
    windowEndElapsedMs: window.intervalEndMs,
    tradingClosesAtTimestamp: closesAtTimestamp,
    createdAt: new Date(startedAt.getTime() + window.intervalStartMs).toISOString(),
  };
  await postJson("/api/interval-markets/register", registerPayload);

  return {
    ok: true,
    created: true,
    metric,
    marketId,
    referenceValue: window.referenceValue,
    intervalStartMs: window.intervalStartMs,
    intervalEndMs: window.intervalEndMs,
  };
}

async function publishLatestSnapshot(sessionId) {
  const payload = await fetchJson(
    `/api/cre/sessions/${sessionId}/latest-snapshot?bucketMs=${snapshotBucketMs}&staleAfterMs=${staleAfterMs}`,
  );
  if (payload.stale) {
    return { ok: false, reason: "stale", dataAgeMs: payload.dataAgeMs };
  }

  const key = `${payload.sessionIdHash}:${payload.snapshot.bucketStartMs}:${payload.snapshot.sampleSeq}`;
  if (seenSnapshotKeys.has(key)) {
    return { ok: true, skipped: "already-published-memory" };
  }

  const latest = await publicClient.readContract({
    address: telemetryFeedAddress,
    abi: feedReadAbi,
    functionName: "latestSnapshots",
    args: [payload.sessionIdHash],
  });
  if (latest[0] && Number(latest[1]) === payload.snapshot.bucketStartMs && Number(latest[4]) === payload.snapshot.sampleSeq) {
    seenSnapshotKeys.add(key);
    return { ok: true, skipped: "already-published-chain" };
  }

  const txHash = await writeContractWithRetry(() => ({
    address: telemetryFeedAddress,
    abi: feedAbi,
    functionName: "reportSnapshot",
    args: [
      payload.sessionIdHash,
      bigintFromNumber(payload.snapshot.bucketStartMs),
      bigintFromNumber(payload.snapshot.sampleElapsedMs),
      payload.snapshot.sampleSeq,
      payload.snapshot.bpm,
      unixSeconds(payload.snapshot.serverReceivedAt ?? payload.snapshot.phoneObservedAt),
    ],
  }));
  seenSnapshotKeys.add(key);
  return {
    ok: true,
    txHash,
    bpm: payload.snapshot.bpm,
    bucketStartMs: payload.snapshot.bucketStartMs,
    sampleSeq: payload.snapshot.sampleSeq,
  };
}

async function publishLatestClosedInterval(sessionId, lastElapsedMs, metric = "hr") {
  const closedEndMs = Math.floor(lastElapsedMs / intervalMs) * intervalMs;
  const intervalStartMs = closedEndMs - intervalMs;
  if (!Number.isFinite(intervalStartMs) || intervalStartMs < 0) {
    return { ok: false, reason: "no-closed-interval-yet" };
  }

  let payload;
  try {
    payload = await fetchJson(
      `/api/cre/sessions/${sessionId}/interval-close?intervalStartMs=${intervalStartMs}&intervalMs=${intervalMs}&metric=${metric}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/No RR samples available|No HR samples available/i.test(message)) {
      return { ok: false, reason: "metric-not-ready", metric };
    }
    throw error;
  }
  const key = `${payload.sessionIdHash}:${payload.intervalStartMs}:${payload.result.sampleSeq}`;
  if (seenIntervalKeys.has(key)) {
    return { ok: true, skipped: "already-published-memory" };
  }

  const existing = await publicClient.readContract({
    address: telemetryFeedAddress,
    abi: feedReadAbi,
    functionName: "intervalCloses",
    args: [payload.sessionIdHash, BigInt(payload.intervalStartMs)],
  });
  if (existing[0] && Number(existing[5]) === payload.result.sampleSeq) {
    seenIntervalKeys.add(key);
    return { ok: true, skipped: "already-published-chain" };
  }

  const txHash = await writeContractWithRetry(() => ({
    address: telemetryFeedAddress,
    abi: feedAbi,
    functionName: "reportIntervalClose",
    args: [
      payload.sessionIdHash,
      bigintFromNumber(payload.intervalStartMs),
      bigintFromNumber(payload.intervalEndMs),
      bigintFromNumber(payload.result.sampleElapsedMs),
      payload.result.sampleSeq,
      payload.result.value,
      unixSeconds(payload.result.serverReceivedAt ?? payload.result.phoneObservedAt),
    ],
  }));
  seenIntervalKeys.add(key);
  return {
    ok: true,
    metric,
    txHash,
    intervalStartMs: payload.intervalStartMs,
    intervalEndMs: payload.intervalEndMs,
    closeValue: payload.result.value,
    sampleSeq: payload.result.sampleSeq,
  };
}

async function ensureIntervalMarket(session, metric = "hr") {
  return createCurrentIntervalMarket(session, metric);
}

async function settleThresholdMarket(marketId) {
  const settlementKey = String(marketId);
  if (seenSettlementKeys.has(settlementKey)) {
    return { ok: true, skipped: "already-settled-memory" };
  }

  const payload = await fetchJson(`/api/cre/markets/${marketId}/threshold-settlement`);
  let market = await readMarket(marketId);
  let status = Number(market[9]);
  const txHashes = [];

  if (status === 0) {
    const txHash = await writeContractWithRetry(() => ({
      address: predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: "closeMarket",
      args: [BigInt(marketId)],
    }));
    txHashes.push(txHash);
    market = await waitForMarketStatus(marketId, 1);
    status = Number(market[9]);
  }

  if (status === 1) {
    const txHash = await writeContractWithRetry(() => ({
      address: predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: "requestSettlement",
      args: [BigInt(marketId)],
    }));
    txHashes.push(txHash);
    market = await waitForMarketStatus(marketId, 2);
    status = Number(market[9]);
  }

  if (status !== 2) {
    return { ok: false, reason: `market-not-ready-${status}` };
  }

  const fulfillTxHash = await writeContractWithRetry(() => ({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: "fulfillSettlement",
    args: [
      BigInt(marketId),
      payload.result.value,
      BigInt(payload.result.observedValue),
      payload.result.sampleSeq,
      BigInt(payload.result.sampleElapsedMs),
    ],
  }));
  txHashes.push(fulfillTxHash);
  seenSettlementKeys.add(settlementKey);

  return {
    ok: true,
    txHashes,
    outcome: payload.result.value,
    observedValue: payload.result.observedValue,
    sampleSeq: payload.result.sampleSeq,
  };
}

async function settleRegisteredThresholdMarkets(sessionId, lastElapsedMs) {
  const registry = await fetchJson("/api/market-registry");
  const candidates = (registry.markets ?? []).filter((record) => (
    (
      record.type === "hr_threshold" ||
      record.type === "steps_threshold_window" ||
      record.type === "hr_interval_direction" ||
      record.type === "rr_interval_direction" ||
      record.type === "steps_interval_direction"
    ) &&
    record.referenceId === sessionId
  ));
  const results = [];

  for (const record of candidates) {
    const market = await readMarket(record.marketId);
    const t = typeof record.windowEndElapsedMs === "number" ? record.windowEndElapsedMs : Number(market[3]);
    const status = Number(market[9]);
    if (t > lastElapsedMs || status >= 3) {
      continue;
    }
    results.push({
      marketId: record.marketId,
      ...(await settleThresholdMarket(record.marketId)),
    });
  }

  return results;
}

async function settleRegisteredIntervalMarkets(sessionId, lastElapsedMs) {
  const registry = await fetchJson(`/api/interval-markets?sessionId=${encodeURIComponent(sessionId)}`);
  const candidates = (registry.markets ?? []).filter((record) => record.windowEndElapsedMs <= lastElapsedMs);
  const results = [];

  for (const record of candidates) {
    const market = await readIntervalMarket(record.marketId);
    const status = Number(market[9]);
    if (status !== 0) {
      continue;
    }

    const settlement = await fetchJson(
      `/api/cre/sessions/${sessionId}/interval-close?intervalStartMs=${record.windowStartElapsedMs}&intervalMs=${intervalMs}&metric=${record.metric}`,
    );

    const txHash = await writeContractWithRetry(() => ({
      address: parimutuelIntervalMarketAddress,
      abi: parimutuelIntervalMarketAbi,
      functionName: "settleIntervalMarket",
      args: [
        BigInt(record.marketId),
        BigInt(settlement.result.value),
        settlement.result.sampleSeq,
        BigInt(settlement.result.sampleElapsedMs),
      ],
    }));

    results.push({
      marketId: record.marketId,
      metric: record.metric,
      txHash,
      observedValue: settlement.result.value,
      sampleSeq: settlement.result.sampleSeq,
      sampleElapsedMs: settlement.result.sampleElapsedMs,
    });
  }

  return results;
}

let running = true;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    running = false;
  });
}

log("runner-start", {
  sessionSelector,
  pollMs,
  snapshotBucketMs,
  staleAfterMs,
  intervalMs,
  autoPublishSnapshot,
  autoIntervalMarkets,
  autoSettleThreshold,
});

while (running) {
  try {
    const session = await fetchJson(`/api/cre/sessions/${sessionSelector}`);
    log("session", {
      sessionId: session.sessionId,
      sampleCount: session.sampleCount,
      lastElapsedMs: session.lastElapsedMs,
      lastSampleAt: session.lastSampleAt,
    });

    if (autoPublishSnapshot) {
      const snapshotResult = await publishLatestSnapshot(session.sessionId);
      if (snapshotResult.ok && !snapshotResult.skipped) {
        log("snapshot-published", snapshotResult);
      }
    }

    for (const metric of ["hr", "rr", "steps"]) {
      const intervalResult = await publishLatestClosedInterval(session.sessionId, Number(session.lastElapsedMs ?? 0), metric);
      if (intervalResult.ok && !intervalResult.skipped) {
        log("interval-close-published", intervalResult);
      }
    }

    if (autoIntervalMarkets) {
      for (const metric of ["hr", "rr", "steps"]) {
        const marketResult = await ensureIntervalMarket(session, metric);
        log("interval-market-sync", { metric, ...marketResult });
      }
    }

    if (autoSettleThreshold) {
      const settled = await settleRegisteredThresholdMarkets(session.sessionId, Number(session.lastElapsedMs ?? 0));
      for (const result of settled) {
        log("threshold-settled", result);
      }

      const settledIntervals = await settleRegisteredIntervalMarkets(session.sessionId, Number(session.lastElapsedMs ?? 0));
      for (const result of settledIntervals) {
        log("interval-settled", result);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("runner-error", { message });
  }

  if (!running) {
    break;
  }
  await sleep(pollMs);
}

log("runner-stop");
