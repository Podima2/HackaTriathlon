import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function loadEnvFiles() {
  for (const name of [".env", ".env.local"]) {
    const filePath = join(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

loadEnvFiles();

export function env(name, fallback = undefined) {
  return process.env[name] ?? fallback;
}

export function requiredEnv(name) {
  const value = env(name);
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function normalizePrivateKey(value) {
  const trimmed = value.trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(withPrefix)) {
    throw new Error("Invalid private key format");
  }
  return withPrefix;
}

export const apiBaseUrl = (env("CRE_API_BASE_URL", env("VITE_API_BASE_URL", "https://hackatriathlon-production.up.railway.app")) ?? "")
  .replace(/\/$/, "");
export const baseRpcUrl = env("ARC_TESTNET_RPC_URL", env("BASE_RPC_URL", env("VITE_RPC_URL", "https://rpc.testnet.arc.network")));
export const collateralTokenAddress = env(
  "VITE_COLLATERAL_TOKEN",
  env("COLLATERAL_TOKEN", "0x3600000000000000000000000000000000000000"),
);
export const telemetryFeedAddress = env(
  "CHAINLINK_TELEMETRY_FEED",
  env("VITE_CHAINLINK_TELEMETRY_FEED", "0x060CD06A3035b59E5fB609d64446c26FF2b00300"),
);
export const predictionMarketAddress = env(
  "PREDICTION_MARKET",
  env("VITE_PREDICTION_MARKET", "0x86e8A602DB5A6c6cD9c5C5a753195F326BA4C1F3"),
);
export const parimutuelIntervalMarketAddress = env(
  "PARIMUTUEL_INTERVAL_MARKET",
  env("VITE_PARIMUTUEL_INTERVAL_MARKET", ""),
);

const account = privateKeyToAccount(normalizePrivateKey(requiredEnv("BASE_PRIVATE_KEY")));

export const publicClient = createPublicClient({
  transport: http(baseRpcUrl),
});

export const walletClient = createWalletClient({
  account,
  transport: http(baseRpcUrl),
});

export const collateralTokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] ;

export const feedAbi = [
  {
    type: "function",
    name: "reportSnapshot",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionIdHash", type: "bytes32" },
      { name: "bucketStartMs", type: "uint64" },
      { name: "sampleElapsedMs", type: "uint64" },
      { name: "sampleSeq", type: "uint32" },
      { name: "bpm", type: "uint32" },
      { name: "reportedAt", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reportIntervalClose",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionIdHash", type: "bytes32" },
      { name: "intervalStartMs", type: "uint64" },
      { name: "intervalEndMs", type: "uint64" },
      { name: "sampleElapsedMs", type: "uint64" },
      { name: "sampleSeq", type: "uint32" },
      { name: "closeBpm", type: "uint32" },
      { name: "reportedAt", type: "uint64" },
    ],
    outputs: [],
  },
] ;

export const predictionMarketAbi = [
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "sessionIdHash", type: "bytes32" },
      { name: "creator", type: "address" },
      { name: "t", type: "uint64" },
      { name: "tradingClosesAtElapsedMs", type: "uint64" },
      { name: "thresholdValue", type: "uint64" },
      { name: "thresholdDirection", type: "uint8" },
      { name: "signalType", type: "uint8" },
      { name: "createdAt", type: "uint64" },
      { name: "status", type: "uint8" },
      { name: "settledBooleanOutcome", type: "bool" },
      { name: "observedValue", type: "int256" },
      { name: "settledSampleElapsedMs", type: "uint64" },
      { name: "settledSampleSeq", type: "uint32" },
      { name: "yesPool", type: "uint256" },
      { name: "noPool", type: "uint256" },
      { name: "totalLiquidity", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "closeMarket",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "requestSettlement",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "fulfillSettlement",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "booleanOutcome", type: "bool" },
      { name: "observedValue", type: "int256" },
      { name: "sampleSeq", type: "uint32" },
      { name: "sampleElapsedMs", type: "uint64" },
    ],
    outputs: [],
  },
] ;

export const parimutuelIntervalMarketAbi = [
  {
    type: "function",
    name: "nextMarketId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "sessionIdHash", type: "bytes32" },
      { name: "creator", type: "address" },
      { name: "intervalStartElapsedMs", type: "uint64" },
      { name: "intervalEndElapsedMs", type: "uint64" },
      { name: "tradingClosesAtTimestamp", type: "uint64" },
      { name: "referenceValue", type: "uint64" },
      { name: "signalType", type: "uint8" },
      { name: "createdAt", type: "uint64" },
      { name: "status", type: "uint8" },
      { name: "settledOutcomeAbove", type: "bool" },
      { name: "observedValue", type: "int256" },
      { name: "settledAt", type: "uint64" },
      { name: "settledSampleElapsedMs", type: "uint64" },
      { name: "settledSampleSeq", type: "uint32" },
      { name: "totalAboveStake", type: "uint256" },
      { name: "totalBelowStake", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [
      { name: "aboveStake", type: "uint256" },
      { name: "belowStake", type: "uint256" },
      { name: "claimed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "createIntervalMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionIdHash", type: "bytes32" },
      { name: "intervalStartElapsedMs", type: "uint64" },
      { name: "intervalEndElapsedMs", type: "uint64" },
      { name: "tradingClosesAtTimestamp", type: "uint64" },
      { name: "referenceValue", type: "uint64" },
      { name: "signalType", type: "uint8" },
    ],
    outputs: [{ name: "marketId", type: "uint256" }],
  },
  {
    type: "function",
    name: "takePosition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "isAbove", type: "bool" },
      { name: "collateralIn", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settleIntervalMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "observedValue", type: "int256" },
      { name: "sampleSeq", type: "uint32" },
      { name: "sampleElapsedMs", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "payoutAmount", type: "uint256" }],
  },
] ;

export async function fetchJson(path) {
  const response = await fetch(`${apiBaseUrl}${path}`);
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

export function unixSeconds(value) {
  return BigInt(Math.floor(Date.parse(value) / 1000));
}

export function bigintFromNumber(value) {
  return BigInt(Math.trunc(value));
}
