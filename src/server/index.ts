import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, formatUnits, http, keccak256, parseGwei, parseUnits, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { WebSocketServer } from "ws";
import type WebSocket from "ws";
import type { IceConfigResponse, SignalingMessage } from "../shared/protocol.js";

loadServerEnv();

const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network";
const ARC_TESTNET_EXPLORER_URL = "https://testnet.arcscan.app";
const ARC_TESTNET_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const COLLATERAL_DECIMALS = Number(process.env.COLLATERAL_DECIMALS ?? process.env.VITE_COLLATERAL_DECIMALS ?? 6);
const COLLATERAL_SYMBOL = process.env.COLLATERAL_SYMBOL ?? process.env.VITE_COLLATERAL_SYMBOL ?? "USDC";

const port = Number(process.env.PORT ?? 8787);
const turnProvider = (process.env.TURN_PROVIDER ?? "cloudflare") as IceConfigResponse["provider"];
const cloudflareTurnKeyId = process.env.CLOUDFLARE_TURN_KEY_ID ?? "";
const cloudflareTurnApiToken = process.env.CLOUDFLARE_TURN_API_TOKEN ?? "";
const cloudflareTurnTtl = Number(process.env.CLOUDFLARE_TURN_TTL_SECONDS ?? 3600);
const telemetryApiKey = process.env.TELEMETRY_API_KEY ?? "";
const distDir = join(process.cwd(), "dist");
const telemetryDir = join(process.cwd(), "data", "telemetry");
const sessionsFilePath = join(telemetryDir, "sessions.json");
const samplesFilePath = join(telemetryDir, "samples.json");
const faucetDir = join(process.cwd(), "data", "faucet");
const faucetClaimsFilePath = join(faucetDir, "claims.json");
const swimFilePath = join(process.cwd(), "data", "swim.json");
const marketRegistryFilePath = join(process.cwd(), "data", "market-registry.json");
const intervalMarketRegistryFilePath = join(process.cwd(), "data", "interval-markets.json");
const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseTelemetryEnabled = Boolean(supabaseUrl && supabaseServiceRoleKey);
const baseRpcUrl = process.env.BASE_RPC_URL || process.env.VITE_RPC_URL || ARC_TESTNET_RPC_URL;
const collateralTokenAddress =
  process.env.COLLATERAL_TOKEN ||
  process.env.VITE_COLLATERAL_TOKEN ||
  ARC_TESTNET_USDC_ADDRESS;
const predictionMarketAddress =
  process.env.PREDICTION_MARKET ||
  process.env.VITE_PREDICTION_MARKET ||
  "0x86e8A602DB5A6c6cD9c5C5a753195F326BA4C1F3";
const parimutuelIntervalMarketAddress =
  process.env.PARIMUTUEL_INTERVAL_MARKET ||
  process.env.VITE_PARIMUTUEL_INTERVAL_MARKET ||
  "";
const faucetPrivateKey = process.env.BASE_PRIVATE_KEY || "";
const faucetClaimAmount = BigInt(process.env.FAUCET_CLAIM_AMOUNT || parseUnits("10", COLLATERAL_DECIMALS));
const faucetCooldownMs = Number(process.env.FAUCET_COOLDOWN_MS || 3 * 60 * 60 * 1000);
const serverFaucetEnabled = (process.env.ENABLE_SERVER_FAUCET ?? "").toLowerCase() === "true";
const autoIntervalSeedAmount = BigInt(process.env.AUTO_INTERVAL_SEED_AMOUNT || parseUnits("1", COLLATERAL_DECIMALS));
const intervalMaxFeePerGas = parseGwei(process.env.AUTO_INTERVAL_MAX_FEE_GWEI || "160");
const intervalMaxPriorityFeePerGas = parseGwei(process.env.AUTO_INTERVAL_MAX_PRIORITY_FEE_GWEI || "1");
const enableIntervalAutomation = (process.env.ENABLE_INTERVAL_AUTOMATION ?? "true").toLowerCase() === "true";
const intervalAutomationPollMs = Number(process.env.INTERVAL_AUTOMATION_POLL_MS ?? 15_000);
const arcTestnetChain = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [baseRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Arcscan",
      url: ARC_TESTNET_EXPLORER_URL,
    },
  },
});
const publicClient = createPublicClient({
  chain: arcTestnetChain,
  transport: http(baseRpcUrl),
});
const intervalMarketLocks = new Map<string, Promise<{
  ok: boolean;
  created: boolean;
  marketId: number | null;
  metric: "hr" | "rr" | "steps";
  referenceValue: number;
  startAt: string;
  endAt: string;
}>>();
let intervalAutomationInFlight = false;
const collateralTokenAbi = [
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
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
const parimutuelIntervalMarketAbi = [
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
] as const;
const predictionMarketAbi = [
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
    name: "createThresholdMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionIdHash", type: "bytes32" },
      { name: "t", type: "uint64" },
      { name: "tradingClosesAtElapsedMs", type: "uint64" },
      { name: "thresholdValue", type: "uint64" },
      { name: "thresholdDirection", type: "uint8" },
      { name: "signalType", type: "uint8" },
      { name: "seedLiquidity", type: "uint256" },
    ],
    outputs: [{ name: "marketId", type: "uint256" }],
  },
  {
    type: "function",
    name: "nextMarketId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "settlementSpec",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      { name: "sessionIdHash", type: "bytes32" },
      { name: "t", type: "uint64" },
      { name: "thresholdValue", type: "uint64" },
      { name: "thresholdDirection", type: "uint8" },
      { name: "signalType", type: "uint8" },
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
] as const;

type TelemetrySessionDraft = {
  athleteId?: string | null;
  eventId?: string | null;
  notes?: string | null;
  eventTimezone?: string | null;
  eventUtcOffsetSeconds?: number | null;
  clientStartedAt?: string | null;
};

type TelemetrySessionRecord = {
  sessionId: string;
  athleteId: string | null;
  eventId: string | null;
  notes: string | null;
  createdAt: string;
  eventTimezone: string | null;
  eventUtcOffsetSeconds: number | null;
  clientStartedAt: string | null;
  status: "active" | "finalized" | "abandoned";
  finalizedAt?: string;
  abandonedAt?: string;
};

type TelemetrySamplePayload = {
  sampleSeq: number;
  bpm: number;
  rrIntervalsMs?: number[] | null;
  rmssd?: number | null;
  sdnn?: number | null;
  steps?: number | null;
  deviceObservedAt?: string | null;
  phoneObservedAt: string;
  elapsedMsSinceSessionStart: number;
};

type TelemetryUploadRequest = {
  sessionId?: string;
  samples?: TelemetrySamplePayload[];
};

type TelemetrySampleRecord = TelemetrySamplePayload & {
  sessionId: string;
  serverReceivedAt: string;
};

type TelemetryStore = {
  sessions: Record<string, TelemetrySessionRecord>;
  samples: Record<string, TelemetrySampleRecord[]>;
};

type SupabaseTelemetrySessionRow = {
  session_id: string;
  athlete_id: string | null;
  event_id: string | null;
  notes: string | null;
  created_at: string;
  event_timezone: string | null;
  event_utc_offset_seconds: number | null;
  client_started_at: string | null;
  status: "active" | "finalized" | "abandoned";
  finalized_at?: string | null;
  abandoned_at?: string | null;
};

type SupabaseTelemetrySampleRow = {
  session_id: string;
  sample_seq: number;
  bpm: number;
  rr_intervals_ms: number[] | null;
  rmssd: number | null;
  sdnn: number | null;
  steps: number | null;
  device_observed_at: string | null;
  phone_observed_at: string;
  server_received_at: string;
  elapsed_ms_since_session_start: number;
};

type SettlementMarketType = "exact" | "interval_avg" | "interval_max" | "interval_min" | "threshold" | "window_threshold" | "swim_threshold";

type FaucetClaimRecord = {
  wallet: string;
  claimedAt: string;
  txHash: string;
  amount: string;
};

type FaucetClaimsStore = Record<string, FaucetClaimRecord>;

type SwimEventRecord = {
  swimEventId: string;
  status: "idle" | "active" | "finished";
  startedAt: string | null;
  finishedAt: string | null;
  closeAt: string | null;
};

type MarketRegistryRecord = {
  marketId: number;
  type: "hr_threshold" | "hr_interval_direction" | "rr_interval_direction" | "steps_interval_direction" | "steps_threshold_window" | "swim_threshold";
  referenceId: string;
  threshold: number;
  direction: "over" | "under";
  signalType?: number | null;
  intervalMinutes?: number | null;
  windowMinutes?: number | null;
  windowStartElapsedMs?: number | null;
  windowEndElapsedMs?: number | null;
  referenceBpm?: number | null;
  referenceRrMs?: number | null;
  referenceSteps?: number | null;
  createdAt: string;
};

type MarketRegistryStore = Record<string, MarketRegistryRecord>;
type IntervalMetric = "hr" | "rr" | "steps";
type IntervalMarketRegistryRecord = {
  marketId: number;
  sessionId: string;
  metric: IntervalMetric;
  signalType: number;
  referenceValue: number;
  windowStartElapsedMs: number;
  windowEndElapsedMs: number;
  tradingClosesAtTimestamp: number;
  createdAt: string;
};
type IntervalMarketRegistryStore = Record<string, IntervalMarketRegistryRecord>;
type NonceCursor = { value: number };

