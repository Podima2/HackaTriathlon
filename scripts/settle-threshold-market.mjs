import {
  env,
  fetchJson,
  predictionMarketAbi,
  predictionMarketAddress,
  publicClient,
  walletClient,
} from "./cre-common.mjs";

if (!predictionMarketAddress) {
  throw new Error("Missing PREDICTION_MARKET or VITE_PREDICTION_MARKET");
}

const marketIdRaw = process.argv[2] ?? env("MARKET_ID");
if (!marketIdRaw) {
  throw new Error("Provide MARKET_ID or pass the market id as the first argument");
}

const marketId = BigInt(marketIdRaw);
const payload = await fetchJson(`/api/cre/markets/${marketId}/threshold-settlement`);

async function readMarket() {
  return publicClient.readContract({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: "markets",
    args: [marketId],
  });
}

async function waitForStatus(expectedStatus, attempts = 8, delayMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const market = await readMarket();
    const status = Number(market[9]);
    if (status === expectedStatus) {
      return market;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return readMarket();
}

const market = await readMarket();

const status = Number(market[9]);
const txHashes = [];
let nonce = await publicClient.getTransactionCount({
  address: walletClient.account.address,
  blockTag: "pending",
});

if (status === 0) {
  const txHash = await walletClient.writeContract({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: "closeMarket",
    args: [marketId],
    nonce,
  });
  nonce += 1;
  txHashes.push(txHash);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}

const refreshedAfterClose = status === 0
  ? await waitForStatus(1)
  : market;

const statusAfterClose = Number(refreshedAfterClose[8]);
if (statusAfterClose === 1) {
  const txHash = await walletClient.writeContract({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: "requestSettlement",
    args: [marketId],
    nonce,
  });
  nonce += 1;
  txHashes.push(txHash);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}

const refreshedAfterRequest = statusAfterClose === 1
  ? await waitForStatus(2)
  : refreshedAfterClose;

const statusAfterRequest = Number(refreshedAfterRequest[8]);
if (statusAfterRequest !== 2) {
  throw new Error(`Market ${marketId} is not ready for fulfillment (status=${statusAfterRequest})`);
}

const fulfillTxHash = await walletClient.writeContract({
  address: predictionMarketAddress,
  abi: predictionMarketAbi,
  functionName: "fulfillSettlement",
  args: [
    marketId,
    payload.result.value,
    BigInt(payload.result.observedValue),
    payload.result.sampleSeq,
    BigInt(payload.result.sampleElapsedMs),
  ],
  nonce,
});
txHashes.push(fulfillTxHash);
await publicClient.waitForTransactionReceipt({ hash: fulfillTxHash });

console.log(JSON.stringify({
  ok: true,
  marketId: Number(marketId),
  sessionId: payload.sessionId,
  observedValue: payload.result.observedValue,
  outcome: payload.result.value,
  sampleSeq: payload.result.sampleSeq,
  sampleElapsedMs: payload.result.sampleElapsedMs,
  txHashes,
}, null, 2));
