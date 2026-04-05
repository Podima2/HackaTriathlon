import {
  bigintFromNumber,
  env,
  feedAbi,
  fetchJson,
  publicClient,
  telemetryFeedAddress,
  unixSeconds,
  walletClient,
} from "./cre-common.mjs";

if (!telemetryFeedAddress) {
  throw new Error("Missing CHAINLINK_TELEMETRY_FEED or VITE_CHAINLINK_TELEMETRY_FEED");
}

const intervalMs = Number(env("INTERVAL_MS", "300000"));
const explicitSessionId = process.argv[2] ?? env("SESSION_ID") ?? "current";
let intervalStartMs = process.argv[3] ? Number(process.argv[3]) : Number(env("INTERVAL_START_MS", "NaN"));

if (!Number.isFinite(intervalStartMs)) {
  const sessionPayload = await fetchJson(`/api/cre/sessions/${explicitSessionId}`);
  const lastElapsedMs = Number(sessionPayload.lastElapsedMs);
  const closedEndMs = Math.floor(lastElapsedMs / intervalMs) * intervalMs;
  intervalStartMs = closedEndMs - intervalMs;
}

if (!Number.isFinite(intervalStartMs) || intervalStartMs < 0) {
  throw new Error("Could not determine a closed interval to publish");
}

const payload = await fetchJson(
  `/api/cre/sessions/${explicitSessionId}/interval-close?intervalStartMs=${intervalStartMs}&intervalMs=${intervalMs}`,
);

const txHash = await walletClient.writeContract({
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
});
await publicClient.waitForTransactionReceipt({ hash: txHash });

console.log(JSON.stringify({
  ok: true,
  sessionId: payload.sessionId,
  sessionIdHash: payload.sessionIdHash,
  intervalStartMs: payload.intervalStartMs,
  intervalEndMs: payload.intervalEndMs,
  closeBpm: payload.result.value,
  sampleSeq: payload.result.sampleSeq,
  txHash,
}, null, 2));