ensureTelemetryStorage();
ensureFaucetStorage();
ensureSwimStorage();
ensureMarketRegistryStorage();
ensureIntervalMarketRegistryStorage();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  applyCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "precannes-server" });
  }

  if (req.method === "GET" && url.pathname === "/api/cre") {
    return sendJson(res, 200, {
      ok: true,
      service: "precannes-cre-read-api",
      routes: {
        currentSession: "/api/cre/sessions/current",
        latestSnapshot: "/api/cre/sessions/:sessionId/latest-snapshot?bucketMs=5000&staleAfterMs=10000",
        currentLatestSnapshot: "/api/cre/sessions/current/latest-snapshot?bucketMs=5000&staleAfterMs=10000",
        intervalClose: "/api/cre/sessions/:sessionId/interval-close?intervalStartMs=300000&intervalMs=300000&metric=hr",
        currentIntervalClose: "/api/cre/sessions/current/interval-close?intervalStartMs=300000&intervalMs=300000&metric=hr",
        thresholdSettlement: "/api/cre/markets/:marketId/threshold-settlement",
      },
    });
  }

  if (req.method === "GET" && url.pathname === "/api/faucet") {
    const claims = loadFaucetClaims();
    return sendJson(res, 200, {
      ok: true,
      chainId: ARC_TESTNET_CHAIN_ID,
      chainName: "Arc Testnet",
      rpcUrl: baseRpcUrl,
      tokenAddress: collateralTokenAddress || null,
      tokenSymbol: COLLATERAL_SYMBOL,
      tokenDecimals: COLLATERAL_DECIMALS,
      claimAmount: faucetClaimAmount.toString(),
      claimAmountFormatted: Number(formatUnits(faucetClaimAmount, COLLATERAL_DECIMALS)).toString(),
      cooldownMs: faucetCooldownMs,
      totalClaimedWallets: Object.keys(claims).length,
      ready: Boolean(serverFaucetEnabled && faucetPrivateKey && collateralTokenAddress),
      externalFaucetUrl: "https://faucet.circle.com/",
    });
  }

  if (req.method === "GET" && url.pathname === "/api/swim") {
    return sendJson(res, 200, loadSwimEvent());
  }

  if (req.method === "POST" && url.pathname === "/api/swim/start") {
    const swimEventId = randomUUID();
    const startedAt = new Date().toISOString();
    const closeAt = new Date(Date.parse(startedAt) + 30 * 60 * 1000).toISOString();
    const event: SwimEventRecord = {
      swimEventId,
      status: "active",
      startedAt,
      finishedAt: null,
      closeAt,
    };
    saveSwimEvent(event);
    return sendJson(res, 200, event);
  }

  if (req.method === "POST" && url.pathname === "/api/swim/finish") {
    const event = loadSwimEvent();
    if (event.status !== "active" || !event.startedAt) {
      return sendJson(res, 400, { error: "No active swim event" });
    }
    event.status = "finished";
    event.finishedAt = new Date().toISOString();
    saveSwimEvent(event);
    return sendJson(res, 200, event);
  }

  if (req.method === "GET" && url.pathname === "/api/market-registry") {
    return sendJson(res, 200, { markets: Object.values(loadMarketRegistry()) });
  }

  if (req.method === "GET" && url.pathname === "/api/interval-markets") {
    const sessionId = url.searchParams.get("sessionId");
    const metric = url.searchParams.get("metric");
    const markets = Object.values(loadIntervalMarketRegistry())
      .filter((record) => !sessionId || record.sessionId === sessionId)
      .filter((record) => metric === "hr" || metric === "rr" || metric === "steps" ? record.metric === metric : true)
      .sort((left, right) => (
        left.windowStartElapsedMs - right.windowStartElapsedMs || left.marketId - right.marketId
      ));
    return sendJson(res, 200, { markets });
  }

  if (req.method === "POST" && url.pathname === "/api/interval-markets/register") {
    try {
      if (!authorizeTelemetryRequest(req)) {
        return sendJson(res, 401, { error: "Unauthorized interval market registration" });
      }
      const body = (await readJsonBody(req)) as Partial<IntervalMarketRegistryRecord>;
      if (
        typeof body.marketId !== "number" ||
        typeof body.sessionId !== "string" ||
        (body.metric !== "hr" && body.metric !== "rr" && body.metric !== "steps") ||
        typeof body.signalType !== "number" ||
        typeof body.referenceValue !== "number" ||
        typeof body.windowStartElapsedMs !== "number" ||
        typeof body.windowEndElapsedMs !== "number" ||
        typeof body.tradingClosesAtTimestamp !== "number"
      ) {
        return sendJson(res, 400, { error: "Invalid interval market registration payload" });
      }

      const store = loadIntervalMarketRegistry();
      const key = intervalMarketRecordKey(body.sessionId, body.metric, body.windowStartElapsedMs);
      store[key] = {
        marketId: body.marketId,
        sessionId: body.sessionId.trim(),
        metric: body.metric,
        signalType: body.signalType,
        referenceValue: body.referenceValue,
        windowStartElapsedMs: body.windowStartElapsedMs,
        windowEndElapsedMs: body.windowEndElapsedMs,
        tradingClosesAtTimestamp: body.tradingClosesAtTimestamp,
        createdAt: typeof body.createdAt === "string" ? body.createdAt : new Date().toISOString(),
      };
      saveIntervalMarketRegistry(store);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 500, { error: error instanceof Error ? error.message : "Unable to register interval market" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/admin/interval-markets/current") {
    try {
      if (!authorizeTelemetryRequest(req)) {
        return sendJson(res, 401, { error: "Unauthorized interval market creation" });
      }
      const body = (await readJsonBody(req)) as { sessionId?: string; metric?: string };
      if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
        return sendJson(res, 400, { error: "Expected sessionId" });
      }
      const metric = body.metric === "rr" || body.metric === "steps" ? body.metric : "hr";
      const result = await ensureVisibleIntervalMarkets(body.sessionId.trim(), metric);
      return sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to ensure interval market";
      const expected = [
        "Prediction market contract is not configured on the backend",
        "Backend wallet is not configured for automatic interval markets",
        "Session not found",
        "Current 5-minute interval is not available yet",
      ];
      if (expected.includes(message)) {
        return sendJson(res, 200, { ok: false, created: false, reason: message });
      }
      return sendJson(res, 500, { error: message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/market-registry/interval/current") {
    return sendJson(res, 403, {
      ok: false,
      created: false,
      reason: "Public interval market creation is disabled. Use the admin/operator path only.",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/market-registry/register") {
    try {
      const body = (await readJsonBody(req)) as Partial<MarketRegistryRecord>;
      if (
        typeof body.marketId !== "number" ||
        !body.type ||
        !body.referenceId ||
        typeof body.threshold !== "number" ||
        !body.direction
      ) {
        return sendJson(res, 400, { error: "Invalid market registration payload" });
      }
      const registry = loadMarketRegistry();
      registry[String(body.marketId)] = {
        marketId: body.marketId,
        type: body.type,
        referenceId: body.referenceId,
        threshold: body.threshold,
        direction: body.direction,
        signalType: typeof body.signalType === "number" ? body.signalType : null,
        intervalMinutes: typeof body.intervalMinutes === "number" ? body.intervalMinutes : null,
        windowMinutes: typeof body.windowMinutes === "number" ? body.windowMinutes : null,
        windowStartElapsedMs: typeof body.windowStartElapsedMs === "number" ? body.windowStartElapsedMs : null,
        windowEndElapsedMs: typeof body.windowEndElapsedMs === "number" ? body.windowEndElapsedMs : null,
        referenceBpm: typeof body.referenceBpm === "number" ? body.referenceBpm : null,
        referenceRrMs: typeof body.referenceRrMs === "number" ? body.referenceRrMs : null,
        referenceSteps: typeof body.referenceSteps === "number" ? body.referenceSteps : null,
        createdAt: new Date().toISOString(),
      };
      saveMarketRegistry(registry);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 500, { error: error instanceof Error ? error.message : "Unable to register market" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/faucet/claim") {
    try {
      const body = (await readJsonBody(req)) as { wallet?: string };
      const wallet = normalizeAddress(body.wallet);
      if (!wallet) {
        return sendJson(res, 400, { error: "Expected wallet address" });
      }
      if (!serverFaucetEnabled || !faucetPrivateKey || !collateralTokenAddress) {
        return sendJson(res, 503, { error: "Server faucet is disabled. Use the Circle Arc faucet instead.", faucetUrl: "https://faucet.circle.com/" });
      }

      const claims = loadFaucetClaims();
      const existing = claims[wallet.toLowerCase()];
      const now = Date.now();
      if (existing) {
        const lastClaimAt = Date.parse(existing.claimedAt);
        const nextClaimAt = lastClaimAt + faucetCooldownMs;
        if (Number.isFinite(lastClaimAt) && now < nextClaimAt) {
          return sendJson(res, 429, {
            error: "Claim cooldown active",
            lastClaimAt: existing.claimedAt,
            nextClaimAt: new Date(nextClaimAt).toISOString(),
            txHash: existing.txHash,
          });
        }
      }

      const account = privateKeyToAccount(normalizePrivateKey(faucetPrivateKey));
      const walletClient = createWalletClient({
        account,
        chain: arcTestnetChain,
        transport: http(baseRpcUrl),
      });

      const txHash = await walletClient.writeContract({
        address: collateralTokenAddress as `0x${string}`,
        abi: collateralTokenAbi,
        functionName: "mint",
        args: [wallet as `0x${string}`, faucetClaimAmount],
      });

      const claimedAt = new Date().toISOString();
      claims[wallet.toLowerCase()] = {
        wallet,
        claimedAt,
        txHash,
        amount: faucetClaimAmount.toString(),
      };
      saveFaucetClaims(claims);

      return sendJson(res, 200, {
        ok: true,
        wallet,
        amount: faucetClaimAmount.toString(),
        txHash,
        claimedAt,
        nextClaimAt: new Date(Date.parse(claimedAt) + faucetCooldownMs).toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to process faucet claim";
      return sendJson(res, 500, { error: message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/ice-config") {
    try {
      const body: IceConfigResponse = {
        provider: turnProvider,
        iceServers: await getIceServers(turnProvider),
      };
      return sendJson(res, 200, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate ICE config";
      return sendJson(res, 500, { error: message });
    }
  }

  if (url.pathname === "/api/telemetry/sessions" && req.method === "POST") {
    if (!authorizeTelemetryRequest(req)) {
      return sendJson(res, 401, { error: "Unauthorized telemetry request" });
    }

    try {
      const body = (await readJsonBody(req)) as TelemetrySessionDraft;
      const createdAt = new Date().toISOString();
      const sessionId = randomUUID();
      const session: TelemetrySessionRecord = {
        sessionId,
        athleteId: normalizeNullableString(body.athleteId),
        eventId: normalizeNullableString(body.eventId),
        notes: normalizeNullableString(body.notes),
        createdAt,
        eventTimezone: normalizeNullableString(body.eventTimezone),
        eventUtcOffsetSeconds:
          typeof body.eventUtcOffsetSeconds === "number" ? Math.trunc(body.eventUtcOffsetSeconds) : null,
        clientStartedAt: normalizeNullableIsoTimestamp(body.clientStartedAt),
        status: "active",
      };
      await createTelemetrySession(session);
      return sendJson(res, 201, session);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid telemetry session payload";
      return sendJson(res, 400, { error: message });
    }
  }

  if (url.pathname === "/api/telemetry/sessions" && req.method === "GET") {
    const store = await loadTelemetryStoreAsync();
    const sessions = summarizeSessions(store)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return sendJson(res, 200, { sessions });
  }

  if (url.pathname === "/api/telemetry" && req.method === "GET") {
    const store = await loadTelemetryStoreAsync();
    const sessions = summarizeSessions(store);
    const latestSession = sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1) ?? null;
    return sendJson(res, 200, {
      ok: true,
      service: "precannes-telemetry",
      sessionCount: sessions.length,
      latestSession,
      routes: {
        sessions: "/api/telemetry/sessions",
        faucet: "/api/faucet",
        swim: "/api/swim",
        hrWindow: "/api/telemetry/sessions/:sessionId/hr-window?elapsedFromMs=0&elapsedToMs=60000",
        settlementResolve: "/api/telemetry/settlement/resolve?sessionId=:sessionId&marketType=exact&t=60000",
        dashboard: "/telemetry",
      },
    });
  }

  if (req.method === "GET" && url.pathname === "/api/cre/sessions/current") {
    const store = await loadTelemetryStoreAsync();
    const session = selectCurrentLiveSession(store);
    if (!session) {
      return sendJson(res, 404, { error: "No active sampled session found" });
    }

    return sendJson(res, 200, {
      ok: true,
      sessionId: session.sessionId,
      sessionIdHash: hashSessionId(session.sessionId),
      createdAt: session.createdAt,
      clientStartedAt: session.clientStartedAt,
      eventTimezone: session.eventTimezone,
      eventUtcOffsetSeconds: session.eventUtcOffsetSeconds,
      status: session.status,
      notes: session.notes,
      sampleCount: session.sampleCount,
      lastSampleAt: session.lastSampleAt,
      lastElapsedMs: session.lastElapsedMs,
    });
  }

  const creSessionMatch = matchPath(url.pathname, "/api/cre/sessions/", "");
  if (
    creSessionMatch &&
    req.method === "GET" &&
    !url.pathname.endsWith("/latest-snapshot") &&
    !url.pathname.endsWith("/interval-close") &&
    !url.pathname.endsWith("/interval-window")
  ) {
    const resolvedSessionId = creSessionMatch === "current"
      ? selectCurrentLiveSession(await loadTelemetryStoreAsync())?.sessionId ?? null
      : creSessionMatch;
    if (!resolvedSessionId) {
      return sendJson(res, 404, { error: "No active sampled session found" });
    }

    const store = await loadTelemetryStoreAsync();
    const session = store.sessions[resolvedSessionId];
    if (!session) {
      return sendJson(res, 404, { error: "Session not found" });
    }

    const samples = getSortedSamples(store, resolvedSessionId);
    const latestSample = samples.at(-1) ?? null;

    return sendJson(res, 200, {
      ok: true,
      sessionId: resolvedSessionId,
      sessionIdHash: hashSessionId(resolvedSessionId),
      createdAt: session.createdAt,
      clientStartedAt: session.clientStartedAt,
      eventTimezone: session.eventTimezone,
      eventUtcOffsetSeconds: session.eventUtcOffsetSeconds,
      status: session.status,
      sampleCount: samples.length,
      lastSampleAt: latestSample?.phoneObservedAt ?? null,
      lastElapsedMs: latestSample?.elapsedMsSinceSessionStart ?? null,
    });
  }

  const creLatestSnapshotMatch = matchPath(url.pathname, "/api/cre/sessions/", "/latest-snapshot");
  if (creLatestSnapshotMatch && req.method === "GET") {
    const resolvedSessionId = creLatestSnapshotMatch === "current"
      ? selectCurrentLiveSession(await loadTelemetryStoreAsync())?.sessionId ?? null
      : creLatestSnapshotMatch;
    if (!resolvedSessionId) {
      return sendJson(res, 404, { error: "No active sampled session found" });
    }

    const bucketMs = Number(url.searchParams.get("bucketMs") ?? 5_000);
    const staleAfterMs = Number(url.searchParams.get("staleAfterMs") ?? 10_000);
    if (!Number.isFinite(bucketMs) || bucketMs <= 0) {
      return sendJson(res, 400, { error: "Expected positive numeric bucketMs" });
    }
    if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
      return sendJson(res, 400, { error: "Expected non-negative numeric staleAfterMs" });
    }

    const store = await loadTelemetryStoreAsync();
    const session = store.sessions[resolvedSessionId];
    if (!session) {
      return sendJson(res, 404, { error: "Session not found" });
    }

    const samples = getSortedSamples(store, resolvedSessionId);
    if (samples.length === 0) {
      return sendJson(res, 422, { error: "No samples available for session" });
    }

    const latestSample = samples[samples.length - 1]!;
    const dataAgeMs = Math.max(0, Date.now() - Date.parse(latestSample.phoneObservedAt));
    return sendJson(res, 200, {
      ok: true,
      sessionId: resolvedSessionId,
      sessionIdHash: hashSessionId(resolvedSessionId),
      bucketMs,
      staleAfterMs,
      stale: dataAgeMs > staleAfterMs,
      dataAgeMs,
      snapshot: {
        bucketStartMs: Math.floor(latestSample.elapsedMsSinceSessionStart / bucketMs) * bucketMs,
        bpm: latestSample.bpm,
        rrLatestMs: latestRrIntervalMs(latestSample),
        rrCount: latestSample.rrIntervalsMs?.length ?? 0,
        rrIntervalsMs: latestSample.rrIntervalsMs ?? null,
        rmssd: latestSample.rmssd ?? null,
        sdnn: latestSample.sdnn ?? null,
        sampleSeq: latestSample.sampleSeq,
        sampleElapsedMs: latestSample.elapsedMsSinceSessionStart,
        phoneObservedAt: latestSample.phoneObservedAt,
        serverReceivedAt: latestSample.serverReceivedAt,
      },
    });
  }

  const creIntervalCloseMatch = matchPath(url.pathname, "/api/cre/sessions/", "/interval-close");
  if (creIntervalCloseMatch && req.method === "GET") {
    const resolvedSessionId = creIntervalCloseMatch === "current"
      ? selectCurrentLiveSession(await loadTelemetryStoreAsync())?.sessionId ?? null
      : creIntervalCloseMatch;
    if (!resolvedSessionId) {
      return sendJson(res, 404, { error: "No active sampled session found" });
    }

    const intervalStartMs = Number(url.searchParams.get("intervalStartMs"));
    const intervalMs = Number(url.searchParams.get("intervalMs") ?? 300_000);
    const metric = url.searchParams.get("metric") === "rr"
      ? "rr"
      : url.searchParams.get("metric") === "steps"
        ? "steps"
        : "hr";
    if (!Number.isFinite(intervalStartMs) || intervalStartMs < 0) {
      return sendJson(res, 400, { error: "Expected non-negative numeric intervalStartMs" });
    }
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return sendJson(res, 400, { error: "Expected positive numeric intervalMs" });
    }

    const store = await loadTelemetryStoreAsync();
    const session = store.sessions[resolvedSessionId];
    if (!session) {
      return sendJson(res, 404, { error: "Session not found" });
    }

    const samples = getSortedSamples(store, resolvedSessionId);
    if (samples.length === 0) {
      return sendJson(res, 422, { error: "No samples available for session" });
    }

    const intervalEndMs = intervalStartMs + intervalMs;
    if (metric === "steps") {
      const closeResult = resolveWindowSignalDelta(samples, intervalStartMs, intervalEndMs, 3);
      if (!closeResult) {
        return sendJson(res, 422, { error: `No ${metric.toUpperCase()} samples available at or before interval end` });
      }

      return sendJson(res, 200, {
        ok: true,
        sessionId: resolvedSessionId,
        sessionIdHash: hashMetricSessionId(resolvedSessionId, metric),
        metric,
        closeRule: "window-delta-latest-sample-at-or-before-window-bounds",
        intervalStartMs,
        intervalEndMs,
        result: {
          value: closeResult.value,
          sampleSeq: closeResult.end.sample.sampleSeq,
          sampleElapsedMs: closeResult.end.sample.elapsedMsSinceSessionStart,
          phoneObservedAt: closeResult.end.sample.phoneObservedAt,
          serverReceivedAt: closeResult.end.sample.serverReceivedAt,
          withinInterval: closeResult.end.sample.elapsedMsSinceSessionStart >= intervalStartMs,
          startSampleSeq: closeResult.start.sample.sampleSeq,
          startSampleElapsedMs: closeResult.start.sample.elapsedMsSinceSessionStart,
          startObservedValue: closeResult.start.value,
          endObservedValue: closeResult.end.value,
        },
      });
    }

    const closeResult = resolveLatestMetricAtOrBefore(samples, intervalEndMs, metric);
    if (!closeResult) {
      return sendJson(res, 422, { error: `No ${metric.toUpperCase()} samples available at or before interval end` });
    }

    return sendJson(res, 200, {
      ok: true,
      sessionId: resolvedSessionId,
      sessionIdHash: hashMetricSessionId(resolvedSessionId, metric),
      metric,
      closeRule: `latest-${metric}-sample-at-or-before-interval-end`,
      intervalStartMs,
      intervalEndMs,
      result: {
        value: closeResult.value,
        sampleSeq: closeResult.sample.sampleSeq,
        sampleElapsedMs: closeResult.sample.elapsedMsSinceSessionStart,
        phoneObservedAt: closeResult.sample.phoneObservedAt,
        serverReceivedAt: closeResult.sample.serverReceivedAt,
        withinInterval: closeResult.sample.elapsedMsSinceSessionStart >= intervalStartMs,
        startSampleSeq: null,
        startSampleElapsedMs: null,
        startObservedValue: null,
        endObservedValue: null,
      },
    });
  }

  const creIntervalWindowMatch = matchPath(url.pathname, "/api/cre/sessions/", "/interval-window");
  if (creIntervalWindowMatch && req.method === "GET") {
    const resolvedSessionId = creIntervalWindowMatch === "current"
      ? selectCurrentLiveSession(await loadTelemetryStoreAsync())?.sessionId ?? null
      : creIntervalWindowMatch;
    if (!resolvedSessionId) {
      return sendJson(res, 404, { error: "No active sampled session found" });
    }

    const intervalStartMs = Number(url.searchParams.get("intervalStartMs"));
    const intervalMs = Number(url.searchParams.get("intervalMs") ?? 300_000);
    const metric = url.searchParams.get("metric") === "rr"
      ? "rr"
      : url.searchParams.get("metric") === "steps"
        ? "steps"
        : "hr";
    if (!Number.isFinite(intervalStartMs) || intervalStartMs < 0) {
      return sendJson(res, 400, { error: "Expected non-negative numeric intervalStartMs" });
    }
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return sendJson(res, 400, { error: "Expected positive numeric intervalMs" });
    }

    const store = await loadTelemetryStoreAsync();
    const session = store.sessions[resolvedSessionId];
    if (!session) {
      return sendJson(res, 404, { error: "Session not found" });
    }

    const samples = getSortedSamples(store, resolvedSessionId);
    if (samples.length === 0) {
      return sendJson(res, 422, { error: "No samples available for session" });
    }

    const intervalEndMs = intervalStartMs + intervalMs;
    const previousIntervalStartMs = Math.max(0, intervalStartMs - intervalMs);
    const referenceResult = metric === "steps"
      ? resolveWindowSignalDelta(samples, previousIntervalStartMs, intervalStartMs, 3)
      : resolveLatestMetricAtOrBefore(samples, intervalStartMs, metric) ??
        resolveFirstMetricAtOrAfter(samples, intervalStartMs, metric);

    const rangeSamples = samples.filter((sample) => (
      sample.elapsedMsSinceSessionStart >= intervalStartMs &&
      sample.elapsedMsSinceSessionStart <= intervalEndMs
    ));

    if (metric === "steps") {
      const baseResult =
        resolveLatestSignalAtOrBefore(samples, intervalStartMs, 3) ??
        resolveFirstSignalAtOrAfter(samples, intervalStartMs, 3);
      const deltaSamples = baseResult
        ? rangeSamples
            .map((sample) => {
              const steps = signalScalarFromSample(sample, 3);
              if (steps === null) {
                return null;
              }
              return {
                sampleSeq: sample.sampleSeq,
                elapsedMsSinceSessionStart: sample.elapsedMsSinceSessionStart,
                phoneObservedAt: sample.phoneObservedAt,
                value: Math.max(0, Math.round(steps - baseResult.value)),
              };
            })
            .filter((sample): sample is { sampleSeq: number; elapsedMsSinceSessionStart: number; phoneObservedAt: string; value: number } => sample !== null)
        : [];
      const currentValue = deltaSamples.at(-1)?.value ?? 0;
      return sendJson(res, 200, {
        ok: true,
        sessionId: resolvedSessionId,
        metric,
        intervalStartMs,
        intervalEndMs,
        referenceValue: referenceResult?.value ?? 0,
        currentValue,
        latestElapsedMs: deltaSamples.at(-1)?.elapsedMsSinceSessionStart ?? null,
        samples: deltaSamples,
      });
    }

    const metricSamples = rangeSamples
      .map((sample) => {
        const value = metricScalarFromSample(sample, metric);
        if (value === null) {
          return null;
        }
        return {
          sampleSeq: sample.sampleSeq,
          elapsedMsSinceSessionStart: sample.elapsedMsSinceSessionStart,
          phoneObservedAt: sample.phoneObservedAt,
          value,
        };
      })
      .filter((sample): sample is { sampleSeq: number; elapsedMsSinceSessionStart: number; phoneObservedAt: string; value: number } => sample !== null);

    return sendJson(res, 200, {
      ok: true,
      sessionId: resolvedSessionId,
      metric,
      intervalStartMs,
      intervalEndMs,
      referenceValue: referenceResult?.value ?? null,
      currentValue: metricSamples.at(-1)?.value ?? null,
      latestElapsedMs: metricSamples.at(-1)?.elapsedMsSinceSessionStart ?? null,
      samples: metricSamples,
    });
  }

  const creThresholdSettlementMatch = matchPath(url.pathname, "/api/cre/markets/", "/threshold-settlement");
  if (creThresholdSettlementMatch && req.method === "GET") {
    if (!predictionMarketAddress) {
      return sendJson(res, 500, { error: "Prediction market contract is not configured" });
    }

    const marketId = Number(creThresholdSettlementMatch);
    if (!Number.isInteger(marketId) || marketId < 0) {
      return sendJson(res, 400, { error: "Expected numeric marketId" });
    }

    const [sessionIdHash, t, thresholdValue, thresholdDirection, signalType] = await publicClient.readContract({
      address: predictionMarketAddress as `0x${string}`,
      abi: predictionMarketAbi,
      functionName: "settlementSpec",
      args: [BigInt(marketId)],
    }) as readonly [`0x${string}`, bigint, bigint, number, number];

    const store = await loadTelemetryStoreAsync();
    const session = Object.values(store.sessions).find((candidate) => (
      sessionHashForSignalType(candidate.sessionId, signalType).toLowerCase() === sessionIdHash.toLowerCase()
    ));
    if (!session) {
      return sendJson(res, 404, { error: "Session not found for market" });
    }

    const samples = getSortedSamples(store, session.sessionId);
    if (samples.length === 0) {
      return sendJson(res, 422, { error: "No samples available for market session" });
    }

    const registry = loadMarketRegistry();
    const meta = registry[String(marketId)];
    const direction = thresholdDirection === 1 ? "under" : "over";

    if (signalType === 3 && (meta?.type === "steps_threshold_window" || meta?.type === "steps_interval_direction")) {
      const windowStartElapsedMs = typeof meta.windowStartElapsedMs === "number"
        ? meta.windowStartElapsedMs
        : Math.max(0, Number(t) - ((meta?.intervalMinutes ?? 5) * 60_000));
      const windowEndElapsedMs = typeof meta.windowEndElapsedMs === "number"
        ? meta.windowEndElapsedMs
        : Number(t);
      const resolved = resolveWindowSignalDelta(samples, windowStartElapsedMs, windowEndElapsedMs, signalType);
      if (!resolved) {
        return sendJson(res, 422, {
          error: `No ${signalLabel(signalType)} samples available for market window`,
        });
      }
      const outcome = direction === "under"
        ? resolved.value < Number(thresholdValue)
        : resolved.value > Number(thresholdValue);

      return sendJson(res, 200, {
        ok: true,
        marketId,
        sessionId: session.sessionId,
        sessionIdHash,
        signalType,
        signal: signalLabel(signalType),
        signalUnit: signalUnit(signalType),
        settlementRule: "window-delta-latest-sample-at-or-before-window-bounds",
        comparisonRule: direction === "under" ? "strictly-less-than" : "strictly-greater-than",
        t: Number(t),
        thresholdValue: Number(thresholdValue),
        direction,
        windowStartElapsedMs,
        windowEndElapsedMs,
        result: {
          value: outcome,
          observedValue: resolved.value,
          sampleSeq: resolved.end.sample.sampleSeq,
          sampleElapsedMs: resolved.end.sample.elapsedMsSinceSessionStart,
          startSampleSeq: resolved.start.sample.sampleSeq,
          startSampleElapsedMs: resolved.start.sample.elapsedMsSinceSessionStart,
          startObservedValue: resolved.start.value,
          endObservedValue: resolved.end.value,
          phoneObservedAt: resolved.end.sample.phoneObservedAt,
          serverReceivedAt: resolved.end.sample.serverReceivedAt,
        },
      });
    }

    const resolved = resolveExactSignalValue(samples, Number(t), signalType);
    if (!resolved) {
      return sendJson(res, 422, {
        error: `No ${signalLabel(signalType)} samples available for market session`,
      });
    }
    const outcome = direction === "under"
      ? resolved.value < Number(thresholdValue)
      : resolved.value > Number(thresholdValue);

    return sendJson(res, 200, {
      ok: true,
      marketId,
      sessionId: session.sessionId,
      sessionIdHash,
      signalType,
      signal: signalLabel(signalType),
      signalUnit: signalUnit(signalType),
      settlementRule: "nearest-sample-earlier-on-tie",
      comparisonRule: direction === "under" ? "strictly-less-than" : "strictly-greater-than",
      t: Number(t),
      thresholdValue: Number(thresholdValue),
      direction,
      result: {
        value: outcome,
        observedValue: resolved.value,
        sampleSeq: resolved.sample.sampleSeq,
        sampleElapsedMs: resolved.sample.elapsedMsSinceSessionStart,
        distanceMs: resolved.distanceMs,
        phoneObservedAt: resolved.sample.phoneObservedAt,
        serverReceivedAt: resolved.sample.serverReceivedAt,
      },
    });
  }

  if (url.pathname === "/api/telemetry/settlement/resolve" && req.method === "GET") {
    const sessionId = url.searchParams.get("sessionId");
    const marketType = url.searchParams.get("marketType") as SettlementMarketType | null;
    const t = url.searchParams.get("t");
    const t1 = url.searchParams.get("t1");
    const t2 = url.searchParams.get("t2");
    const threshold = url.searchParams.get("threshold");
    const direction = url.searchParams.get("direction");
    const signalType = Number(url.searchParams.get("signalType") ?? 0);

    if (!sessionId || !marketType) {
      return sendJson(res, 400, { error: "Expected sessionId and marketType query parameters" });
    }

    const store = await loadTelemetryStoreAsync();
    const session = store.sessions[sessionId];
    if (!session) {
      return sendJson(res, 404, { error: "Session not found" });
    }

    const samples = (store.samples[sessionId] ?? []).slice().sort((a, b) => a.elapsedMsSinceSessionStart - b.elapsedMsSinceSessionStart);
    if (samples.length === 0) {
      return sendJson(res, 422, { error: "No samples available for session" });
    }

    try {
      if (marketType === "exact") {
        const target = Number(t);
        if (!Number.isFinite(target) || target < 0) {
          return sendJson(res, 400, { error: "Expected non-negative numeric t for exact market" });
        }

        const resolved = resolveExactHeartRate(samples, target);
        return sendJson(res, 200, {
          ok: true,
          marketType,
          sessionId,
          t: target,
          resolutionRule: "nearest-sample-earlier-on-tie",
          eventTimezone: session.eventTimezone,
          eventUtcOffsetSeconds: session.eventUtcOffsetSeconds,
          clientStartedAt: session.clientStartedAt,
          createdAt: session.createdAt,
          result: {
            value: resolved.sample.bpm,
            sampleSeq: resolved.sample.sampleSeq,
            sampleElapsedMs: resolved.sample.elapsedMsSinceSessionStart,
            distanceMs: resolved.distanceMs,
            phoneObservedAt: resolved.sample.phoneObservedAt,
            serverReceivedAt: resolved.sample.serverReceivedAt,
          },
        });
      }

      if (marketType === "threshold") {
        const target = Number(t);
        const thresholdValue = Number(threshold);
        if (!Number.isFinite(target) || target < 0) {
          return sendJson(res, 400, { error: "Expected non-negative numeric t for threshold market" });
        }
        if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
          return sendJson(res, 400, { error: "Expected positive numeric threshold for threshold market" });
        }
        if (direction !== "over" && direction !== "under") {
          return sendJson(res, 400, { error: "Expected direction=over or direction=under for threshold market" });
        }

        const resolved = resolveExactSignalValue(samples, target, signalType);
        if (!resolved) {
          return sendJson(res, 422, { error: `No ${signalLabel(signalType)} samples available for threshold market` });
        }
        const outcome = direction === "over"
          ? resolved.value > thresholdValue
          : resolved.value < thresholdValue;

        return sendJson(res, 200, {
          ok: true,
          marketType,
          sessionId,
          t: target,
          threshold: thresholdValue,
          signalType,
          signal: signalLabel(signalType),
          signalUnit: signalUnit(signalType),
          direction,
          resolutionRule: "nearest-sample-earlier-on-tie",
          comparisonRule: direction === "over" ? "strictly-greater-than" : "strictly-less-than",
          eventTimezone: session.eventTimezone,
          eventUtcOffsetSeconds: session.eventUtcOffsetSeconds,
          clientStartedAt: session.clientStartedAt,
          createdAt: session.createdAt,
          result: {
            value: outcome,
            observedValue: resolved.value,
            sampleSeq: resolved.sample.sampleSeq,
            sampleElapsedMs: resolved.sample.elapsedMsSinceSessionStart,
            distanceMs: resolved.distanceMs,
            phoneObservedAt: resolved.sample.phoneObservedAt,
            serverReceivedAt: resolved.sample.serverReceivedAt,
          },
        });
      }

      if (marketType === "window_threshold") {
        const startMs = Number(t1);
        const endMs = Number(t2);
        const thresholdValue = Number(threshold);
        if (!Number.isFinite(startMs) || startMs < 0) {
          return sendJson(res, 400, { error: "Expected non-negative numeric t1 for window threshold market" });
        }
        if (!Number.isFinite(endMs) || endMs <= startMs) {
          return sendJson(res, 400, { error: "Expected numeric t2 greater than t1 for window threshold market" });
        }
        if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
          return sendJson(res, 400, { error: "Expected positive numeric threshold for window threshold market" });
        }
        if (direction !== "over" && direction !== "under") {
          return sendJson(res, 400, { error: "Expected direction=over or direction=under for window threshold market" });
        }

        const resolved = resolveWindowSignalDelta(samples, startMs, endMs, signalType);
        if (!resolved) {
          return sendJson(res, 422, { error: `No ${signalLabel(signalType)} samples available for window threshold market` });
        }
        const outcome = direction === "over"
          ? resolved.value > thresholdValue
          : resolved.value < thresholdValue;

        return sendJson(res, 200, {
          ok: true,
          marketType,
          sessionId,
          t1: startMs,
          t2: endMs,
          threshold: thresholdValue,
          signalType,
          signal: signalLabel(signalType),
          signalUnit: signalUnit(signalType),
          direction,
          resolutionRule: "window-delta-latest-sample-at-or-before-window-bounds",
          comparisonRule: direction === "over" ? "strictly-greater-than" : "strictly-less-than",
          eventTimezone: session.eventTimezone,
          eventUtcOffsetSeconds: session.eventUtcOffsetSeconds,
          clientStartedAt: session.clientStartedAt,
          createdAt: session.createdAt,
          result: {
            value: outcome,
            observedValue: resolved.value,
            sampleSeq: resolved.end.sample.sampleSeq,
            sampleElapsedMs: resolved.end.sample.elapsedMsSinceSessionStart,
            startSampleSeq: resolved.start.sample.sampleSeq,
            startSampleElapsedMs: resolved.start.sample.elapsedMsSinceSessionStart,
            startObservedValue: resolved.start.value,
            endObservedValue: resolved.end.value,
            phoneObservedAt: resolved.end.sample.phoneObservedAt,
            serverReceivedAt: resolved.end.sample.serverReceivedAt,
          },
        });
      }

      if (marketType === "swim_threshold") {
        const swimEvent = loadSwimEvent();
        const thresholdValue = Number(threshold);
        if (swimEvent.swimEventId !== sessionId) {
          return sendJson(res, 404, { error: "Swim event not found" });
        }
        if (swimEvent.status !== "finished" || !swimEvent.startedAt || !swimEvent.finishedAt) {
          return sendJson(res, 422, { error: "Swim event not finished yet" });
        }
        if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
          return sendJson(res, 400, { error: "Expected positive numeric threshold for swim market" });
        }
        if (direction !== "over" && direction !== "under") {
          return sendJson(res, 400, { error: "Expected direction=over or direction=under for swim market" });
        }
        const durationSeconds = Math.round((Date.parse(swimEvent.finishedAt) - Date.parse(swimEvent.startedAt)) / 1000);
        const outcome = direction === "over" ? durationSeconds > thresholdValue : durationSeconds < thresholdValue;
        return sendJson(res, 200, {
          ok: true,
          marketType,
          sessionId,
          threshold: thresholdValue,
          direction,
          result: {
            value: outcome,
            observedSeconds: durationSeconds,
            startedAt: swimEvent.startedAt,
            finishedAt: swimEvent.finishedAt,
          },
        });
      }

      const lowerBound = Number(t1);
      const upperBound = Number(t2);
      if (!Number.isFinite(lowerBound) || !Number.isFinite(upperBound) || lowerBound < 0 || upperBound < lowerBound) {
        return sendJson(res, 400, { error: "Expected numeric t1/t2 with 0 <= t1 <= t2" });
      }

      const windowSamples = samples.filter((sample) => (
        sample.elapsedMsSinceSessionStart >= lowerBound &&
        sample.elapsedMsSinceSessionStart <= upperBound
      ));

      if (windowSamples.length === 0) {
        return sendJson(res, 422, { error: "No samples available in interval" });
      }

      const bpmValues = windowSamples.map((sample) => sample.bpm);
      const aggregateValue =
        marketType === "interval_avg"
          ? Number((bpmValues.reduce((sum, bpm) => sum + bpm, 0) / bpmValues.length).toFixed(2))
          : marketType === "interval_max"
            ? Math.max(...bpmValues)
            : marketType === "interval_min"
              ? Math.min(...bpmValues)
              : null;

      if (aggregateValue === null) {
        return sendJson(res, 400, { error: `Unsupported marketType '${marketType}'` });
      }

      return sendJson(res, 200, {
        ok: true,
        marketType,
        sessionId,
        t1: lowerBound,
        t2: upperBound,
        acceptanceRule: "predictions-close-before-t1",
        eventTimezone: session.eventTimezone,
        eventUtcOffsetSeconds: session.eventUtcOffsetSeconds,
        clientStartedAt: session.clientStartedAt,
        createdAt: session.createdAt,
        result: {
          value: aggregateValue,
          sampleCount: windowSamples.length,
          firstSampleSeq: windowSamples[0]?.sampleSeq ?? null,
          lastSampleSeq: windowSamples[windowSamples.length - 1]?.sampleSeq ?? null,
          firstElapsedMs: windowSamples[0]?.elapsedMsSinceSessionStart ?? null,
          lastElapsedMs: windowSamples[windowSamples.length - 1]?.elapsedMsSinceSessionStart ?? null,
          firstPhoneObservedAt: windowSamples[0]?.phoneObservedAt ?? null,
          lastPhoneObservedAt: windowSamples[windowSamples.length - 1]?.phoneObservedAt ?? null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to resolve settlement";
      return sendJson(res, 500, { error: message });
    }
  }

  if (url.pathname === "/telemetry" && req.method === "GET") {
    const store = await loadTelemetryStoreAsync();
    const sessions = summarizeSessions(store)
      .map((session) => {
        return session;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderTelemetryDashboard(sessions));
    return;
  }

  if (url.pathname === "/api/telemetry/upload" && req.method === "POST") {
    if (!authorizeTelemetryRequest(req)) {
      return sendJson(res, 401, { error: "Unauthorized telemetry request" });
    }

    try {
      const body = (await readJsonBody(req)) as TelemetryUploadRequest;
      const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      if (!sessionId) {
        return sendJson(res, 400, { error: "Expected sessionId" });
      }
      const store = await loadTelemetryStoreAsync();
      const payloadSamples = Array.isArray(body.samples) ? body.samples : [];
      if (payloadSamples.length === 0) {
        return sendJson(res, 400, { error: "No telemetry samples provided" });
      }

      const normalizedSamples = payloadSamples
        .map((sample) => normalizeSamplePayload(sample))
        .sort((a, b) => a.sampleSeq - b.sampleSeq);

      await ensureTelemetrySessionExists(sessionId, normalizedSamples, store.sessions[sessionId]);

      const serverReceivedAt = new Date().toISOString();
      await upsertTelemetrySamples(sessionId, normalizedSamples.map((sample) => ({
        ...sample,
        sessionId,
        serverReceivedAt,
      })));

      return sendJson(res, 200, {
        acceptedThroughSeq: normalizedSamples[normalizedSamples.length - 1]?.sampleSeq ?? null,
        serverReceivedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid telemetry samples payload";
      return sendJson(res, 400, { error: message });
    }
  }

  const sampleMatch = matchPath(url.pathname, "/api/telemetry/sessions/", "/samples");
  if (sampleMatch && req.method === "POST") {
    if (!authorizeTelemetryRequest(req)) {
      return sendJson(res, 401, { error: "Unauthorized telemetry request" });
    }

    try {
      const body = (await readJsonBody(req)) as { samples?: TelemetrySamplePayload[] };
      const sessionId = sampleMatch;
      const store = await loadTelemetryStoreAsync();

      const payloadSamples = Array.isArray(body.samples) ? body.samples : [];
      if (payloadSamples.length === 0) {
        return sendJson(res, 400, { error: "No telemetry samples provided" });
      }

      const normalizedSamples = payloadSamples
        .map((sample) => normalizeSamplePayload(sample))
        .sort((a, b) => a.sampleSeq - b.sampleSeq);

      await ensureTelemetrySessionExists(sessionId, normalizedSamples, store.sessions[sessionId]);

      const serverReceivedAt = new Date().toISOString();
      await upsertTelemetrySamples(sessionId, normalizedSamples.map((sample) => ({
          ...sample,
          sessionId,
          serverReceivedAt,
      })));

      return sendJson(res, 200, {
        acceptedThroughSeq: normalizedSamples[normalizedSamples.length - 1]?.sampleSeq ?? null,
        serverReceivedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid telemetry samples payload";
      return sendJson(res, 400, { error: message });
    }
  }

  const finalizeMatch = matchPath(url.pathname, "/api/telemetry/sessions/", "/finalize");
  if (finalizeMatch && req.method === "POST") {
    if (!authorizeTelemetryRequest(req)) {
      return sendJson(res, 401, { error: "Unauthorized telemetry request" });
    }

    const store = await loadTelemetryStoreAsync();
    const session = store.sessions[finalizeMatch];
    if (!session) {
      return sendJson(res, 404, { error: "Session not found" });
    }

    await updateTelemetrySessionLifecycle(finalizeMatch, "finalized", "finalized_at");
    return sendJson(res, 200, { ok: true });
  }

  const abandonMatch = matchPath(url.pathname, "/api/telemetry/sessions/", "/abandon");
  if (abandonMatch && req.method === "POST") {
    if (!authorizeTelemetryRequest(req)) {
      return sendJson(res, 401, { error: "Unauthorized telemetry request" });
    }

    const store = await loadTelemetryStoreAsync();
    const session = store.sessions[abandonMatch];
    if (!session) {
      return sendJson(res, 404, { error: "Session not found" });
    }

    await updateTelemetrySessionLifecycle(abandonMatch, "abandoned", "abandoned_at");
    return sendJson(res, 200, { ok: true });
  }

  const statusMatch = matchPath(url.pathname, "/api/telemetry/sessions/", "/status");
  if (statusMatch && req.method === "GET") {
    if (!authorizeTelemetryRequest(req)) {
      return sendJson(res, 401, { error: "Unauthorized telemetry request" });
    }

    const store = await loadTelemetryStoreAsync();
    const session = store.sessions[statusMatch];
    if (!session) {
      return sendJson(res, 404, { error: "Session not found" });
    }

    const samples = store.samples[statusMatch] ?? [];
    return sendJson(res, 200, {
      latestAckedSeq: samples.length ? samples[samples.length - 1]?.sampleSeq : null,
      pendingCount: 0,
      status: session.status,
    });
  }

  const hrWindowMatch = matchPath(url.pathname, "/api/telemetry/sessions/", "/hr-window");
  if (hrWindowMatch && req.method === "GET") {
   const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const elapsedFromMs = url.searchParams.get("elapsedFromMs");
    const elapsedToMs = url.searchParams.get("elapsedToMs");
    const hasWallClockWindow = Boolean(from && to);
    const hasElapsedWindow = Boolean(elapsedFromMs && elapsedToMs);
    if (!hasWallClockWindow && !hasElapsedWindow) {
      return sendJson(res, 400, { error: "Expected either from/to or elapsedFromMs/elapsedToMs query parameters" });
    }

    const store = await loadTelemetryStoreAsync();
    const session = store.sessions[hrWindowMatch];
    if (!session) {
      return sendJson(res, 404, { error: "Session not found" });
    }

    let samples = store.samples[hrWindowMatch] ?? [];
    if (hasWallClockWindow) {
      const fromTime = Date.parse(from!);
      const toTime = Date.parse(to!);
      if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
        return sendJson(res, 400, { error: "Invalid from/to timestamps" });
      }
      samples = samples.filter((sample) => {
        const observedAt = Date.parse(sample.phoneObservedAt);
        return observedAt >= fromTime && observedAt <= toTime;
      });
    }
    if (hasElapsedWindow) {
      const lowerBound = Number(elapsedFromMs);
      const upperBound = Number(elapsedToMs);
      if (!Number.isFinite(lowerBound) || !Number.isFinite(upperBound)) {
        return sendJson(res, 400, { error: "Invalid elapsedFromMs/elapsedToMs values" });
      }
      samples = samples.filter((sample) => (
        sample.elapsedMsSinceSessionStart >= lowerBound &&
        sample.elapsedMsSinceSessionStart <= upperBound
      ));
    }

    return sendJson(res, 200, {
      sessionId: hrWindowMatch,
      from: from ?? null,
      to: to ?? null,
      elapsedFromMs: elapsedFromMs ? Number(elapsedFromMs) : null,
      elapsedToMs: elapsedToMs ? Number(elapsedToMs) : null,
      eventTimezone: session.eventTimezone,
      eventUtcOffsetSeconds: session.eventUtcOffsetSeconds,
      clientStartedAt: session.clientStartedAt,
      createdAt: session.createdAt,
      sampleCount: samples.length,
      samples,
      stats: summarizeHeartRate(samples),
    });
  }

  if (req.method === "GET") {
    return serveStaticAsset(url.pathname, res);
  }

  sendJson(res, 404, { error: "Not found" });
});

const wss = new WebSocketServer({ server, path: "/ws" });
const rooms = new Map<string, Set<WebSocket>>();

wss.on("connection", (socket) => {
  let roomId: string | null = null;

  socket.on("message", (rawMessage) => {
    const message = parseMessage(rawMessage.toString());
    if (!message) {
      socket.send(JSON.stringify({ type: "error", message: "Invalid signaling payload" }));
      return;
    }

    if (message.type === "join") {
      roomId = message.roomId;
      const peers = rooms.get(roomId) ?? new Set<WebSocket>();
      const existingPeers = Array.from(peers);
      peers.add(socket);
      rooms.set(roomId, peers);
      socket.send(JSON.stringify({ type: "joined", roomId, peers: peers.size }));
      for (const peer of existingPeers) {
        if (peer.readyState === peer.OPEN) {
          peer.send(JSON.stringify({ type: "peer-joined", roomId, peers: peers.size }));
        }
      }
      return;
    }

    if (!roomId) {
      socket.send(JSON.stringify({ type: "error", message: "Join a room before signaling" }));
      return;
    }

    relayToPeers(roomId, socket, message);
  });

  socket.on("close", () => {
    if (!roomId) {
      return;
    }

    const peers = rooms.get(roomId);
    if (!peers) {
      return;
    }

    peers.delete(socket);
    for (const peer of peers) {
      if (peer.readyState === peer.OPEN) {
        peer.send(JSON.stringify({ type: "peer-left", roomId, peers: peers.size }));
      }
    }
    if (peers.size === 0) {
      rooms.delete(roomId);
    }
  });
});

server.listen(port, () => {
  console.log(`PreCannes signaling server listening on http://localhost:${port}`);
  startIntervalAutomation();
});

function relayToPeers(roomId: string, sender: WebSocket, message: SignalingMessage) {
  const peers = rooms.get(roomId);
  if (!peers) {
    return;
  }

  for (const peer of peers) {
    if (peer !== sender && peer.readyState === peer.OPEN) {
      peer.send(JSON.stringify(message));
    }
  }
}

async function getIceServers(provider: IceConfigResponse["provider"]): Promise<RTCIceServer[]> {
  if (provider === "twilio") {
    return [
      { urls: ["stun:global.stun.twilio.com:3478"] },
      { urls: ["stun:stun.cloudflare.com:3478"] },
      { urls: ["stun:stun.l.google.com:19302"] },
      { urls: ["stun:stun1.l.google.com:19302"] },
    ];
  }

  if (cloudflareTurnKeyId && cloudflareTurnApiToken) {
    const cloudflareIceServers = await fetchCloudflareTurnIceServers();
    return filterCloudflareIceServers(cloudflareIceServers);
  }

  return [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    { urls: ["stun:stun.l.google.com:19302"] },
    { urls: ["stun:stun1.l.google.com:19302"] },
  ];
}

async function fetchCloudflareTurnIceServers() {
  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${cloudflareTurnKeyId}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cloudflareTurnApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: cloudflareTurnTtl }),
    },
  );

  if (!response.ok) {
    throw new Error(`Cloudflare TURN credentials request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { iceServers?: RTCIceServer[] };
  if (!payload.iceServers?.length) {
    throw new Error("Cloudflare TURN credentials response did not include iceServers");
  }

  return payload.iceServers;
}

function filterCloudflareIceServers(iceServers: RTCIceServer[]) {
  return iceServers.map((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return {
      ...server,
      urls: urls.filter((url) => !url.includes(":53")),
    };
  });
}

function parseMessage(rawMessage: string): SignalingMessage | null {
  try {
    const parsed = JSON.parse(rawMessage) as SignalingMessage;
    if (typeof parsed !== "object" || parsed === null || typeof parsed.type !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function sendJson(
  res: import("node:http").ServerResponse,
  statusCode: number,
  payload: unknown,
) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function applyCorsHeaders(res: import("node:http").ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-API-Key");
}

function serveStaticAsset(pathname: string, res: import("node:http").ServerResponse) {
  if (!existsSync(distDir)) {
    sendJson(res, 404, { error: "Frontend not built yet" });
    return;
  }

  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const requestedFile = normalize(join(distDir, normalizedPath));
  const indexFile = join(distDir, "index.html");

  if (!requestedFile.startsWith(distDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  const hasKnownExtension = extname(requestedFile) !== "";
  if (hasKnownExtension && !existsSync(requestedFile)) {
    sendJson(res, 404, { error: "Asset not found" });
    return;
  }
  const filePath = hasKnownExtension && existsSync(requestedFile) ? requestedFile : indexFile;
  const stream = createReadStream(filePath);

  res.statusCode = 200;
  res.setHeader("Content-Type", getContentType(filePath));
  stream.pipe(res);
}

function getContentType(filePath: string) {
  const extension = extname(filePath);

  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function loadServerEnv() {
  for (const fileName of [".env", ".env.local"]) {
    const filePath = join(process.cwd(), fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function ensureTelemetryStorage() {
  mkdirSync(telemetryDir, { recursive: true });
  if (!existsSync(sessionsFilePath)) {
    writeFileSync(sessionsFilePath, JSON.stringify({}, null, 2));
  }
  if (!existsSync(samplesFilePath)) {
    writeFileSync(samplesFilePath, JSON.stringify({}, null, 2));
  }
}

function ensureFaucetStorage() {
  mkdirSync(faucetDir, { recursive: true });
  if (!existsSync(faucetClaimsFilePath)) {
    writeFileSync(faucetClaimsFilePath, JSON.stringify({}, null, 2));
  }
}

function ensureSwimStorage() {
  if (!existsSync(swimFilePath)) {
    writeFileSync(swimFilePath, JSON.stringify({
      swimEventId: "",
      status: "idle",
      startedAt: null,
      finishedAt: null,
      closeAt: null,
    }, null, 2));
  }
}

function ensureMarketRegistryStorage() {
  if (!existsSync(marketRegistryFilePath)) {
    writeFileSync(marketRegistryFilePath, JSON.stringify({}, null, 2));
  }
}

function ensureIntervalMarketRegistryStorage() {
  if (!existsSync(intervalMarketRegistryFilePath)) {
    writeFileSync(intervalMarketRegistryFilePath, JSON.stringify({}, null, 2));
  }
}

function loadTelemetryStore(): TelemetryStore {
  ensureTelemetryStorage();
  const sessions = JSON.parse(readFileSync(sessionsFilePath, "utf8")) as TelemetryStore["sessions"];
  const samples = JSON.parse(readFileSync(samplesFilePath, "utf8")) as TelemetryStore["samples"];
  return { sessions, samples };
}

function saveTelemetryStore(store: TelemetryStore) {
  writeFileSync(sessionsFilePath, JSON.stringify(store.sessions, null, 2));
  writeFileSync(samplesFilePath, JSON.stringify(store.samples, null, 2));
}

async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
) {
  if (!supabaseTelemetryEnabled) {
    throw new Error("Supabase telemetry is not configured");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${body}`);
  }

  const raw = await response.text();
  if (response.status === 204 || !raw.trim()) {
    return null as T;
  }

  return JSON.parse(raw) as T;
}

function withSupabasePagination(path: string, limit: number, offset: number) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}limit=${limit}&offset=${offset}`;
}

async function supabaseRequestAll<T>(
  path: string,
  pageSize = 1000,
) {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const batch = await supabaseRequest<T[]>(
      withSupabasePagination(path, pageSize, offset),
    );
    rows.push(...batch);
    if (batch.length < pageSize) {
      return rows;
    }
    offset += pageSize;
  }
}

function mapSupabaseSession(row: SupabaseTelemetrySessionRow): TelemetrySessionRecord {
  return {
    sessionId: row.session_id,
    athleteId: row.athlete_id,
    eventId: row.event_id,
    notes: row.notes,
    createdAt: row.created_at,
    eventTimezone: row.event_timezone,
    eventUtcOffsetSeconds: row.event_utc_offset_seconds,
    clientStartedAt: row.client_started_at,
    status: row.status,
    finalizedAt: row.finalized_at ?? undefined,
    abandonedAt: row.abandoned_at ?? undefined,
  };
}

function mapSupabaseSample(row: SupabaseTelemetrySampleRow): TelemetrySampleRecord {
  return {
    sessionId: row.session_id,
    sampleSeq: row.sample_seq,
    bpm: row.bpm,
    rrIntervalsMs: Array.isArray(row.rr_intervals_ms) ? row.rr_intervals_ms : null,
    rmssd: typeof row.rmssd === "number" ? row.rmssd : null,
    sdnn: typeof row.sdnn === "number" ? row.sdnn : null,
    steps: typeof row.steps === "number" ? row.steps : null,
    deviceObservedAt: row.device_observed_at,
    phoneObservedAt: row.phone_observed_at,
    serverReceivedAt: row.server_received_at,
    elapsedMsSinceSessionStart: row.elapsed_ms_since_session_start,
  };
}

async function loadTelemetryStoreAsync(): Promise<TelemetryStore> {
  if (!supabaseTelemetryEnabled) {
    return loadTelemetryStore();
  }

  const [sessionRows, sampleRows] = await Promise.all([
    supabaseRequestAll<SupabaseTelemetrySessionRow>("telemetry_sessions?select=*&order=created_at.asc"),
    supabaseRequestAll<SupabaseTelemetrySampleRow>("telemetry_samples?select=*&order=session_id.asc,sample_seq.asc"),
  ]);

  const sessions = Object.fromEntries(sessionRows.map((row) => {
    const session = mapSupabaseSession(row);
    return [session.sessionId, session];
  }));
  const samples: Record<string, TelemetrySampleRecord[]> = {};
  for (const row of sampleRows) {
    const sample = mapSupabaseSample(row);
    samples[sample.sessionId] ??= [];
    samples[sample.sessionId].push(sample);
  }
  return { sessions, samples };
}

async function createTelemetrySession(session: TelemetrySessionRecord) {
  if (!supabaseTelemetryEnabled) {
    const store = loadTelemetryStore();
    store.sessions[session.sessionId] = session;
    store.samples[session.sessionId] = [];
    saveTelemetryStore(store);
    return;
  }

  await supabaseRequest("telemetry_sessions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      session_id: session.sessionId,
      athlete_id: session.athleteId,
      event_id: session.eventId,
      notes: session.notes,
      created_at: session.createdAt,
      event_timezone: session.eventTimezone,
      event_utc_offset_seconds: session.eventUtcOffsetSeconds,
      client_started_at: session.clientStartedAt,
      status: session.status,
      finalized_at: session.finalizedAt ?? null,
      abandoned_at: session.abandonedAt ?? null,
    }]),
  });
}

async function ensureTelemetrySessionExists(
  sessionId: string,
  normalizedSamples: TelemetrySamplePayload[],
  existingSession: TelemetrySessionRecord | undefined,
) {
  if (existingSession) {
    return existingSession;
  }

  const firstSample = normalizedSamples[0];
  const createdAt = new Date().toISOString();
  const inferredClientStartedAt = firstSample
    ? new Date(Date.parse(firstSample.phoneObservedAt) - firstSample.elapsedMsSinceSessionStart).toISOString()
    : createdAt;

  const session: TelemetrySessionRecord = {
    sessionId,
    athleteId: null,
    eventId: null,
    notes: "Auto-recovered from sample upload",
    createdAt,
    eventTimezone: null,
    eventUtcOffsetSeconds: null,
    clientStartedAt: inferredClientStartedAt,
    status: "active",
  };
  await createTelemetrySession(session);
  return session;
}

async function upsertTelemetrySamples(sessionId: string, samples: TelemetrySampleRecord[]) {
  if (!supabaseTelemetryEnabled) {
    const store = loadTelemetryStore();
    const existingBySeq = new Map((store.samples[sessionId] ?? []).map((sample) => [sample.sampleSeq, sample]));
    for (const sample of samples) {
      existingBySeq.set(sample.sampleSeq, sample);
    }
    store.samples[sessionId] = Array.from(existingBySeq.values()).sort((a, b) => a.sampleSeq - b.sampleSeq);
    saveTelemetryStore(store);
    return;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/telemetry_samples?on_conflict=session_id,sample_seq`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(samples.map((sample) => ({
      session_id: sample.sessionId,
      sample_seq: sample.sampleSeq,
      bpm: sample.bpm,
      rr_intervals_ms: sample.rrIntervalsMs ?? null,
      rmssd: sample.rmssd ?? null,
      sdnn: sample.sdnn ?? null,
      steps: sample.steps ?? null,
      device_observed_at: sample.deviceObservedAt,
      phone_observed_at: sample.phoneObservedAt,
      server_received_at: sample.serverReceivedAt,
      elapsed_ms_since_session_start: sample.elapsedMsSinceSessionStart,
    }))),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase sample upsert failed (${response.status}): ${body}`);
  }
}

async function updateTelemetrySessionLifecycle(
  sessionId: string,
  status: TelemetrySessionRecord["status"],
  timestampField: "finalized_at" | "abandoned_at",
) {
  if (!supabaseTelemetryEnabled) {
    const store = loadTelemetryStore();
    const session = store.sessions[sessionId];
    if (!session) {
      return null;
    }
    session.status = status;
    if (timestampField === "finalized_at") {
      session.finalizedAt = new Date().toISOString();
    } else {
      session.abandonedAt = new Date().toISOString();
    }
    saveTelemetryStore(store);
    return session;
  }

  const timestamp = new Date().toISOString();
  const rows = await supabaseRequest<SupabaseTelemetrySessionRow[]>(
    `telemetry_sessions?session_id=eq.${encodeURIComponent(sessionId)}&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status,
        [timestampField]: timestamp,
      }),
    },
  );
  return rows[0] ? mapSupabaseSession(rows[0]) : null;
}

function loadFaucetClaims() {
  ensureFaucetStorage();
  return JSON.parse(readFileSync(faucetClaimsFilePath, "utf8")) as FaucetClaimsStore;
}

function saveFaucetClaims(store: FaucetClaimsStore) {
  writeFileSync(faucetClaimsFilePath, JSON.stringify(store, null, 2));
}

function loadSwimEvent() {
  ensureSwimStorage();
  return JSON.parse(readFileSync(swimFilePath, "utf8")) as SwimEventRecord;
}

function saveSwimEvent(event: SwimEventRecord) {
  writeFileSync(swimFilePath, JSON.stringify(event, null, 2));
}

function loadMarketRegistry() {
  ensureMarketRegistryStorage();
  return JSON.parse(readFileSync(marketRegistryFilePath, "utf8")) as MarketRegistryStore;
}

function saveMarketRegistry(store: MarketRegistryStore) {
  writeFileSync(marketRegistryFilePath, JSON.stringify(store, null, 2));
}

function intervalMarketRecordKey(sessionId: string, metric: IntervalMetric, windowStartElapsedMs: number) {
  return `${metric}:${sessionId}:${windowStartElapsedMs}`;
}

function loadIntervalMarketRegistry() {
  ensureIntervalMarketRegistryStorage();
  return JSON.parse(readFileSync(intervalMarketRegistryFilePath, "utf8")) as IntervalMarketRegistryStore;
}

function saveIntervalMarketRegistry(store: IntervalMarketRegistryStore) {
  writeFileSync(intervalMarketRegistryFilePath, JSON.stringify(store, null, 2));
}

function summarizeSessions(store: TelemetryStore) {
  return Object.values(store.sessions).map((session) => {
    const samples = store.samples[session.sessionId] ?? [];
    return {
      ...session,
      sampleCount: samples.length,
      firstSampleAt: samples[0]?.phoneObservedAt ?? null,
      lastSampleAt: samples[samples.length - 1]?.phoneObservedAt ?? null,
      firstElapsedMs: samples[0]?.elapsedMsSinceSessionStart ?? null,
      lastElapsedMs: samples[samples.length - 1]?.elapsedMsSinceSessionStart ?? null,
    };
  });
}

function getSortedSamples(store: TelemetryStore, sessionId: string) {
  return (store.samples[sessionId] ?? [])
    .slice()
    .sort((a, b) => a.elapsedMsSinceSessionStart - b.elapsedMsSinceSessionStart);
}

function selectCurrentLiveSession(store: TelemetryStore) {
  return summarizeSessions(store)
    .filter((session) => session.status === "active" && (session.sampleCount ?? 0) > 0 && session.notes !== "Auto-recovered from sample upload")
    .sort((left, right) => {
      const leftSampleTime = Date.parse(left.lastSampleAt ?? left.createdAt);
      const rightSampleTime = Date.parse(right.lastSampleAt ?? right.createdAt);
      if (leftSampleTime !== rightSampleTime) {
        return rightSampleTime - leftSampleTime;
      }
      return (right.sampleCount ?? 0) - (left.sampleCount ?? 0);
    })[0] ?? null;
}

function authorizeTelemetryRequest(req: import("node:http").IncomingMessage) {
  if (!telemetryApiKey) {
    return true;
  }
  return req.headers["x-api-key"] === telemetryApiKey;
}

function matchPath(pathname: string, prefix: string, suffix: string) {
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    return null;
  }
  const candidate = pathname.slice(prefix.length, pathname.length - suffix.length);
  return candidate || null;
}

async function readJsonBody(req: import("node:http").IncomingMessage) {
  const raw = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("Request body aborted")));
  });
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(`${message}`);
  }
}

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNullableIsoTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function normalizeAddress(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : null;
}

