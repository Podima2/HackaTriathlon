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

const sessionId = process.argv[2] ?? env("SESSION_ID") ?? "current";
const bucketMs = Number(env("SNAPSHOT_BUCKET_MS", "5000"));
const staleAfterMs = Number(env("STALE_AFTER_MS", "10000"));
const allowStale = env("ALLOW_STALE", "false") === "true";

const payload = await fetchJson(
  `/api/cre/sessions/${sessionId}/latest-snapshot?bucketMs=${bucketMs}&staleAfterMs=${staleAfterMs}`,
);

if (payload.stale && !allowStale) {
  throw new Error(`Refusing to publish stale snapshot (dataAgeMs=${payload.dataAgeMs})`);
}

const txHash = await walletClient.writeContract({
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
});
await publicClient.waitForTransactionReceipt({ hash: txHash });

console.log(JSON.stringify({
  ok: true,
  sessionId: payload.sessionId,
  sessionIdHash: payload.sessionIdHash,
  bucketStartMs: payload.snapshot.bucketStartMs,
  bpm: payload.snapshot.bpm,
  sampleSeq: payload.snapshot.sampleSeq,
  txHash,
}, null, 2));