function normalizePrivateKey(value: string) {
  const trimmed = value.trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(withPrefix)) {
    throw new Error("Invalid BASE_PRIVATE_KEY format");
  }
  return withPrefix as `0x${string}`;
}

function normalizeSamplePayload(sample: TelemetrySamplePayload): TelemetrySamplePayload {
  if (!Number.isInteger(sample.sampleSeq) || sample.sampleSeq <= 0) {
    throw new Error("sampleSeq must be a positive integer");
  }
  if (!Number.isFinite(sample.bpm) || sample.bpm <= 0) {
    throw new Error("bpm must be a positive number");
  }
  if (!sample.phoneObservedAt || Number.isNaN(Date.parse(sample.phoneObservedAt))) {
    throw new Error("phoneObservedAt must be a valid ISO timestamp");
  }
  if (!Number.isFinite(sample.elapsedMsSinceSessionStart) || sample.elapsedMsSinceSessionStart < 0) {
    throw new Error("elapsedMsSinceSessionStart must be a non-negative number");
  }

  const deviceObservedAt =
    sample.deviceObservedAt && !Number.isNaN(Date.parse(sample.deviceObservedAt))
      ? sample.deviceObservedAt
      : null;
  const rrIntervalsMs = Array.isArray(sample.rrIntervalsMs)
    ? sample.rrIntervalsMs
        .filter((value): value is number => Number.isFinite(value) && value > 0)
        .map((value) => Number(value.toFixed(2)))
    : null;
  const rmssd = typeof sample.rmssd === "number" && Number.isFinite(sample.rmssd) && sample.rmssd >= 0
    ? Number(sample.rmssd.toFixed(2))
    : null;
  const sdnn = typeof sample.sdnn === "number" && Number.isFinite(sample.sdnn) && sample.sdnn >= 0
    ? Number(sample.sdnn.toFixed(2))
    : null;
  const steps = Number.isFinite(sample.steps) && typeof sample.steps === "number" && sample.steps >= 0
    ? Math.round(sample.steps)
    : null;

  return {
    sampleSeq: sample.sampleSeq,
    bpm: Math.round(sample.bpm),
    rrIntervalsMs: rrIntervalsMs?.length ? rrIntervalsMs : null,
    rmssd,
    sdnn,
    steps,
    deviceObservedAt,
    phoneObservedAt: new Date(sample.phoneObservedAt).toISOString(),
    elapsedMsSinceSessionStart: Math.round(sample.elapsedMsSinceSessionStart),
  };
}

function summarizeHeartRate(samples: TelemetrySampleRecord[]) {
  if (samples.length === 0) {
    return {
      minBpm: null,
      maxBpm: null,
      averageBpm: null,
      latestBpm: null,
      latestRmssd: null,
      latestSdnn: null,
      samplesWithRR: 0,
    };
  }

  const bpmValues = samples.map((sample) => sample.bpm);
  const sum = bpmValues.reduce((accumulator, bpm) => accumulator + bpm, 0);
  const latestWithHRV = samples
    .slice()
    .reverse()
    .find((sample) => sample.rmssd !== null || sample.sdnn !== null);
  const samplesWithRR = samples.filter((sample) => (sample.rrIntervalsMs?.length ?? 0) > 0).length;

  return {
    minBpm: Math.min(...bpmValues),
    maxBpm: Math.max(...bpmValues),
    averageBpm: Number((sum / bpmValues.length).toFixed(2)),
    latestBpm: samples[samples.length - 1]?.bpm ?? null,
    latestRmssd: latestWithHRV?.rmssd ?? null,
    latestSdnn: latestWithHRV?.sdnn ?? null,
    samplesWithRR,
  };
}

function resolveExactHeartRate(samples: TelemetrySampleRecord[], targetMs: number) {
  let bestSample = samples[0];
  let bestDistance = Math.abs((bestSample?.elapsedMsSinceSessionStart ?? 0) - targetMs);

  for (const sample of samples.slice(1)) {
    const distance = Math.abs(sample.elapsedMsSinceSessionStart - targetMs);
    if (distance < bestDistance) {
      bestSample = sample;
      bestDistance = distance;
      continue;
    }

    if (distance === bestDistance && sample.elapsedMsSinceSessionStart < bestSample.elapsedMsSinceSessionStart) {
      bestSample = sample;
      bestDistance = distance;
    }
  }

  return {
    sample: bestSample,
    distanceMs: bestDistance,
  };
}

function latestRrIntervalMs(sample: TelemetrySampleRecord) {
  const latest = sample.rrIntervalsMs?.at(-1);
  if (typeof latest !== "number" || !Number.isFinite(latest) || latest <= 0) {
    return null;
  }
  return Math.round(latest);
}

function signalTypeForMetric(metric: "hr" | "rr" | "steps") {
  if (metric === "rr") {
    return 7;
  }
  if (metric === "steps") {
    return 3;
  }
  return 0;
}

function sessionHashForSignalType(sessionId: string, signalType: number) {
  return signalType === 7 ? hashMetricSessionId(sessionId, "rr") : hashSessionId(sessionId);
}

function signalLabel(signalType: number) {
  switch (signalType) {
    case 0:
      return "heart_rate";
    case 1:
      return "hrv_rmssd";
    case 2:
      return "hrv_sdnn";
    case 3:
      return "steps";
    case 4:
      return "cadence";
    case 5:
      return "pace";
    case 6:
      return "distance";
    case 7:
      return "rr_interval";
    default:
      return "unknown";
  }
}

function signalUnit(signalType: number) {
  switch (signalType) {
    case 0:
      return "bpm";
    case 1:
    case 2:
    case 7:
      return "ms";
    case 3:
      return "steps";
    case 4:
      return "steps/s";
    case 5:
      return "s/m";
    case 6:
      return "m";
    default:
      return "units";
  }
}

function signalScalarFromSample(sample: TelemetrySampleRecord, signalType: number) {
  switch (signalType) {
    case 0:
      return sample.bpm;
    case 1:
      return sample.rmssd ?? null;
    case 2:
      return sample.sdnn ?? null;
    case 3:
      return sample.steps ?? null;
    case 7:
      return latestRrIntervalMs(sample);
    default:
      return null;
  }
}

function metricScalarFromSample(sample: TelemetrySampleRecord, metric: "hr" | "rr" | "steps") {
  if (metric === "rr") {
    return latestRrIntervalMs(sample);
  }
  if (metric === "steps") {
    return sample.steps ?? null;
  }
  return sample.bpm;
}

function resolveLatestMetricAtOrBefore(samples: TelemetrySampleRecord[], targetMs: number, metric: "hr" | "rr" | "steps") {
  let latestResult: { sample: TelemetrySampleRecord; value: number } | null = null;

  for (const sample of samples) {
    if (sample.elapsedMsSinceSessionStart > targetMs) {
      break;
    }
    const value = metricScalarFromSample(sample, metric);
    if (value === null) {
      continue;
    }
    latestResult = { sample, value };
  }

  return latestResult;
}

function resolveFirstMetricAtOrAfter(samples: TelemetrySampleRecord[], targetMs: number, metric: "hr" | "rr" | "steps") {
  for (const sample of samples) {
    if (sample.elapsedMsSinceSessionStart < targetMs) {
      continue;
    }
    const value = metricScalarFromSample(sample, metric);
    if (value === null) {
      continue;
    }
    return { sample, value };
  }

  return null;
}

function resolveLatestSignalAtOrBefore(samples: TelemetrySampleRecord[], targetMs: number, signalType: number) {
  let latestResult: { sample: TelemetrySampleRecord; value: number } | null = null;

  for (const sample of samples) {
    if (sample.elapsedMsSinceSessionStart > targetMs) {
      break;
    }
    const value = signalScalarFromSample(sample, signalType);
    if (value === null) {
      continue;
    }
    latestResult = { sample, value };
  }

  return latestResult;
}

function resolveFirstSignalAtOrAfter(samples: TelemetrySampleRecord[], targetMs: number, signalType: number) {
  for (const sample of samples) {
    if (sample.elapsedMsSinceSessionStart < targetMs) {
      continue;
    }
    const value = signalScalarFromSample(sample, signalType);
    if (value === null) {
      continue;
    }
    return { sample, value };
  }

  return null;
}

function resolveExactMetricValue(samples: TelemetrySampleRecord[], targetMs: number, metric: "hr" | "rr" | "steps") {
  let bestResult: { sample: TelemetrySampleRecord; value: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const sample of samples) {
    const value = metricScalarFromSample(sample, metric);
    if (value === null) {
      continue;
    }
    const distance = Math.abs(sample.elapsedMsSinceSessionStart - targetMs);
    if (distance < bestDistance) {
      bestResult = { sample, value };
      bestDistance = distance;
      continue;
    }
    if (
      distance === bestDistance &&
      bestResult &&
      sample.elapsedMsSinceSessionStart < bestResult.sample.elapsedMsSinceSessionStart
    ) {
      bestResult = { sample, value };
      bestDistance = distance;
    }
  }

  return bestResult;
}

function resolveExactSignalValue(samples: TelemetrySampleRecord[], targetMs: number, signalType: number) {
  let bestResult: { sample: TelemetrySampleRecord; value: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const sample of samples) {
    const value = signalScalarFromSample(sample, signalType);
    if (value === null) {
      continue;
    }
    const distance = Math.abs(sample.elapsedMsSinceSessionStart - targetMs);
    if (distance < bestDistance) {
      bestResult = { sample, value };
      bestDistance = distance;
      continue;
    }
    if (
      distance === bestDistance &&
      bestResult &&
      sample.elapsedMsSinceSessionStart < bestResult.sample.elapsedMsSinceSessionStart
    ) {
      bestResult = { sample, value };
      bestDistance = distance;
    }
  }

  return bestResult ? { ...bestResult, distanceMs: bestDistance } : null;
}

function resolveWindowSignalDelta(
  samples: TelemetrySampleRecord[],
  startMs: number,
  endMs: number,
  signalType: number,
) {
  const startResult =
    resolveLatestSignalAtOrBefore(samples, startMs, signalType) ??
    resolveFirstSignalAtOrAfter(samples, startMs, signalType);
  const endResult = resolveLatestSignalAtOrBefore(samples, endMs, signalType);

  if (!startResult || !endResult) {
    return null;
  }
  if (endResult.sample.elapsedMsSinceSessionStart < startResult.sample.elapsedMsSinceSessionStart) {
    return null;
  }

  return {
    value: Math.max(0, Math.round(endResult.value - startResult.value)),
    start: startResult,
    end: endResult,
  };
}

function hashMetricSessionId(sessionId: string, metric: "hr" | "rr" | "steps") {
  return metric === "rr" ? hashSessionId(`${metric}:${sessionId}`) : hashSessionId(sessionId);
}

function intervalLockKey(sessionId: string, metric: "hr" | "rr" | "steps") {
  return `${metric}:${sessionId}`;
}

async function ensureVisibleIntervalMarkets(sessionId: string, metric: "hr" | "rr" | "steps" = "hr") {
  const lockKey = intervalLockKey(sessionId, metric);
  const existingLock = intervalMarketLocks.get(lockKey);
  if (existingLock) {
    return existingLock;
  }

  const creationPromise = ensureVisibleIntervalMarketsUnlocked(sessionId, metric);
  intervalMarketLocks.set(lockKey, creationPromise);
  try {
    return await creationPromise;
  } finally {
    intervalMarketLocks.delete(lockKey);
  }
}

async function ensureVisibleIntervalMarketsUnlocked(sessionId: string, metric: "hr" | "rr" | "steps") {
  if (!predictionMarketAddress) {
    throw new Error("Prediction market contract is not configured on the backend");
  }
  if (!faucetPrivateKey || !collateralTokenAddress) {
    throw new Error("Backend wallet is not configured for automatic interval markets");
  }

  const store = await loadTelemetryStoreAsync();
  const session = store.sessions[sessionId];
  if (!session) {
    throw new Error("Session not found");
  }
  const samples = (store.samples[sessionId] ?? []).slice().sort((a, b) => a.elapsedMsSinceSessionStart - b.elapsedMsSinceSessionStart);
  if (samples.length === 0) {
    throw new Error("Current 5-minute interval is not available yet");
  }

  const specs = await visibleIntervalSpecs(session, metric);
  if (specs.length === 0) {
    throw new Error("Current 5-minute interval is not available yet");
  }

  const registry = loadMarketRegistry();
  const account = privateKeyToAccount(normalizePrivateKey(faucetPrivateKey));
  const walletClient = createWalletClient({
    account,
    chain: arcTestnetChain,
    transport: http(baseRpcUrl),
  });
  const nonceCursor: NonceCursor = {
    value: await publicClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    }),
  };

  await ensureIntervalOperatorBalanceAndApproval(account, walletClient, nonceCursor);
  let created = false;
  let latestMarketId: number | null = null;
  const currentSpec = specs[specs.length - 1];
  await settleDueIntervalMarkets(sessionId, metric, samples, registry, walletClient, account, nonceCursor);
  for (const spec of specs) {
    const existing = Object.values(registry).find((record) => (
      record.type === intervalRegistryType(metric) &&
      record.referenceId === sessionId &&
      record.intervalMinutes === 5 &&
      intervalRecordReferenceValue(record, metric) === spec.referenceValue &&
      record.createdAt >= new Date(spec.startAt).toISOString() &&
      record.createdAt < new Date(spec.endAt).toISOString()
    ));
    if (existing) {
      if (spec.startElapsedMs === currentSpec.startElapsedMs) {
        latestMarketId = existing.marketId;
      }
      continue;
    }

    const nextMarketId = await publicClient.readContract({
      address: predictionMarketAddress as `0x${string}`,
      abi: predictionMarketAbi,
      functionName: "nextMarketId",
    });

    await walletClient.sendTransaction({
      account,
      chain: arcTestnetChain,
      to: predictionMarketAddress as `0x${string}`,
      data: encodeFunctionData({
        abi: predictionMarketAbi,
        functionName: "createThresholdMarket",
        args: [
          hashMetricSessionId(sessionId, metric),
          BigInt(spec.endElapsedMs),
          BigInt(spec.endElapsedMs),
          BigInt(spec.referenceValue),
          0,
          signalTypeForMetric(metric),
          autoIntervalSeedAmount,
        ],
      }),
      nonce: nonceCursor.value++,
      maxFeePerGas: intervalMaxFeePerGas,
      maxPriorityFeePerGas: intervalMaxPriorityFeePerGas,
    });

    const marketId = Number(nextMarketId);
    registry[String(marketId)] = {
      marketId,
      type: intervalRegistryType(metric),
      referenceId: sessionId,
      threshold: spec.referenceValue,
      direction: "over",
      signalType: signalTypeForMetric(metric),
      intervalMinutes: 5,
      windowStartElapsedMs: spec.startElapsedMs,
      windowEndElapsedMs: spec.endElapsedMs,
      referenceBpm: metric === "hr" ? spec.referenceValue : null,
      referenceRrMs: metric === "rr" ? spec.referenceValue : null,
      referenceSteps: metric === "steps" ? spec.referenceValue : null,
      createdAt: spec.startAt.toISOString(),
    };
    if (spec.startElapsedMs === currentSpec.startElapsedMs) {
      latestMarketId = marketId;
    }
    created = true;
  }

  saveMarketRegistry(registry);
  return {
    ok: true,
    metric,
    created,
    marketId: latestMarketId,
    referenceValue: currentSpec.referenceValue,
    startAt: currentSpec.startAt.toISOString(),
    endAt: currentSpec.endAt.toISOString(),
  };
}

async function settleDueIntervalMarkets(
  sessionId: string,
  metric: "hr" | "rr" | "steps",
  samples: TelemetrySampleRecord[],
  registry: MarketRegistryStore,
  walletClient: ReturnType<typeof createWalletClient>,
  account: ReturnType<typeof privateKeyToAccount>,
  nonceCursor: NonceCursor,
) {
  const records = Object.values(registry)
    .filter((record) => record.type === intervalRegistryType(metric) && record.referenceId === sessionId)
    .sort((left, right) => left.marketId - right.marketId);

  for (const record of records) {
    const marketId = BigInt(record.marketId);
    const market = (await publicClient.readContract({
      address: predictionMarketAddress as `0x${string}`,
      abi: predictionMarketAbi,
      functionName: "markets",
      args: [marketId],
    })) as readonly [
      bigint,
      `0x${string}`,
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      number,
      number,
      bigint,
      number,
      boolean,
      bigint,
      bigint,
      number,
      bigint,
      bigint,
      bigint,
    ];

    const t = Number(market[3]);
    let marketStatus = Number(market[9]);
    if (samples[samples.length - 1]!.elapsedMsSinceSessionStart < t) {
      continue;
    }
    if (marketStatus === 3 || marketStatus === 4) {
      continue;
    }

    if (metric === "steps") {
      const resolved = resolveWindowSignalDelta(samples, Math.max(0, t - 5 * 60_000), t, 3);
      if (!resolved) {
        continue;
      }
      const outcome = record.direction === "under"
        ? resolved.value < record.threshold
        : resolved.value > record.threshold;

      if (marketStatus === 0) {
        await sendPredictionMarketTx(walletClient, account, nonceCursor, "closeMarket", [marketId]);
        marketStatus = 1;
      }
      if (marketStatus === 1) {
        await sendPredictionMarketTx(walletClient, account, nonceCursor, "requestSettlement", [marketId]);
        marketStatus = 2;
      }
      if (marketStatus === 2) {
        await sendPredictionMarketTx(walletClient, account, nonceCursor, "fulfillSettlement", [
          marketId,
          outcome,
          BigInt(resolved.value),
          resolved.end.sample.sampleSeq,
          BigInt(resolved.end.sample.elapsedMsSinceSessionStart),
        ]);
      }
      continue;
    }

    const resolved = resolveExactMetricValue(samples, t, metric);
    if (!resolved) {
      continue;
    }
    const outcome = record.direction === "under"
      ? resolved.value < record.threshold
      : resolved.value > record.threshold;

    if (marketStatus === 0) {
      await sendPredictionMarketTx(walletClient, account, nonceCursor, "closeMarket", [marketId]);
      marketStatus = 1;
    }
    if (marketStatus === 1) {
      await sendPredictionMarketTx(walletClient, account, nonceCursor, "requestSettlement", [marketId]);
      marketStatus = 2;
    }
    if (marketStatus === 2) {
      await sendPredictionMarketTx(walletClient, account, nonceCursor, "fulfillSettlement", [
        marketId,
        outcome,
        BigInt(resolved.value),
        resolved.sample.sampleSeq,
        BigInt(resolved.sample.elapsedMsSinceSessionStart),
      ]);
    }
  }
}

async function sendPredictionMarketTx(
  walletClient: ReturnType<typeof createWalletClient>,
  account: ReturnType<typeof privateKeyToAccount>,
  nonceCursor: NonceCursor,
  functionName: "closeMarket" | "requestSettlement" | "fulfillSettlement",
  args: readonly unknown[],
) {
  await walletClient.sendTransaction({
    account,
    chain: arcTestnetChain,
    to: predictionMarketAddress as `0x${string}`,
    data: encodeFunctionData({
      abi: predictionMarketAbi,
      functionName,
      args: args as never,
    }),
    nonce: nonceCursor.value++,
    maxFeePerGas: intervalMaxFeePerGas,
    maxPriorityFeePerGas: intervalMaxPriorityFeePerGas,
  });
}

async function ensureIntervalOperatorBalanceAndApproval(
  account: ReturnType<typeof privateKeyToAccount>,
  walletClient: ReturnType<typeof createWalletClient>,
  nonceCursor: NonceCursor,
) {
  const address = account.address;
  const balance = await publicClient.readContract({
    address: collateralTokenAddress as `0x${string}`,
    abi: collateralTokenAbi,
    functionName: "balanceOf",
    args: [address],
  });
  if (balance < autoIntervalSeedAmount) {
    throw new Error(`Backend operator balance is below required ${COLLATERAL_SYMBOL} seed liquidity`);
  }

  const allowance = await publicClient.readContract({
    address: collateralTokenAddress as `0x${string}`,
    abi: collateralTokenAbi,
    functionName: "allowance",
    args: [address, predictionMarketAddress as `0x${string}`],
  });
  if (allowance < autoIntervalSeedAmount) {
    const hash = await walletClient.writeContract({
      account,
      chain: arcTestnetChain,
      address: collateralTokenAddress as `0x${string}`,
      abi: collateralTokenAbi,
      functionName: "approve",
      args: [predictionMarketAddress as `0x${string}`, autoIntervalSeedAmount * 1000000n],
      nonce: nonceCursor.value++,
      maxFeePerGas: intervalMaxFeePerGas,
      maxPriorityFeePerGas: intervalMaxPriorityFeePerGas,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }
}

function intervalRegistryType(metric: "hr" | "rr" | "steps") {
  if (metric === "rr") {
    return "rr_interval_direction";
  }
  if (metric === "steps") {
    return "steps_interval_direction";
  }
  return "hr_interval_direction";
}

function intervalRecordReferenceValue(record: MarketRegistryRecord, metric: "hr" | "rr" | "steps") {
  if (metric === "rr") {
    return record.referenceRrMs ?? record.threshold;
  }
  if (metric === "steps") {
    return record.referenceSteps ?? record.threshold;
  }
  return record.referenceBpm ?? record.threshold;
}

async function visibleIntervalSpecs(session: TelemetrySessionRecord, metric: "hr" | "rr" | "steps") {
  const store = await loadTelemetryStoreAsync();
  const samples = (store.samples[session.sessionId] ?? []).slice().sort((a, b) => a.elapsedMsSinceSessionStart - b.elapsedMsSinceSessionStart);
  if (samples.length === 0) {
    return [];
  }
  const startedAt = new Date(session.clientStartedAt ?? session.createdAt);
  const latestSampleElapsedMs = samples[samples.length - 1]?.elapsedMsSinceSessionStart ?? 0;
  const wallClockElapsedMs = Math.max(0, Date.now() - startedAt.getTime());
  const nowElapsedMs = session.status === "active"
    ? Math.max(wallClockElapsedMs, latestSampleElapsedMs)
    : latestSampleElapsedMs;
  const intervalMs = 5 * 60_000;
  const startElapsedMs = Math.floor(nowElapsedMs / intervalMs) * intervalMs;
  const specs: Array<{
    startElapsedMs: number;
    endElapsedMs: number;
    startAt: Date;
    endAt: Date;
    referenceValue: number;
  }> = [];
  for (let offset = 3; offset >= 0; offset -= 1) {
    const currentStartElapsedMs = startElapsedMs - offset * intervalMs;
    if (currentStartElapsedMs < 0) {
      continue;
    }
    const endElapsedMs = currentStartElapsedMs + intervalMs;
    const startAt = new Date(startedAt.getTime() + currentStartElapsedMs);
    const endAt = new Date(startedAt.getTime() + endElapsedMs);
    const reference = metric === "steps"
      ? resolveWindowSignalDelta(samples, Math.max(0, currentStartElapsedMs - intervalMs), currentStartElapsedMs, 3)
      : resolveLatestMetricAtOrBefore(samples, currentStartElapsedMs, metric) ??
        resolveFirstMetricAtOrAfter(samples, currentStartElapsedMs, metric) ??
        resolveExactMetricValue(samples, currentStartElapsedMs, metric);
    if (!reference && metric !== "steps") {
      continue;
    }
    specs.push({
      startElapsedMs: currentStartElapsedMs,
      endElapsedMs,
      startAt,
      endAt,
      referenceValue: reference?.value ?? 0,
    });
  }
  return specs;
}

async function createAutomatedIntervalMarket(
  session: ReturnType<typeof summarizeSessions>[number],
  metric: "hr" | "rr" | "steps",
  walletClient: ReturnType<typeof createWalletClient>,
  account: ReturnType<typeof privateKeyToAccount>,
  nonceCursor: NonceCursor,
) {
  if (!parimutuelIntervalMarketAddress) {
    return;
  }

  const specs = await visibleIntervalSpecs(session, metric);
  const currentSpec = specs.at(-1);
  if (!currentSpec) {
    return;
  }

  const existing = Object.values(loadIntervalMarketRegistry()).find((record) => (
    record.sessionId === session.sessionId &&
    record.metric === metric &&
    record.windowStartElapsedMs === currentSpec.startElapsedMs
  ));
  if (existing) {
    return;
  }

  const closesAtTimestamp = Math.floor(currentSpec.endAt.getTime() / 1000);
  if (closesAtTimestamp <= Math.floor(Date.now() / 1000)) {
    return;
  }

  const nextMarketId = await publicClient.readContract({
    address: parimutuelIntervalMarketAddress as `0x${string}`,
    abi: parimutuelIntervalMarketAbi,
    functionName: "nextMarketId",
  });

  const txHash = await walletClient.writeContract({
    account,
    chain: arcTestnetChain,
    address: parimutuelIntervalMarketAddress as `0x${string}`,
    abi: parimutuelIntervalMarketAbi,
    functionName: "createIntervalMarket",
    args: [
      hashMetricSessionId(session.sessionId, metric),
      BigInt(currentSpec.startElapsedMs),
      BigInt(currentSpec.endElapsedMs),
      BigInt(closesAtTimestamp),
      BigInt(currentSpec.referenceValue),
      signalTypeForMetric(metric),
    ],
    nonce: nonceCursor.value++,
    maxFeePerGas: intervalMaxFeePerGas,
    maxPriorityFeePerGas: intervalMaxPriorityFeePerGas,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const store = loadIntervalMarketRegistry();
  const key = intervalMarketRecordKey(session.sessionId, metric, currentSpec.startElapsedMs);
  store[key] = {
    marketId: Number(nextMarketId),
    sessionId: session.sessionId,
    metric,
    signalType: signalTypeForMetric(metric),
    referenceValue: currentSpec.referenceValue,
    windowStartElapsedMs: currentSpec.startElapsedMs,
    windowEndElapsedMs: currentSpec.endElapsedMs,
    tradingClosesAtTimestamp: closesAtTimestamp,
    createdAt: currentSpec.startAt.toISOString(),
  };
  saveIntervalMarketRegistry(store);
}

async function settleAutomatedIntervalMarkets(
  session: ReturnType<typeof summarizeSessions>[number],
  samples: TelemetrySampleRecord[],
  walletClient: ReturnType<typeof createWalletClient>,
  account: ReturnType<typeof privateKeyToAccount>,
  nonceCursor: NonceCursor,
) {
  if (!parimutuelIntervalMarketAddress) {
    return;
  }

  const records = Object.values(loadIntervalMarketRegistry())
    .filter((record) => record.sessionId === session.sessionId)
    .sort((left, right) => left.windowStartElapsedMs - right.windowStartElapsedMs);

  for (const record of records) {
    if ((session.lastElapsedMs ?? 0) < record.windowEndElapsedMs) {
      continue;
    }

    const market = await publicClient.readContract({
      address: parimutuelIntervalMarketAddress as `0x${string}`,
      abi: parimutuelIntervalMarketAbi,
      functionName: "markets",
      args: [BigInt(record.marketId)],
    });
    const status = Number(market[9]);
    if (status !== 0) {
      continue;
    }

    let observedValue: number;
    let sampleSeq: number;
    let sampleElapsedMs: number;

    if (record.metric === "steps") {
      const resolved = resolveWindowSignalDelta(samples, record.windowStartElapsedMs, record.windowEndElapsedMs, 3);
      if (!resolved) {
        continue;
      }
      observedValue = resolved.value;
      sampleSeq = resolved.end.sample.sampleSeq;
      sampleElapsedMs = resolved.end.sample.elapsedMsSinceSessionStart;
    } else {
      const resolved = resolveLatestMetricAtOrBefore(samples, record.windowEndElapsedMs, record.metric);
      if (!resolved) {
        continue;
      }
      observedValue = resolved.value;
      sampleSeq = resolved.sample.sampleSeq;
      sampleElapsedMs = resolved.sample.elapsedMsSinceSessionStart;
    }

    const txHash = await walletClient.writeContract({
      account,
      chain: arcTestnetChain,
      address: parimutuelIntervalMarketAddress as `0x${string}`,
      abi: parimutuelIntervalMarketAbi,
      functionName: "settleIntervalMarket",
      args: [
        BigInt(record.marketId),
        BigInt(observedValue),
        sampleSeq,
        BigInt(sampleElapsedMs),
      ],
      nonce: nonceCursor.value++,
      maxFeePerGas: intervalMaxFeePerGas,
      maxPriorityFeePerGas: intervalMaxPriorityFeePerGas,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  }
}

async function runIntervalAutomationTick() {
  if (intervalAutomationInFlight || !enableIntervalAutomation || !parimutuelIntervalMarketAddress || !faucetPrivateKey) {
    return;
  }

  intervalAutomationInFlight = true;
  try {
    const store = await loadTelemetryStoreAsync();
    const session = selectCurrentLiveSession(store);
    if (!session) {
      return;
    }

    const samples = getSortedSamples(store, session.sessionId);
    if (samples.length === 0) {
      return;
    }

    const account = privateKeyToAccount(normalizePrivateKey(faucetPrivateKey));
    const walletClient = createWalletClient({
      account,
      chain: arcTestnetChain,
      transport: http(baseRpcUrl),
    });
    const nonceCursor: NonceCursor = {
      value: await publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      }),
    };

    for (const metric of ["hr", "rr", "steps"] as const) {
      await createAutomatedIntervalMarket(session, metric, walletClient, account, nonceCursor);
    }
    await settleAutomatedIntervalMarkets(session, samples, walletClient, account, nonceCursor);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("interval automation tick failed:", message);
  } finally {
    intervalAutomationInFlight = false;
  }
}

function startIntervalAutomation() {
  if (!enableIntervalAutomation || !parimutuelIntervalMarketAddress || !faucetPrivateKey) {
    return;
  }
  console.log(`Interval automation enabled on ${parimutuelIntervalMarketAddress}; poll ${intervalAutomationPollMs}ms`);
  void runIntervalAutomationTick();
  setInterval(() => {
    void runIntervalAutomationTick();
  }, intervalAutomationPollMs);
}

function hashSessionId(sessionId: string) {
  return keccak256(stringToHex(sessionId));
}

function renderTelemetryDashboard(
  sessions: Array<{
    sessionId: string;
    status: string;
    createdAt: string;
    finalizedAt?: string;
    abandonedAt?: string;
    eventTimezone: string | null;
    eventUtcOffsetSeconds: number | null;
    clientStartedAt: string | null;
    sampleCount: number;
    firstSampleAt: string | null;
    lastSampleAt: string | null;
    firstElapsedMs: number | null;
    lastElapsedMs: number | null;
  }>,
) {
  const rows = sessions
    .slice()
    .reverse()
    .map((session) => `
      <tr>
        <td><code>${escapeHtml(session.sessionId)}</code></td>
        <td>${escapeHtml(session.status)}</td>
        <td>${escapeHtml(session.createdAt)}</td>
        <td>${escapeHtml(session.eventTimezone ?? "N/A")}</td>
        <td>${session.sampleCount}</td>
        <td>${escapeHtml(session.firstSampleAt ?? "N/A")}</td>
        <td>${escapeHtml(session.lastSampleAt ?? "N/A")}</td>
        <td>${session.firstElapsedMs ?? "N/A"}</td>
        <td>${session.lastElapsedMs ?? "N/A"}</td>
      </tr>
    `)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Telemetry Dashboard</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #f5f7fb; color: #102033; }
      .wrap { padding: 24px; }
      h1 { margin: 0 0 8px; font-size: 28px; }
      p { margin: 0 0 20px; color: #4b5b72; }
      .meta { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
      .pill { background: white; border: 1px solid #d6deea; border-radius: 999px; padding: 8px 12px; }
      table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d6deea; }
      th, td { padding: 10px 12px; border-bottom: 1px solid #e6ebf2; text-align: left; vertical-align: top; font-size: 13px; }
      th { background: #eef3fb; }
      code { font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Telemetry Dashboard</h1>
      <p>Public telemetry observer for live sessions and settlement-safe timing fields.</p>
      <div class="meta">
        <div class="pill">Sessions: ${sessions.length}</div>
        <div class="pill"><a href="/api/telemetry">JSON status</a></div>
        <div class="pill"><a href="/api/telemetry/sessions">Sessions API</a></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Session</th>
            <th>Status</th>
            <th>Created UTC</th>
            <th>Timezone</th>
            <th>Samples</th>
            <th>First Sample UTC</th>
            <th>Last Sample UTC</th>
            <th>First Elapsed ms</th>
            <th>Last Elapsed ms</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
