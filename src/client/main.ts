import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseUnits,
  stringToHex,
} from "viem";
import type { Address } from "viem";
import Privy, { LocalStorage, type OAuthProviderID } from "@privy-io/js-sdk-core";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}
const appRoot = app;

const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network";
const ARC_TESTNET_EXPLORER_URL = "https://testnet.arcscan.app";
const ARC_TESTNET_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const LIVE_INTERVAL_MS = 4 * 60_000;
const LIVE_INTERVAL_MINUTES = LIVE_INTERVAL_MS / 60_000;
const LIVE_INTERVAL_LABEL = `${LIVE_INTERVAL_MINUTES}-minute`;
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? ARC_TESTNET_CHAIN_ID);
const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME ?? "Arc Testnet";
const RPC_URL = import.meta.env.VITE_RPC_URL ?? ARC_TESTNET_RPC_URL;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const PRIVY_APP_ID = (import.meta.env.VITE_PRIVY_APP_ID ?? "").trim();
const PRIVY_OAUTH_PROVIDERS: ReadonlyArray<{
  id: OAuthProviderID;
  label: string;
  iconSvg: string;
}> = [
  {
    id: "google",
    label: "Continue with Google",
    iconSvg:
      '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C33.6 6.1 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C33.6 6.1 29 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5 0 9.6-1.9 13-5.1l-6-5.1c-2 1.5-4.4 2.2-7 2.2-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6 5.1C40.9 35.9 44 30.4 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>',
  },
  {
    id: "github",
    label: "Continue with GitHub",
    iconSvg:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M12 .5C5.6.5.5 5.6.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2.1c-3.2.7-3.9-1.5-3.9-1.5-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.9 1.2 1.9 1.2 3.2 0 4.6-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.5-1.5 7.9-5.8 7.9-10.9C23.5 5.6 18.4.5 12 .5z"/></svg>',
  },
  {
    id: "twitter",
    label: "Continue with X",
    iconSvg:
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M18.244 2H21.5l-7.49 8.56L23 22h-6.828l-5.34-6.98L4.72 22H1.462l8.02-9.166L1 2h6.99l4.828 6.38L18.244 2zm-1.197 18h1.836L7.045 4H5.1l11.947 16z"/></svg>',
  },
];
const PRIVY_OAUTH_PROVIDER_IDS = new Set<OAuthProviderID>(
  PRIVY_OAUTH_PROVIDERS.map((entry) => entry.id),
);
const DEFAULT_PRIVY_OAUTH_PROVIDER: OAuthProviderID = "google";
const normalizeAddressEnv = (value: string | undefined, fallback: string): Address =>
  getAddress((value ?? fallback).trim());
const TOKEN_ADDRESS = normalizeAddressEnv(import.meta.env.VITE_COLLATERAL_TOKEN, ARC_TESTNET_USDC_ADDRESS);
const COLLATERAL_SYMBOL = import.meta.env.VITE_COLLATERAL_SYMBOL ?? "USDC";
const COLLATERAL_DECIMALS = Number(import.meta.env.VITE_COLLATERAL_DECIMALS ?? 6);
const TRADING_UNIT_LABEL = import.meta.env.VITE_TRADING_UNIT_LABEL ?? "points";
const TRADING_UNIT_DECIMALS = Math.max(0, COLLATERAL_DECIMALS - 3);
const SPECTATOR_STARTING_POINTS = Number(import.meta.env.VITE_SPECTATOR_STARTING_POINTS ?? 1000);
const MARKET_ADDRESS = normalizeAddressEnv(
  import.meta.env.VITE_PREDICTION_MARKET,
  "0x86e8A602DB5A6c6cD9c5C5a753195F326BA4C1F3",
);
const INTERVAL_MARKET_ADDRESS = normalizeAddressEnv(
  import.meta.env.VITE_PARIMUTUEL_INTERVAL_MARKET,
  "0x500360a7EdB359d3cB3F3Df91d195F7CAa37D734",
);
const SETTLEMENT_OPERATOR = normalizeAddressEnv(
  import.meta.env.VITE_SETTLEMENT_OPERATOR,
  "0x8B6E5E7D4116f766BF1BE714FCc8bcAfA23D32D2",
);
const configuredChain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Arcscan",
      url: ARC_TESTNET_EXPLORER_URL,
    },
  },
});

const YOUTUBE_STORAGE_KEY = "hackatri.youtubeEmbed";
const SPECTATOR_AUTH_TOKEN_STORAGE_KEY = "hackatri.spectatorAuthToken";
const SPECTATOR_SESSION_STORAGE_KEY = "hackatri.spectatorSession";
const PRIVY_OAUTH_PROVIDER_STORAGE_KEY = "hackatri.privyOAuthProvider";
const PREFERRED_SESSION_STORAGE_KEY = "hackatri.preferredSessionId";
const PENDING_PREDICTIONS_STORAGE_KEY = "hackatri.pendingPredictions";
const ADMIN_API_KEY_STORAGE_KEY = "hackatri.adminApiKey";
const DEFAULT_YOUTUBE_URL = "https://www.youtube.com/embed/live_stream?channel=YOUR_CHANNEL_ID";
const ONCHAIN_REFRESH_INTERVAL_MS = 60_000;
const ADMIN_TRADES_REFRESH_INTERVAL_MS = 5 * 60_000;
const SHOW_RR_INTERVAL_EXPERIENCE = false;
const isAdminRoute = window.location.pathname === "/admin";
let revealObserver: IntersectionObserver | null = null;
let privyClientPromise: Promise<Privy> | null = null;

// ── i18n ─────────────────────────────────────────────────────────────────────
const LANG_STORAGE_KEY = "hackatri.lang";
let currentLang: "en" | "es" = (() => {
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (stored === "es" || stored === "en") return stored;
  return navigator.language.startsWith("es") ? "es" : "en";
})();

const TR = {
  en: {
    "landing.kicker": "PreCannes access",
    "landing.eyebrow": "Cannes · May 2026 · Triathlon",
    "landing.lede": "Predict live athlete biometrics. Bet on heart rate and steps — settled on-chain.",
    "landing.cta": "Enter the arena",
    "landing.stat.hr": "Heart Rate Markets",
    "landing.stat.steps": "Step Count Markets",
    "landing.stat.chain": "On-chain Settlement",
    "nav.broadcast.kicker": "Broadcast board",
    "nav.broadcast.title": "Live broadcast",
    "nav.sponsored": "Sponsored by",
    "nav.signout": "Sign out",
    "nav.signedin": "Signed in",
    "nav.leaderboard": "Leaderboard",
    "leaderboard.title": "Leaderboard",
    "leaderboard.loading": "Loading…",
    "leaderboard.empty": "No entries yet",
    "leaderboard.rank": "Rank",
    "leaderboard.player": "Player",
    "leaderboard.points": "Points",
    "trade.kicker": "Trade window",
    "trade.hr.title": "Heart Rate",
    "trade.steps.title": "Steps",
    "trade.rr.title": "RR Interval",
    "trade.above": "Above",
    "trade.below": "Below",
    "trade.timeleft": "Time left",
    "trade.prevscore": "Previous score",
    "trade.livehr": "Live heart rate",
    "trade.waiting": "Waiting for live session...",
    "trade.size": "Position size",
    "trade.submit": "Enter position",
    "account.positions": "Open positions",
    "account.nopositions": "No open positions",
    "account.won": "Won ✓",
    "account.lost": "Lost",
    "modal.placed.kicker": "Prediction made",
    "modal.placed.body": "Your wager is locked in. The market settles when the interval closes — you'll get a notification with your result.",
    "modal.won": "You won",
    "modal.lost": "Prediction missed",
    "modal.refund": "Refund available",
    "modal.claim": "Claim payout",
    "modal.gotit": "Got it",
    "modal.viewtx": "View transaction",
    "trail.kicker": "Settlement proof",
    "trail.title": "Trustless trail",
    "trail.lede": "Each interval links telemetry, onchain market creation, settlement transaction, and claim state.",
    "broadcast.standby.kicker": "Broadcast standby",
    "broadcast.standby.title": "Live video is being prepared.",
    "trade.chart.waiting.hr": "Waiting for live heart-rate samples",
    "trade.chart.waiting.rr": "Waiting for live RR samples",
    "trade.chart.waiting.steps": "Waiting for live steps samples",
    "trade.chart.lede": "The chart will begin drawing as soon as telemetry arrives.",
    "trade.waiting.hr": "Waiting for live session...",
    "trade.waiting.steps": "Waiting for live steps session...",
    "trade.waiting.rr": "Waiting for live RR session...",
    "trade.unavailable": "Interval unavailable",
    "trade.settled": "Interval settled",
    "trade.livesteps": "Live steps",
    "trade.liverr": "Live RR",
    "login.kicker": "PreCannes",
    "login.title": "Log in or sign up",
    "login.subtitle": `Log in with email or a social provider. We'll fund your wallet with ${SPECTATOR_STARTING_POINTS.toLocaleString()} ${TRADING_UNIT_LABEL} as soon as you land back here.`,
    "login.email": "Email",
    "login.continue": "Continue with email",
    "login.codehint": "Login code",
    "login.verify": "Verify & log in",
    "login.back": "Use a different email",
    "login.or": "or",
  },
  es: {
    "landing.kicker": "Acceso PreCannes",
    "landing.eyebrow": "Cannes · Mayo 2026 · Triatlón",
    "landing.lede": "Predice biomecánicas de atletas en vivo. Apuesta en frecuencia cardíaca y pasos — liquidado on-chain.",
    "landing.cta": "Entrar al arena",
    "landing.stat.hr": "Mercados de FC",
    "landing.stat.steps": "Mercados de Pasos",
    "landing.stat.chain": "Liquidación On-chain",
    "nav.broadcast.kicker": "Panel de emisión",
    "nav.broadcast.title": "Emisión en vivo",
    "nav.sponsored": "Patrocinado por",
    "nav.signout": "Cerrar sesión",
    "nav.signedin": "Sesión iniciada",
    "nav.leaderboard": "Clasificación",
    "leaderboard.title": "Clasificación",
    "leaderboard.loading": "Cargando…",
    "leaderboard.empty": "Sin entradas aún",
    "leaderboard.rank": "Pos.",
    "leaderboard.player": "Jugador",
    "leaderboard.points": "Puntos",
    "trade.kicker": "Ventana de trading",
    "trade.hr.title": "Frecuencia Cardíaca",
    "trade.steps.title": "Pasos",
    "trade.rr.title": "Intervalo RR",
    "trade.above": "Por encima",
    "trade.below": "Por debajo",
    "trade.timeleft": "Tiempo restante",
    "trade.prevscore": "Puntuación anterior",
    "trade.livehr": "FC en vivo",
    "trade.waiting": "Esperando sesión en vivo...",
    "trade.size": "Tamaño de posición",
    "trade.submit": "Entrar en posición",
    "account.positions": "Posiciones abiertas",
    "account.nopositions": "Sin posiciones abiertas",
    "account.won": "Ganado ✓",
    "account.lost": "Perdido",
    "modal.placed.kicker": "Predicción realizada",
    "modal.placed.body": "Tu apuesta está confirmada. El mercado cierra al terminar el intervalo — recibirás una notificación con tu resultado.",
    "modal.won": "¡Ganaste!",
    "modal.lost": "Predicción fallida",
    "modal.refund": "Reembolso disponible",
    "modal.claim": "Reclamar pago",
    "modal.gotit": "Entendido",
    "modal.viewtx": "Ver transacción",
    "trail.kicker": "Prueba de liquidación",
    "trail.title": "Rastro verificable",
    "trail.lede": "Cada intervalo enlaza telemetría, creación del mercado onchain, transacción de liquidación y estado de reclamación.",
    "broadcast.standby.kicker": "En espera de emisión",
    "broadcast.standby.title": "El video en vivo está siendo preparado.",
    "trade.chart.waiting.hr": "Esperando muestras de frecuencia cardíaca en vivo",
    "trade.chart.waiting.rr": "Esperando muestras de RR en vivo",
    "trade.chart.waiting.steps": "Esperando muestras de pasos en vivo",
    "trade.chart.lede": "El gráfico comenzará a dibujarse tan pronto llegue la telemetría.",
    "trade.waiting.hr": "Esperando sesión en vivo...",
    "trade.waiting.steps": "Esperando sesión de pasos en vivo...",
    "trade.waiting.rr": "Esperando sesión RR en vivo...",
    "trade.unavailable": "Intervalo no disponible",
    "trade.settled": "Intervalo liquidado",
    "trade.livesteps": "Pasos en vivo",
    "trade.liverr": "RR en vivo",
    "login.kicker": "PreCannes",
    "login.title": "Iniciar sesión o registrarse",
    "login.subtitle": `Inicia sesión con correo o proveedor social. Financiaremos tu cartera con ${SPECTATOR_STARTING_POINTS.toLocaleString()} ${TRADING_UNIT_LABEL} en cuanto regreses.`,
    "login.email": "Correo electrónico",
    "login.continue": "Continuar con correo",
    "login.codehint": "Código de inicio de sesión",
    "login.verify": "Verificar e iniciar sesión",
    "login.back": "Usar otro correo",
    "login.or": "o",
  },
} as const;

type TKey = keyof typeof TR.en;
function t(key: TKey): string {
  return (TR[currentLang] as Record<string, string>)[key] ?? (TR.en as Record<string, string>)[key] ?? key;
}

function translatePage() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as TKey);
  });
  renderBroadcastMedia();
  renderAccountOpenPositions();
}

type PrivyLinkedAccount = {
  type?: string;
  email?: unknown;
  address?: unknown;
  subject?: unknown;
  username?: unknown;
};

type PrivyUserLike = {
  linked_accounts: PrivyLinkedAccount[];
};

const tokenAbi = [
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
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const marketAbi = [
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
    name: "positions",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [
      { name: "yesShares", type: "uint256" },
      { name: "noShares", type: "uint256" },
      { name: "claimed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "yesPriceE18",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "noPriceE18",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
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
    name: "takePosition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "isYes", type: "bool" },
      { name: "collateralIn", type: "uint256" },
    ],
    outputs: [{ name: "sharesOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalYesShares",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalNoShares",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
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
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "payoutAmount", type: "uint256" }],
  },
] as const;

const parimutuelIntervalMarketAbi = [
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
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "payoutAmount", type: "uint256" }],
  },
] as const;

type TelemetrySession = {
  sessionId: string;
  athleteId: string | null;
  eventId: string | null;
  notes: string | null;
  createdAt: string;
  lastSampleAt?: string | null;
  lastElapsedMs?: number | null;
  eventTimezone?: string;
  eventUtcOffsetSeconds?: number;
  clientStartedAt?: string;
  status: string;
  sampleCount?: number;
};

type MarketRecord = {
  id: bigint;
  sessionIdHash: `0x${string}`;
  creator: Address;
  t: bigint;
  tradingClosesAtElapsedMs: bigint;
  thresholdValue: number;
  thresholdDirection: number;
  signalType: number;
  createdAt: bigint;
  status: number;
  settledBooleanOutcome: boolean;
  observedValue: bigint;
  settledSampleElapsedMs: bigint;
  settledSampleSeq: number;
  yesPool: bigint;
  noPool: bigint;
  totalLiquidity: bigint;
  totalYesShares: bigint;
  totalNoShares: bigint;
  sessionId: string | null;
  myYesShares: bigint;
  myNoShares: bigint;
  myClaimed: boolean;
};

type RawMarketTuple = readonly [
  bigint,
  `0x${string}`,
  Address,
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

type RawPositionTuple = readonly [bigint, bigint, boolean];
type FaucetStatus = {
  ok: boolean;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  tokenAddress: string | null;
  tokenSymbol?: string;
  tokenDecimals?: number;
  claimAmount: string;
  claimAmountFormatted: string;
  cooldownMs: number;
  totalClaimedWallets: number;
  ready: boolean;
  externalFaucetUrl?: string;
};

type SpectatorSession = {
  spectatorId: string;
  email: string;
  authToken: string;
  walletAddress: Address;
  provider: "local";
  fundedAt?: string | null;
  fundedAmount?: string | null;
  fundedAmountFormatted?: string | null;
  approvedAt?: string | null;
  fundingTxHash?: string | null;
};

type TelemetrySample = {
  sampleSeq: number;
  bpm: number;
  rrLatestMs?: number | null;
  rrIntervalsMs?: number[] | null;
  rmssd?: number | null;
  sdnn?: number | null;
  steps?: number | null;
  phoneObservedAt: string;
  elapsedMsSinceSessionStart: number;
};

type MarketMeta = {
  marketId: number;
  type: "hr_threshold" | "hr_interval_direction" | "rr_interval_direction" | "steps_interval_direction" | "steps_threshold_window";
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

type IntervalMarketRegistryRecord = {
  marketId: number;
  sessionId: string;
  metric: "hr" | "rr" | "steps";
  signalType: number;
  contractAddress?: string;
  createdTxHash?: string;
  settledTxHash?: string;
  settledAt?: string;
  settledOutcomeAbove?: boolean;
  settledObservedValue?: number;
  settledSampleSeq?: number;
  settledSampleElapsedMs?: number;
  referenceValue: number;
  windowStartElapsedMs: number;
  windowEndElapsedMs: number;
  tradingClosesAtTimestamp: number;
  createdAt: string;
};

type IntervalParimutuelMarketRecord = {
  id: bigint;
  sessionIdHash: `0x${string}`;
  creator: Address;
  intervalStartElapsedMs: bigint;
  intervalEndElapsedMs: bigint;
  tradingClosesAtTimestamp: bigint;
  referenceValue: number;
  signalType: number;
  createdAt: bigint;
  status: number;
  settledOutcomeAbove: boolean;
  observedValue: bigint;
  settledAt: bigint;
  settledSampleElapsedMs: bigint;
  settledSampleSeq: number;
  totalAboveStake: bigint;
  totalBelowStake: bigint;
  myAboveStake: bigint;
  myBelowStake: bigint;
  myClaimed: boolean;
  metric: "hr" | "rr" | "steps";
};

type AdminTradeRecord = {
  kind: "threshold" | "interval";
  marketId: number;
  metric: string;
  sessionId: string | null;
  side: string;
  amount: string;
  amountFormatted: string;
  account: Address;
  txHash: `0x${string}`;
  blockNumber: string | null;
  logIndex: number | null;
  marketLabel: string;
  referenceValue?: number | null;
  status?: string | null;
  settledOutcomeAbove?: boolean | null;
  settledObservedValue?: number | null;
};

type SpectatorTradeRecord = AdminTradeRecord;

type IntervalWindowPayload = {
  ok: boolean;
  sessionId: string;
  metric: "hr" | "rr" | "steps";
  intervalStartMs: number;
  intervalEndMs: number;
  referenceValue: number | null;
  currentValue: number | null;
  latestElapsedMs: number | null;
  samples: Array<{
    sampleSeq: number;
    elapsedMsSinceSessionStart: number;
    phoneObservedAt: string;
    value: number;
  }>;
};

type StatusTone = "neutral" | "success" | "warning" | "error";

declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
      on?(event: string, listener: (...args: unknown[]) => void): void;
    };
  }
}

const publicClient = createPublicClient({
  chain: configuredChain,
  transport: http(RPC_URL),
});

const state = {
  account: null as Address | null,
  spectator: null as SpectatorSession | null,
  sessions: [] as TelemetrySession[],
  currentSessionId: null as string | null,
  preferredSessionId: localStorage.getItem(PREFERRED_SESSION_STORAGE_KEY),
  markets: [] as MarketRecord[],
  balance: 0n,
  allowance: 0n,
  thresholdAllowance: 0n,
  intervalAllowance: 0n,
  youtubeUrl: localStorage.getItem(YOUTUBE_STORAGE_KEY) ?? DEFAULT_YOUTUBE_URL,
  status: "Idle",
  statusTone: "neutral" as StatusTone,
  lastRefreshAt: null as Date | null,
  refreshFailureCount: 0,
  faucet: null as FaucetStatus | null,
  marketMeta: new Map<number, MarketMeta>(),
  intervalMarketRegistry: [] as IntervalMarketRegistryRecord[],
  intervalMarket: null as IntervalParimutuelMarketRecord | null,
  selectedIntervalStartMs: null as number | null,
  intervalSamples: [] as TelemetrySample[],
  intervalReferenceBpm: null as number | null,
  intervalCurrentBpm: null as number | null,
  intervalViewRange: null as { startElapsedMs: number; endElapsedMs: number } | null,
  intervalSelectedSide: "above" as "above" | "below",
  rrIntervalMarket: null as IntervalParimutuelMarketRecord | null,
  rrSelectedIntervalStartMs: null as number | null,
  rrIntervalSamples: [] as TelemetrySample[],
  rrIntervalReferenceMs: null as number | null,
  rrIntervalCurrentMs: null as number | null,
  rrIntervalViewRange: null as { startElapsedMs: number; endElapsedMs: number } | null,
  rrIntervalSelectedSide: "above" as "above" | "below",
  stepsIntervalMarket: null as IntervalParimutuelMarketRecord | null,
  stepsSelectedIntervalStartMs: null as number | null,
  stepsIntervalSamples: [] as TelemetrySample[],
  stepsIntervalReference: null as number | null,
  stepsIntervalCurrent: null as number | null,
  stepsIntervalViewRange: null as { startElapsedMs: number; endElapsedMs: number } | null,
  stepsIntervalSelectedSide: "above" as "above" | "below",
  rrDistributionValues: [] as number[],
  rrDistributionPrevSessionId: null as string | null,
  pendingPredictions: new Map<string, PendingPrediction>(),
  lastSeenIntervalStatus: new Map<string, number>(),
  predictionModalAction: null as null | (() => Promise<void> | void),
  adminTrades: [] as AdminTradeRecord[],
  spectatorTrades: [] as SpectatorTradeRecord[],
  adminTradesStatus: "idle" as "idle" | "loading" | "ready" | "error",
  adminTradesError: null as string | null,
  lastOnchainRefreshAt: 0,
  lastAdminTradesRefreshAt: 0,
};

type PendingPrediction = {
  marketId: bigint;
  metric: "hr" | "rr" | "steps";
  metricLabel: string;
  isAbove: boolean;
  amount: number;
  reference: number;
  unit: string;
  txHash: `0x${string}`;
  notified: boolean;
};

let walletListenersAttached = false;
let mainExperienceRendered = false;
let refreshTimersAttached = false;
let authenticatedHydrationPromise: Promise<void> | null = null;

appRoot.innerHTML = isAdminRoute ? renderAdminShell() : renderLandingShell();
bindStaticHandlers();
setupContainerMotion();
void boot();

async function boot() {
  try {
    restorePendingPredictions();
    await handlePrivyOAuthCallback();
    await restoreSpectatorSession();
    await restoreWallet();
    if (!isAdminRoute && !state.spectator) {
      renderLandingExperience();
      return;
    }
    await enterAuthenticatedExperience();
  } catch (error) {
    setStatus(userFacingErrorMessage(error, "Live event data is temporarily unavailable. Retrying automatically."), "error");
  }
}

function activeTradingAddress(): Address | null {
  return state.account ?? state.spectator?.walletAddress ?? null;
}

function usingSpectatorWallet() {
  return Boolean(state.spectator);
}

function renderLandingShell() {
  return `
    <div class="landing-shell">
      <div class="landing-orb landing-orb--warm" aria-hidden="true"></div>
      <div class="landing-orb landing-orb--cool" aria-hidden="true"></div>

      <header class="landing-header">
        <div class="landing-sponsor">
          <img src="https://www.popbike.fr/templates/captain/img/interface/logo.svg" alt="Pop'Bike" class="landing-logo" />
          <span>Pre·Cannes</span>
        </div>
        <div class="landing-live">
          <span class="landing-live-dot"></span>
          <span>LIVE EVENT</span>
        </div>
      </header>

      <main class="landing-main" data-reveal="hero" data-reveal-order="0">
        <div class="landing-eyebrow" data-i18n="landing.eyebrow">${t("landing.eyebrow")}</div>

        <h1 class="landing-title">
          <span class="lt-line" style="--i:0">THE</span>
          <span class="lt-line" style="--i:1">HACKA</span>
          <span class="lt-line" style="--i:2">TRIATHLON</span>
        </h1>

        <div class="landing-ecg-wrap" aria-hidden="true">
          <svg class="landing-ecg-svg" viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <polyline class="ecg-trace" points="0,30 18,30 20,29 22,8 26,52 29,30 35,30 100,30 118,30 120,29 122,8 126,52 129,30 135,30 200,30"/>
          </svg>
        </div>

        <p class="landing-lede" data-i18n="landing.lede">${t("landing.lede")}</p>

        <button id="landing-get-started" class="landing-cta" type="button">
          <span data-i18n="landing.cta">${t("landing.cta")}</span>
          <svg class="landing-cta-arrow" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </main>

      <footer class="landing-foot">
        <span data-i18n="landing.stat.hr">${t("landing.stat.hr")}</span>
        <span class="landing-foot-sep">·</span>
        <span data-i18n="landing.stat.steps">${t("landing.stat.steps")}</span>
        <span class="landing-foot-sep">·</span>
        <span data-i18n="landing.stat.chain">${t("landing.stat.chain")}</span>
      </footer>

      ${renderPrivyLoginModal()}
    </div>
  `;
}

function renderLandingExperience() {
  if (isAdminRoute || state.spectator) {
    return;
  }
  mainExperienceRendered = false;
  appRoot.innerHTML = renderLandingShell();
  bindStaticHandlers();
  setupContainerMotion();
}

async function enterAuthenticatedExperience() {
  if (!isAdminRoute && !state.spectator) {
    renderLandingExperience();
    return;
  }
  if (!mainExperienceRendered) {
    mainExperienceRendered = true;
    appRoot.innerHTML = isAdminRoute ? renderAdminShell() : renderUserShell();
    bindStaticHandlers();
    setupContainerMotion();
  }
  startRefreshTimers();
  authenticatedHydrationPromise ??= hydrateAuthenticatedExperience().finally(() => {
    authenticatedHydrationPromise = null;
  });
  await authenticatedHydrationPromise;
}

async function hydrateAuthenticatedExperience() {
  void fetchServerConfig();
  await refreshFaucet();
  await refreshWalletState();
  await hydrateCurrentSessionFast();
  await refreshIntervalExperience({ refreshOnchain: false }).catch(() => {
    // Avoid blocking the first live chart render on a transient read failure.
  });
  if (SHOW_RR_INTERVAL_EXPERIENCE) {
    await refreshRrIntervalExperience({ refreshOnchain: false }).catch(() => {
      // Avoid blocking the first live chart render on a transient read failure.
    });
  }
  await refreshStepsIntervalExperience({ refreshOnchain: false }).catch(() => {
    // Avoid blocking the first live chart render on a transient read failure.
  });
  await refreshData();
}

function startRefreshTimers() {
  if (refreshTimersAttached) {
    return;
  }
  refreshTimersAttached = true;
  // Poll server config every 60 s so the YouTube embed updates without a reload
  window.setInterval(() => { void fetchServerConfig(); }, 60_000);
  renderMarketCountdowns();
  renderIntervalCountdown();
  window.setInterval(() => {
    renderMarketCountdowns();
    renderIntervalCountdown();
  }, 1000);
  window.setInterval(() => {
    if (!isAdminRoute && !state.spectator) {
      return;
    }
    void refreshData().catch((error) => {
      setStatus(userFacingErrorMessage(error, "Couldn't refresh the live event data. Retrying automatically."), "warning");
    });
  }, 8000);
  window.setInterval(() => {
    if (!isAdminRoute && !state.spectator) {
      return;
    }
    void detectIntervalSettlements();
  }, 4000);
}

function renderUserShell() {
  return `
    <div class="app-shell">
      <header class="topbar mobile-top" data-reveal="topbar" data-reveal-order="0">
        <div class="hero-copy">
          <button id="lang-toggle" class="lang-toggle" type="button" aria-label="Switch language">${currentLang === "en" ? "EN" : "ES"}</button>
          <h1>THE HACKATRIATHLON</h1>
        </div>
        <div class="topbar-meta">
          <span id="account-topbar-points" class="account-topbar-points"></span>
          <details class="account-menu">
            <summary class="account-avatar" aria-label="Open account menu">
              <span id="account-avatar-initial">?</span>
            </summary>
            <div class="account-menu-card">
              <strong id="account-menu-email" data-i18n="nav.signedin">${t("nav.signedin")}</strong>
              <span id="account-menu-points">0 ${TRADING_UNIT_LABEL}</span>
              <div id="account-open-positions" class="account-open-positions"></div>
              <button id="leaderboard-open-button" class="leaderboard-open-button" type="button">${t("nav.leaderboard")}</button>
              <button id="privy-logout-button" class="privy-logout-button" type="button" data-i18n="nav.signout">${t("nav.signout")}</button>
            </div>
          </details>
        </div>
      </header>

      ${renderPrivyLoginModal()}
      ${renderPredictionNotificationModal()}
      <div id="leaderboard-overlay" class="leaderboard-overlay" hidden>
        <div class="leaderboard-card">
          <div class="leaderboard-card-head">
            <div class="leaderboard-card-title">${t("leaderboard.title")}</div>
            <button id="leaderboard-close-button" class="leaderboard-close-button" type="button" aria-label="Close">✕</button>
          </div>
          <div id="leaderboard-body" class="leaderboard-body"></div>
        </div>
      </div>

      <main class="user-layout">
        <section class="frosted broadcast-hero" data-reveal="hero" data-reveal-order="1">
          <div class="section-head section-head-strong">
            <div>
              <div class="section-kicker" data-i18n="nav.broadcast.kicker">${t("nav.broadcast.kicker")}</div>
              <h2 data-i18n="nav.broadcast.title">${t("nav.broadcast.title")}</h2>
            </div>
          </div>
          <div class="broadcast-stage">
            <div class="broadcast-stage-main">
              <div class="video-frame">
                <div id="broadcast-media" class="video-frame-shell${hasConfiguredBroadcast() ? "" : " is-placeholder"}">
                  ${broadcastMediaMarkup()}
                </div>
              </div>
              <div class="sponsor-signoff">
                <span data-i18n="nav.sponsored">${t("nav.sponsored")}</span>
                <img src="https://www.popbike.fr/templates/captain/img/interface/logo.svg" alt="Pop'Bike" class="sponsor-logo" />
              </div>
            </div>
            ${SHOW_RR_INTERVAL_EXPERIENCE ? `
            <div class="hrv-distribution-panel">
              <div class="hrv-distribution-header">
                <span class="hrv-distribution-label">HRV Distribution</span>
                <span class="hrv-distribution-count" id="rr-dist-count">0 samples</span>
              </div>
              <svg id="rr-distribution-chart" class="hrv-distribution-svg" viewBox="0 0 200 480" preserveAspectRatio="xMidYMid meet"></svg>
              <div class="hrv-distribution-stats">
                <div class="hrv-stat"><span>SDNN</span><strong id="rr-dist-sdnn">--</strong></div>
                <div class="hrv-stat"><span>RMSSD</span><strong id="rr-dist-rmssd">--</strong></div>
                <div class="hrv-stat"><span>Mean</span><strong id="rr-dist-mean">--</strong></div>
              </div>
            </div>
            ` : ""}
          </div>
        </section>

        <section class="creator-card frosted interval-section live-market-section" id="live-market" data-reveal="panel" data-reveal-order="2">
          <div class="section-head section-head-strong">
            <div>
              <div class="section-kicker" data-i18n="trade.kicker">${t("trade.kicker")}</div>
              <h2 data-i18n="trade.hr.title">${t("trade.hr.title")}</h2>
            </div>
          </div>
          <div id="interval-hero" class="interval-hero">
            <div class="interval-stage">
              <div class="interval-headline">
                <div>
                  <h3 id="interval-title">Live ${LIVE_INTERVAL_LABEL} interval</h3>
                  <p id="interval-subtitle" class="market-copy">Waiting for live session...</p>
                </div>
              </div>
              <table class="interval-signal-table" aria-label="Heart rate interval status">
                <thead>
                  <tr>
                    <th data-i18n="trade.timeleft">${t("trade.timeleft")}</th>
                    <th data-i18n="trade.prevscore">${t("trade.prevscore")}</th>
                    <th data-i18n="trade.livehr">${t("trade.livehr")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td id="interval-countdown">--:--</td>
                    <td id="interval-reference">--</td>
                    <td id="interval-current">--</td>
                  </tr>
                </tbody>
              </table>
              <div class="interval-chart-wrap">
                <svg id="interval-chart" viewBox="0 0 720 260" preserveAspectRatio="none"></svg>
              </div>
              <div id="interval-tabs" class="interval-tabs"></div>
            </div>
            <aside class="interval-trade">
              <div class="trade-switch">
                <button id="interval-side-above" class="trade-side active" data-side="above"><span data-i18n="trade.above">${t("trade.above")}</span> <span id="interval-above-multiplier">1.00x</span></button>
                <button id="interval-side-below" class="trade-side secondary" data-side="below"><span data-i18n="trade.below">${t("trade.below")}</span> <span id="interval-below-multiplier">1.00x</span></button>
              </div>
              <div class="trade-panel">
                <div class="trade-label"><span data-i18n="trade.size">${t("trade.size")}</span> (${TRADING_UNIT_LABEL})</div>
                <div class="trade-amount-field">
                  <input id="interval-trade-amount" class="text-input trade-amount" type="number" min="1" step="1" value="100" inputmode="numeric" />
                  <div class="trade-quick">
                    <button class="secondary" id="interval-add-1">+25</button>
                    <button class="secondary" id="interval-add-5">+100</button>
                    <button class="secondary" id="interval-add-10">+250</button>
                    <button class="secondary" id="interval-add-500">+500</button>
                  </div>
                </div>
                <div id="interval-return-copy" class="market-copy"></div>
                <button id="interval-trade-submit" data-i18n="trade.submit">${t("trade.submit")}</button>
              </div>
            </aside>
          </div>
        </section>

        ${SHOW_RR_INTERVAL_EXPERIENCE ? `
        <section class="creator-card frosted interval-section live-market-section" id="live-rr-market" data-reveal="panel" data-reveal-order="2">
          <div class="section-head section-head-strong">
            <div>
              <div class="section-kicker">Trade window</div>
              <h2>Current RR interval market</h2>
              <p class="section-lede">Take a position on where this live ${LIVE_INTERVAL_LABEL} window closes relative to the reference RR interval from the prior window.</p>
            </div>
          </div>
          <div id="rr-interval-hero" class="interval-hero">
            <div class="interval-stage">
              <div class="interval-headline">
                <div>
                  <h3 id="rr-interval-title">Live ${LIVE_INTERVAL_LABEL} RR interval</h3>
                  <p id="rr-interval-subtitle" class="market-copy">Waiting for live RR session...</p>
                </div>
                <div id="rr-interval-countdown" class="interval-countdown">--:--</div>
              </div>
              <div class="interval-stats">
                <div class="interval-stat">
                  <span>Reference RR</span>
                  <strong id="rr-interval-reference">--</strong>
                </div>
                <div class="interval-stat">
                  <span>Live RR</span>
                  <strong id="rr-interval-current">--</strong>
                </div>
              </div>
              <div class="interval-chart-wrap">
                <svg id="rr-interval-chart" viewBox="0 0 720 260" preserveAspectRatio="none"></svg>
              </div>
              <div id="rr-interval-tabs" class="interval-tabs"></div>
            </div>
            <aside class="interval-trade">
              <div class="trade-switch">
                <button id="rr-interval-side-above" class="trade-side active" data-side="above">Above reference <span id="rr-interval-above-multiplier">1.00x</span></button>
                <button id="rr-interval-side-below" class="trade-side secondary" data-side="below">Below reference <span id="rr-interval-below-multiplier">1.00x</span></button>
              </div>
              <div class="trade-panel">
                <div class="trade-label">Position size (${TRADING_UNIT_LABEL})</div>
                <div class="trade-amount-field">
                  <input id="rr-interval-trade-amount" class="text-input trade-amount" type="number" min="1" step="1" value="100" inputmode="numeric" />
                  <div class="trade-quick">
                    <button class="secondary" id="rr-interval-add-1">+25</button>
                    <button class="secondary" id="rr-interval-add-5">+100</button>
                    <button class="secondary" id="rr-interval-add-10">+250</button>
                    <button class="secondary" id="rr-interval-max">Max</button>
                  </div>
                </div>
                <div id="rr-interval-return-copy" class="market-copy">Loading RR interval pricing...</div>
                <button id="rr-interval-trade-submit">Enter RR interval position</button>
              </div>
            </aside>
          </div>
        </section>
        ` : ""}

        <section class="creator-card frosted interval-section live-market-section" id="live-steps-market" data-reveal="panel" data-reveal-order="3">
          <div class="section-head section-head-strong">
            <div>
              <div class="section-kicker">Trade window</div>
              <h2>Steps</h2>
            </div>
          </div>
          <div id="steps-interval-hero" class="interval-hero">
            <div class="interval-stage">
              <div class="interval-headline">
                <div>
                  <h3 id="steps-interval-title">Live ${LIVE_INTERVAL_LABEL} steps interval</h3>
                  <p id="steps-interval-subtitle" class="market-copy">Waiting for live steps session...</p>
                </div>
              </div>
              <table class="interval-signal-table" aria-label="Steps interval status">
                <thead>
                  <tr>
                    <th data-i18n="trade.timeleft">${t("trade.timeleft")}</th>
                    <th data-i18n="trade.prevscore">${t("trade.prevscore")}</th>
                    <th data-i18n="trade.livesteps">${t("trade.livesteps")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td id="steps-interval-countdown">--:--</td>
                    <td id="steps-interval-reference">--</td>
                    <td id="steps-interval-current">--</td>
                  </tr>
                </tbody>
              </table>
              <div class="interval-chart-wrap">
                <svg id="steps-interval-chart" viewBox="0 0 720 260" preserveAspectRatio="none"></svg>
              </div>
              <div id="steps-interval-tabs" class="interval-tabs"></div>
            </div>
            <aside class="interval-trade">
              <div class="trade-switch">
                <button id="steps-interval-side-above" class="trade-side active" data-side="above">Above <span id="steps-interval-above-multiplier">1.00x</span></button>
                <button id="steps-interval-side-below" class="trade-side secondary" data-side="below">Below <span id="steps-interval-below-multiplier">1.00x</span></button>
              </div>
              <div class="trade-panel">
                <div class="trade-label">Position size (${TRADING_UNIT_LABEL})</div>
                <div class="trade-amount-field">
                  <input id="steps-interval-trade-amount" class="text-input trade-amount" type="number" min="1" step="1" value="100" inputmode="numeric" />
                  <div class="trade-quick">
                    <button class="secondary" id="steps-interval-add-1">+25</button>
                    <button class="secondary" id="steps-interval-add-5">+100</button>
                    <button class="secondary" id="steps-interval-add-10">+250</button>
                    <button class="secondary" id="steps-interval-add-500">+500</button>
                  </div>
                </div>
                <div id="steps-interval-return-copy" class="market-copy"></div>
                <button id="steps-interval-trade-submit" data-i18n="trade.submit">${t("trade.submit")}</button>
              </div>
            </aside>
          </div>
        </section>

        <div class="support-grid">
          <section class="frosted settlement-trail" data-reveal="panel" data-reveal-order="3" hidden>
            <div class="section-head">
              <div>
                <div class="section-kicker" data-i18n="trail.kicker">${t("trail.kicker")}</div>
                <h2 data-i18n="trail.title">${t("trail.title")}</h2>
                <p class="section-lede" data-i18n="trail.lede">${t("trail.lede")}</p>
              </div>
            </div>
            <div id="settlement-trail-list" class="settlement-trail-list"></div>
          </section>

          <section class="frosted market-board secondary-board" data-reveal="panel" data-reveal-order="3" hidden>
            <div class="section-head">
              <div>
                <div class="section-kicker">Market tape</div>
                <h2>Interval board</h2>
                <p class="section-lede">Open, settled, and personal interval flow stays here once the live window is understood.</p>
              </div>
              <span class="meta-label" id="market-count">0 markets</span>
            </div>
            <div id="market-grid" class="market-grid"></div>
          </section>

          <aside class="analyst-rail" data-reveal="panel" data-reveal-order="4">
            <section class="frosted rail-card rail-card-primary" hidden>
              <div class="section-head rail-head">
                <div>
                  <div class="section-kicker">Analyst rail</div>
                  <h2>Live read</h2>
                </div>
              </div>
              <div class="rail-stats">
                <div class="rail-stat">
                  <span>Session state</span>
                  <strong id="analyst-session-state">Waiting for live session</strong>
                </div>
                <div class="rail-stat">
                  <span>Signal read</span>
                  <strong id="analyst-signal-read">No interval signal yet</strong>
                </div>
                <div class="rail-stat">
                  <span>Trading state</span>
                  <strong id="analyst-trading-state">Trading access not ready</strong>
                </div>
              </div>
              <div id="analyst-context-note" class="helper-copy rail-note">The rail tracks readiness, live direction, and whether this window is actionable.</div>
            </section>

            <section class="frosted rail-card">
              <div class="section-head rail-head">
                <div>
                  <div class="section-kicker">Open exposure</div>
                  <h2>Your positions</h2>
                </div>
              </div>
              <div id="my-wagers" class="my-wagers rail-wagers"></div>
            </section>

            <details class="frosted access-panel" id="trading-access" open hidden>
              <summary class="access-summary">
                <div class="access-summary-copy">
                  <div class="section-kicker">Trading access</div>
                  <strong id="access-summary">Log in to get ${SPECTATOR_STARTING_POINTS.toLocaleString()} ${TRADING_UNIT_LABEL} for live markets.</strong>
                </div>
                <span class="summary-action">Open setup</span>
              </summary>
              <div class="access-panel-body">
                <div class="spectator-onboarding" id="spectator-onboard">
                  <div class="spectator-copy">
                    <div class="section-kicker">Social login</div>
                    <strong id="spectator-summary">Log in to fund this live run.</strong>
                    <div id="spectator-status" class="helper-copy">Privy verifies the user, then the backend funds a no-prompt testing seat with ${SPECTATOR_STARTING_POINTS.toLocaleString()} ${TRADING_UNIT_LABEL}.</div>
                  </div>
                  <div class="spectator-form">
                    <button id="spectator-login-open" type="button">Open login modal</button>
                    <button id="spectator-reset" class="secondary">Reset login wallet</button>
                  </div>
                </div>
                <div class="access-stats">
                  <div class="status-card inner">
                    <span class="meta-label">Wallet</span>
                    <strong id="wallet-readout">Not connected</strong>
                  </div>
                  <div class="status-card inner">
                    <span class="meta-label">Trading balance</span>
                    <strong id="token-balance">0</strong>
                  </div>
                  <div class="status-card inner">
                    <span class="meta-label">Trading approval</span>
                    <strong id="token-allowance">0</strong>
                  </div>
                  <div class="status-card inner">
                    <span class="meta-label">Readiness</span>
                    <strong id="status-pill" data-tone="${state.statusTone}">${state.status}</strong>
                  </div>
                </div>
                <div class="access-support">
                  <div class="two-col compact">
                    <div class="stat-card">
                      <span>Test allocation</span>
                      <strong id="faucet-amount">10 ${COLLATERAL_SYMBOL}</strong>
                    </div>
                    <div class="stat-card">
                      <span>Cooldown</span>
                      <strong id="faucet-cooldown">3h</strong>
                    </div>
                  </div>
                  <div id="faucet-status" class="helper-copy">Ready when wallet is connected.</div>
                  <div class="helper-copy">Claims so far: <strong id="faucet-count">0</strong></div>
                </div>
              </div>
            </details>
          </aside>
        </div>

      </main>
    </div>
  `;
}

function renderAdminShell() {
  return `
    <div class="app-shell">
      <header class="topbar admin-top">
        <div>
          <div class="kicker">HackaTriathlon Admin</div>
          <h1>Operator console</h1>
          <p class="lede">Separate operational tasks from the user flow: video configuration, manual minting, and settlement live here.</p>
        </div>
      </header>

      <section class="status-row">
        <div class="status-card frosted">
          <span class="meta-label">Wallet</span>
          <strong id="wallet-readout">Not connected</strong>
        </div>
        <div class="status-card frosted">
          <span class="meta-label">Balance</span>
          <strong id="token-balance">0</strong>
        </div>
        <div class="status-card frosted">
          <span class="meta-label">Allowance</span>
          <strong id="token-allowance">0</strong>
        </div>
        <div class="status-card frosted">
          <span class="meta-label">Status</span>
          <strong id="status-pill" data-tone="${state.statusTone}">${state.status}</strong>
        </div>
        <div class="status-card frosted stream-health">
          <span class="meta-label">Feed lag</span>
          <strong id="stream-health-state">Checking feed</strong>
          <small id="stream-health-detail">Waiting for telemetry samples.</small>
        </div>
      </section>

      <main class="admin-layout">
        <section class="frosted panel-block">
          <div class="section-head">
            <h2>Wallet controls</h2>
            <span class="meta-label">Operator</span>
          </div>
          <div class="action-row">
            <button id="connect-wallet">Connect wallet</button>
            <button id="switch-chain" class="secondary">Switch chain</button>
          </div>
          <div class="action-row">
            <input id="approve-amount" class="text-input" type="number" min="1" step="1" value="5000" />
            <button id="approve-button">Approve ${COLLATERAL_SYMBOL}</button>
          </div>
        </section>

        <section class="frosted panel-block">
          <div class="section-head">
            <h2>YouTube embed</h2>
            <span class="meta-label">Broadcast</span>
          </div>
          <div class="field-stack">
            <input id="youtube-url" class="text-input" value="${escapeHtml(state.youtubeUrl)}" />
            <button id="save-youtube">Save embed URL</button>
          </div>
        </section>

        <section class="frosted panel-block" id="mint-panel">
          <div class="section-head">
            <h2>Fund wallet</h2>
            <span class="meta-label">Optional</span>
          </div>
          <div class="two-col">
            <input id="mint-recipient" class="text-input" placeholder="Recipient wallet" />
            <input id="mint-amount" class="text-input" type="number" min="1" step="1" value="1000" />
          </div>
          <button id="mint-button">Transfer collateral</button>
        </section>

        <section class="frosted panel-block">
          <div class="section-head">
            <h2>Settlement</h2>
            <span class="meta-label">Deterministic</span>
          </div>
          <div class="field-stack">
            <select id="settle-market-select" class="text-input"></select>
            <button id="resolve-market">Resolve from telemetry and settle</button>
            <div id="settlement-preview" class="settlement-preview">No market selected.</div>
          </div>
        </section>

        <section class="frosted panel-block">
          <div class="section-head">
            <h2>Market publishing</h2>
            <span class="meta-label">Admin only</span>
          </div>
          <div class="helper-copy">
            Public interval market creation is disabled. Live interval publishing now runs through the private operator automation path, not the user-facing site.
          </div>
        </section>

        <section class="frosted market-board">
          <div class="section-head">
            <h2>Market monitor</h2>
            <span class="meta-label" id="market-count">0 markets</span>
          </div>
          <div id="market-grid" class="market-grid"></div>
        </section>

        <section class="frosted panel-block admin-trade-panel">
          <div class="section-head">
            <div>
              <h2>All user trades</h2>
              <p class="section-lede">Every recorded position event across live interval and threshold markets, keyed by trading wallet.</p>
            </div>
            <button id="refresh-admin-trades" class="secondary" type="button">Refresh trades</button>
          </div>
          <div id="admin-trades" class="admin-trades" aria-live="polite"></div>
        </section>
      </main>
    </div>
  `;
}

function renderPrivyLoginModal() {
  const providerButtons = PRIVY_OAUTH_PROVIDERS.map((provider) => `
    <button
      class="privy-modal-provider"
      type="button"
      data-privy-provider="${provider.id}"
    >
      <span class="privy-modal-provider-icon" aria-hidden="true">${provider.iconSvg}</span>
      <span class="privy-modal-provider-label">${provider.label}</span>
    </button>
  `).join("");
  return `
    <div id="privy-login-modal" class="privy-modal" role="dialog" aria-modal="true" aria-labelledby="privy-modal-title" hidden>
      <div class="privy-modal-backdrop" data-privy-modal-close></div>
      <div class="privy-modal-card">
        <button class="privy-modal-close" type="button" data-privy-modal-close aria-label="Close login modal">×</button>
        <div class="privy-modal-header">
          <div class="privy-modal-kicker" data-i18n="login.kicker">${t("login.kicker")}</div>
          <h2 id="privy-modal-title" data-i18n="login.title">${t("login.title")}</h2>
          <p class="privy-modal-subtitle" data-i18n="login.subtitle">${t("login.subtitle")}</p>
        </div>
        <form id="privy-modal-email-form" class="privy-modal-email" data-step="request" novalidate>
          <div class="privy-modal-email-step" data-step-panel="request">
            <label class="privy-modal-field">
              <span class="privy-modal-field-label" data-i18n="login.email">${t("login.email")}</span>
              <input
                id="privy-modal-email-input"
                class="privy-modal-input"
                type="email"
                name="email"
                autocomplete="email"
                inputmode="email"
                placeholder="you@example.com"
                required
              />
            </label>
            <button id="privy-modal-email-submit" class="privy-modal-email-submit" type="submit" data-i18n="login.continue">
              ${t("login.continue")}
            </button>
          </div>
          <div class="privy-modal-email-step" data-step-panel="verify" hidden>
            <p class="privy-modal-email-hint">We sent a 6-digit code to <strong id="privy-modal-email-target"></strong>.</p>
            <label class="privy-modal-field">
              <span class="privy-modal-field-label">Login code</span>
              <input
                id="privy-modal-code-input"
                class="privy-modal-input"
                type="text"
                name="code"
                autocomplete="one-time-code"
                inputmode="numeric"
                pattern="[0-9]*"
                placeholder="123456"
                maxlength="8"
                required
              />
            </label>
            <button id="privy-modal-code-submit" class="privy-modal-email-submit" type="submit" data-i18n="login.verify">
              ${t("login.verify")}
            </button>
            <button id="privy-modal-code-back" class="privy-modal-email-link" type="button" data-i18n="login.back">
              ${t("login.back")}
            </button>
          </div>
        </form>
        <div class="privy-modal-divider"><span>or</span></div>
        <div class="privy-modal-providers">${providerButtons}</div>
        <div id="privy-modal-status" class="privy-modal-status" role="status" aria-live="polite"></div>
      </div>
    </div>
  `;
}

function renderPredictionNotificationModal() {
  return `
    <div id="prediction-modal" class="prediction-modal" role="dialog" aria-modal="true" aria-labelledby="prediction-modal-title" hidden>
      <div class="prediction-modal-backdrop" data-prediction-modal-close></div>
      <div class="prediction-modal-card">
        <button class="prediction-modal-close" type="button" data-prediction-modal-close aria-label="Close">×</button>
        <div class="prediction-modal-kicker" id="prediction-modal-kicker">Prediction</div>
        <h2 id="prediction-modal-title">Prediction made</h2>
        <p class="prediction-modal-body" id="prediction-modal-body"></p>
        <div class="prediction-modal-meta" id="prediction-modal-meta"></div>
        <div class="prediction-modal-actions">
          <a id="prediction-modal-link" class="prediction-modal-link" href="#" target="_blank" rel="noopener noreferrer" hidden>View transaction</a>
          <button id="prediction-modal-action" class="prediction-modal-action" type="button" hidden></button>
          <button id="prediction-modal-dismiss" class="prediction-modal-dismiss" type="button" data-i18n="modal.gotit">${t("modal.gotit")}</button>
        </div>
      </div>
    </div>
  `;
}

type PredictionModalOptions = {
  kicker: string;
  title: string;
  body: string;
  meta?: string;
  tone?: "neutral" | "success" | "warning" | "error";
  link?: { label: string; href: string };
  action?: { label: string; handler: () => Promise<void> | void };
};

function showPredictionModal(opts: PredictionModalOptions) {
  const modal = document.getElementById("prediction-modal");
  const kicker = document.getElementById("prediction-modal-kicker");
  const title = document.getElementById("prediction-modal-title");
  const body = document.getElementById("prediction-modal-body");
  const meta = document.getElementById("prediction-modal-meta");
  const link = document.getElementById("prediction-modal-link") as HTMLAnchorElement | null;
  const action = document.getElementById("prediction-modal-action") as HTMLButtonElement | null;
  if (!modal || !kicker || !title || !body || !meta || !link || !action) {
    return;
  }
  kicker.textContent = opts.kicker;
  title.textContent = opts.title;
  body.textContent = opts.body;
  meta.textContent = opts.meta ?? "";
  meta.hidden = !opts.meta;
  modal.dataset.tone = opts.tone ?? "neutral";
  if (opts.link) {
    link.textContent = opts.link.label;
    link.href = opts.link.href;
    link.hidden = false;
  } else {
    link.hidden = true;
    link.removeAttribute("href");
  }
  if (opts.action) {
    action.textContent = opts.action.label;
    action.hidden = false;
    action.disabled = false;
    state.predictionModalAction = opts.action.handler;
  } else {
    action.hidden = true;
    action.disabled = false;
    state.predictionModalAction = null;
  }
  modal.hidden = false;
  modal.classList.add("is-open");
  document.body.classList.add("modal-open");
}

function closePredictionModal() {
  const modal = document.getElementById("prediction-modal");
  if (!modal) {
    return;
  }
  modal.classList.remove("is-open");
  modal.hidden = true;
  state.predictionModalAction = null;
  document.body.classList.remove("modal-open");
}

function bindPredictionNotificationModal() {
  const modal = document.getElementById("prediction-modal");
  if (!modal) {
    return;
  }
  modal.querySelectorAll<HTMLElement>("[data-prediction-modal-close]").forEach((element) => {
    element.addEventListener("click", () => closePredictionModal());
  });
  document.getElementById("prediction-modal-dismiss")?.addEventListener("click", () => closePredictionModal());
  const action = document.getElementById("prediction-modal-action") as HTMLButtonElement | null;
  action?.addEventListener("click", async () => {
    const handler = state.predictionModalAction;
    if (!handler) {
      closePredictionModal();
      return;
    }
    await withConfirmingElement(action, "Confirming", handler);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closePredictionModal();
    }
  });
}

function metricUnitLabel(metric: "hr" | "rr" | "steps") {
  return metric === "rr" ? "ms" : metric === "steps" ? "steps" : "bpm";
}

function metricKeyForLabel(label: string): "hr" | "rr" | "steps" {
  const normalized = label.toLowerCase();
  if (normalized === "rr") return "rr";
  if (normalized === "steps") return "steps";
  return "hr";
}

function pickIntervalMarketByMetric(metric: "hr" | "rr" | "steps") {
  switch (metric) {
    case "hr": return state.intervalMarket;
    case "rr": return state.rrIntervalMarket;
    case "steps": return state.stepsIntervalMarket;
  }
}

function activeIntervalReferenceForMetric(metric: "hr" | "rr" | "steps"): number | null {
  const market = pickIntervalMarketByMetric(metric);
  if (market) {
    return market.referenceValue;
  }
  switch (metric) {
    case "hr": return state.intervalReferenceBpm;
    case "rr": return state.rrIntervalReferenceMs;
    case "steps": return state.stepsIntervalReference;
  }
}

function intervalMarketKey(metric: "hr" | "rr" | "steps", marketId: bigint) {
  return `${metric}:${marketId.toString()}`;
}

function recordPendingPrediction(prediction: PendingPrediction) {
  state.pendingPredictions.set(intervalMarketKey(prediction.metric, prediction.marketId), prediction);
  state.lastSeenIntervalStatus.set(intervalMarketKey(prediction.metric, prediction.marketId), 0);
  persistPendingPredictions();
}

type PersistedPendingPrediction = Omit<PendingPrediction, "marketId"> & { marketId: string };

function persistPendingPredictions() {
  try {
    const payload: PersistedPendingPrediction[] = Array.from(state.pendingPredictions.values()).map((pending) => ({
      ...pending,
      marketId: pending.marketId.toString(),
    }));
    if (payload.length === 0) {
      localStorage.removeItem(PENDING_PREDICTIONS_STORAGE_KEY);
    } else {
      localStorage.setItem(PENDING_PREDICTIONS_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // localStorage may be unavailable; ignore.
  }
}

function restorePendingPredictions() {
  try {
    const raw = localStorage.getItem(PENDING_PREDICTIONS_STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw) as PersistedPendingPrediction[];
    for (const entry of payload) {
      const prediction: PendingPrediction = {
        ...entry,
        marketId: BigInt(entry.marketId),
        notified: entry.notified ?? false,
      };
      state.pendingPredictions.set(intervalMarketKey(prediction.metric, prediction.marketId), prediction);
      state.lastSeenIntervalStatus.set(intervalMarketKey(prediction.metric, prediction.marketId), 0);
    }
  } catch {
    localStorage.removeItem(PENDING_PREDICTIONS_STORAGE_KEY);
  }
}

function notifyPredictionPlaced(prediction: PendingPrediction) {
  const sideLabel = prediction.isAbove ? t("trade.above") : t("trade.below");
  const explorer = `${ARC_TESTNET_EXPLORER_URL}/tx/${prediction.txHash}`;
  showPredictionModal({
    kicker: t("modal.placed.kicker"),
    title: `${prediction.amount} ${TRADING_UNIT_LABEL} on ${prediction.metricLabel} ${sideLabel}`,
    body: t("modal.placed.body"),
    meta: `Reference ${prediction.reference} ${prediction.unit} · Tx ${shortenHash(prediction.txHash)}`,
    tone: "success",
    link: { label: t("modal.viewtx"), href: explorer },
  });
}

async function detectIntervalSettlements() {
  if (!INTERVAL_MARKET_ADDRESS || state.pendingPredictions.size === 0) {
    return;
  }
  const trader = activeTradingAddress();
  for (const [key, pending] of Array.from(state.pendingPredictions.entries())) {
    if (pending.notified) {
      continue;
    }
    try {
      const raw = await publicClient.readContract({
        address: INTERVAL_MARKET_ADDRESS,
        abi: parimutuelIntervalMarketAbi,
        functionName: "markets",
        args: [pending.marketId],
      });
      const status = Number(raw[9]);
      state.lastSeenIntervalStatus.set(key, status);
      if (status !== 1) {
        continue;
      }
      let myAboveStake = 0n;
      let myBelowStake = 0n;
      let myClaimed = false;
      if (trader) {
        try {
          const position = await publicClient.readContract({
            address: INTERVAL_MARKET_ADDRESS,
            abi: parimutuelIntervalMarketAbi,
            functionName: "positions",
            args: [pending.marketId, trader],
          });
          myAboveStake = position[0];
          myBelowStake = position[1];
          myClaimed = position[2];
        } catch {
          // tolerate transient read failures
        }
      }
      const market: IntervalParimutuelMarketRecord = {
        id: raw[0],
        sessionIdHash: raw[1],
        creator: raw[2],
        intervalStartElapsedMs: raw[3],
        intervalEndElapsedMs: raw[4],
        tradingClosesAtTimestamp: raw[5],
        referenceValue: Number(raw[6]),
        signalType: Number(raw[7]),
        createdAt: raw[8],
        status,
        settledOutcomeAbove: raw[10],
        observedValue: raw[11],
        settledAt: raw[12],
        settledSampleElapsedMs: raw[13],
        settledSampleSeq: Number(raw[14]),
        totalAboveStake: raw[15],
        totalBelowStake: raw[16],
        myAboveStake,
        myBelowStake,
        myClaimed,
        metric: pending.metric,
      };
      pending.notified = true;
      notifyPredictionSettled(pending, market);
    } catch (error) {
      console.error("[settlement] poll failed for", key, error);
    }
  }
}

function notifyPredictionSettled(prediction: PendingPrediction, market: IntervalParimutuelMarketRecord) {
  const userWon = prediction.isAbove === market.settledOutcomeAbove;
  const winningStake = market.settledOutcomeAbove ? market.myAboveStake : market.myBelowStake;
  const losingStake = market.settledOutcomeAbove ? market.myBelowStake : market.myAboveStake;
  const winnerPool = market.settledOutcomeAbove ? market.totalAboveStake : market.totalBelowStake;
  const loserPool = market.settledOutcomeAbove ? market.totalBelowStake : market.totalAboveStake;
  const refundScenario = winnerPool === 0n;
  const grossPayout = userWon && winnerPool > 0n
    ? winningStake + (loserPool * winningStake) / winnerPool
    : refundScenario
      ? winningStake + losingStake
      : 0n;
  const profit = grossPayout - (winningStake + losingStake);
  const balanceChange = userWon || refundScenario
    ? Number(formatUnits(profit, TRADING_UNIT_DECIMALS))
    : -Number(formatUnits(losingStake, TRADING_UNIT_DECIMALS));
  const balanceChangeLabel = `${balanceChange >= 0 ? "+" : ""}${balanceChange.toFixed(2)} ${TRADING_UNIT_LABEL}`;
  const observed = `${market.observedValue.toString()} ${prediction.unit}`;
  const sideLabel = prediction.isAbove ? "Above" : "Below";
  const outcomeLabel = market.settledOutcomeAbove ? "Above" : "Below";
  if (userWon || refundScenario) {
    const grossLabel = Number(formatUnits(grossPayout, TRADING_UNIT_DECIMALS)).toFixed(2);
    showPredictionModal({
      kicker: prediction.metricLabel,
      title: refundScenario ? t("modal.refund") : t("modal.won"),
      body: refundScenario
        ? `No counter-stake on the other side. Claim your ${prediction.amount} ${TRADING_UNIT_LABEL} back.`
        : `Settled ${outcomeLabel} at ${observed}. You staked ${prediction.amount} on ${sideLabel} and earned ${balanceChangeLabel}.`,
      meta: `Gross payout ${grossLabel} ${TRADING_UNIT_LABEL} · pending claim`,
      tone: "success",
      action: {
        label: t("modal.claim"),
        handler: async () => {
          await claimIntervalMarket(market.id, prediction.metric);
          state.pendingPredictions.delete(intervalMarketKey(prediction.metric, prediction.marketId));
          persistPendingPredictions();
          closePredictionModal();
        },
      },
    });
  } else {
    showPredictionModal({
      kicker: prediction.metricLabel,
      title: t("modal.lost"),
      body: `Settled ${outcomeLabel} at ${observed}. Your ${sideLabel} wager of ${prediction.amount} ${TRADING_UNIT_LABEL} didn't hit.`,
      meta: `Balance change ${balanceChangeLabel}`,
      tone: "warning",
    });
    state.pendingPredictions.delete(intervalMarketKey(prediction.metric, prediction.marketId));
    persistPendingPredictions();
  }
}

function bindStaticHandlers() {
  bindClick("lang-toggle", () => {
    currentLang = currentLang === "en" ? "es" : "en";
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
    const btn = document.getElementById("lang-toggle");
    if (btn) btn.textContent = currentLang === "en" ? "EN" : "ES";
    translatePage();
  });
  document.addEventListener("pointerdown", (event) => {
    const menu = document.querySelector<HTMLDetailsElement>(".account-menu");
    if (menu?.open && !menu.contains(event.target as Node)) {
      menu.removeAttribute("open");
    }
  }, { capture: true });
  bindClick("landing-get-started", () => openPrivyLoginModal());
  bindClick("privy-login-button", () => openPrivyLoginModal());
  bindClick("privy-logout-button", () => logoutSpectator());
  bindClick("leaderboard-open-button", () => {
    document.querySelector<HTMLDetailsElement>(".account-menu")?.removeAttribute("open");
    const overlay = document.querySelector<HTMLElement>("#leaderboard-overlay");
    if (overlay) { overlay.hidden = false; void fetchAndRenderLeaderboard(); }
  });
  bindClick("leaderboard-close-button", () => {
    const overlay = document.querySelector<HTMLElement>("#leaderboard-overlay");
    if (overlay) overlay.hidden = true;
  });
  document.addEventListener("pointerdown", (e) => {
    const overlay = document.querySelector<HTMLElement>("#leaderboard-overlay");
    const card = overlay?.querySelector(".leaderboard-card");
    if (overlay && !overlay.hidden && card && !card.contains(e.target as Node)) {
      overlay.hidden = true;
    }
  }, { capture: true });
  bindClick("spectator-login-open", () => openPrivyLoginModal());
  bindClick("spectator-reset", () => clearSpectatorSession());
  bindPrivyLoginModal();
  bindPredictionNotificationModal();
  bindClick("connect-wallet", () => connectWallet());
  bindClick("switch-chain", () => switchToConfiguredChain());
  bindClick("refresh-admin-trades", () => refreshAdminTrades());
  bindClick("save-youtube", () => saveYoutubeUrl());
  bindClick("approve-button", () => approveTokens());
  bindClick("faucet-claim", () => claimFaucet());
  bindClick("mint-button", () => mintTokens());
  bindClick("resolve-market", () => resolveSelectedMarket());
  bindClick("interval-side-above", () => setIntervalSide("above"));
  bindClick("interval-side-below", () => setIntervalSide("below"));
  bindClick("interval-add-1", () => nudgeIntervalStake(25));
  bindClick("interval-add-5", () => nudgeIntervalStake(100));
  bindClick("interval-add-10", () => nudgeIntervalStake(250));
  bindClick("interval-add-500", () => nudgeIntervalStake(500));
  bindClick("interval-trade-submit", () => submitIntervalTrade());
  bindInput("interval-trade-amount", () => renderIntervalTradePanel());
  bindClick("rr-interval-side-above", () => setRrIntervalSide("above"));
  bindClick("rr-interval-side-below", () => setRrIntervalSide("below"));
  bindClick("rr-interval-add-1", () => nudgeRrIntervalStake(25));
  bindClick("rr-interval-add-5", () => nudgeRrIntervalStake(100));
  bindClick("rr-interval-add-10", () => nudgeRrIntervalStake(250));
  bindClick("rr-interval-max", () => setRrIntervalStakeToMax());
  bindClick("rr-interval-trade-submit", () => submitRrIntervalTrade());
  bindInput("rr-interval-trade-amount", () => renderRrIntervalTradePanel());
  bindClick("steps-interval-side-above", () => setStepsIntervalSide("above"));
  bindClick("steps-interval-side-below", () => setStepsIntervalSide("below"));
  bindClick("steps-interval-add-1", () => nudgeStepsIntervalStake(25));
  bindClick("steps-interval-add-5", () => nudgeStepsIntervalStake(100));
  bindClick("steps-interval-add-10", () => nudgeStepsIntervalStake(250));
  bindClick("steps-interval-add-500", () => nudgeStepsIntervalStake(500));
  bindClick("steps-interval-trade-submit", () => submitStepsIntervalTrade());
  bindInput("steps-interval-trade-amount", () => renderStepsIntervalTradePanel());
}

function setupContainerMotion() {
  const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
  if (targets.length === 0) {
    return;
  }

  if (revealObserver) {
    revealObserver.disconnect();
    revealObserver = null;
  }

  for (const [index, target] of targets.entries()) {
    const order = Number(target.dataset.revealOrder ?? index);
    const delay = Math.min(order * 110, 440);
    target.style.setProperty("--reveal-delay", `${delay}ms`);
  }

  // Trigger all reveals on load using the stagger delays already set,
  // double-RAF ensures the initial hidden state is painted first.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const target of targets) {
        target.classList.add("is-visible");
      }
    });
  });
}

async function restoreWallet() {
  if (!window.ethereum) {
    return;
  }
  const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[];
  if (accounts.length > 0) {
    state.account = accounts[0] as Address;
    attachWalletListeners();
  }
}

async function restoreSpectatorSession() {
  const cached = readCachedSpectatorSession();
  const authToken = localStorage.getItem(SPECTATOR_AUTH_TOKEN_STORAGE_KEY) ?? cached?.authToken ?? null;
  if (cached && (!authToken || cached.authToken === authToken)) {
    applySpectatorSession(cached);
    localStorage.setItem(SPECTATOR_AUTH_TOKEN_STORAGE_KEY, cached.authToken);
    renderWallet();
  }
  if (!authToken) {
    return;
  }
  try {
    const response = await fetch(apiUrl("/api/spectators/me"), {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    if (response.status === 401 || response.status === 403) {
      clearSpectatorSession({ refreshWallet: false });
      return;
    }
    const payload = await readJson<SpectatorSession>(response, "Email wallet session expired.");
    applySpectatorSession(payload);
    cacheSpectatorSession(state.spectator);
    renderWallet();
  } catch (error) {
    if (!state.spectator) {
      console.warn("[spectator] session restore failed without a cached account:", error);
    }
  }
}

function readCachedSpectatorSession() {
  try {
    const raw = localStorage.getItem(SPECTATOR_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeSpectatorSession(JSON.parse(raw));
  } catch {
    localStorage.removeItem(SPECTATOR_SESSION_STORAGE_KEY);
    return null;
  }
}

function normalizeSpectatorSession(value: unknown): SpectatorSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<SpectatorSession>;
  if (
    typeof candidate.spectatorId !== "string" ||
    typeof candidate.email !== "string" ||
    typeof candidate.authToken !== "string" ||
    typeof candidate.walletAddress !== "string"
  ) {
    return null;
  }
  return {
    ...candidate,
    spectatorId: candidate.spectatorId,
    email: candidate.email,
    authToken: candidate.authToken,
    walletAddress: getAddress(candidate.walletAddress),
    provider: "local",
  };
}

function applySpectatorSession(payload: SpectatorSession) {
  state.spectator = {
    ...payload,
    walletAddress: getAddress(payload.walletAddress),
  };
  localStorage.setItem(SPECTATOR_AUTH_TOKEN_STORAGE_KEY, state.spectator.authToken);
}

function cacheSpectatorSession(session: SpectatorSession | null) {
  if (!session) {
    localStorage.removeItem(SPECTATOR_SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SPECTATOR_SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function getPrivyClient() {
  if (!PRIVY_APP_ID) {
    throw new Error("Privy app id is not configured.");
  }
  privyClientPromise ??= (async () => {
    const client = new Privy({
      appId: PRIVY_APP_ID,
      storage: new LocalStorage(),
    });
    await client.initialize();
    return client;
  })();
  return privyClientPromise;
}

function openPrivyLoginModal() {
  if (state.spectator && !state.account) {
    setStatus(`Login wallet is already active for ${state.spectator.email}.`, "success");
    return;
  }
  if (!PRIVY_APP_ID) {
    setStatus("Privy app id is not configured.", "error");
    return;
  }
  const modal = document.getElementById("privy-login-modal");
  if (!modal) {
    return;
  }
  modal.hidden = false;
  modal.classList.add("is-open");
  resetPrivyEmailStep();
  setPrivyModalStatus("Enter your email or pick a provider.");
  document.body.classList.add("modal-open");
  const emailInput = document.getElementById("privy-modal-email-input") as HTMLInputElement | null;
  emailInput?.focus();
}

function closePrivyLoginModal() {
  const modal = document.getElementById("privy-login-modal");
  if (!modal) {
    return;
  }
  modal.classList.remove("is-open");
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function setPrivyModalStatus(message: string, tone: "neutral" | "error" = "neutral") {
  const status = document.getElementById("privy-modal-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.dataset.tone = tone;
}

function bindPrivyLoginModal() {
  const modal = document.getElementById("privy-login-modal");
  if (!modal) {
    return;
  }
  modal.querySelectorAll<HTMLElement>("[data-privy-modal-close]").forEach((element) => {
    element.addEventListener("click", () => closePrivyLoginModal());
  });
  modal.querySelectorAll<HTMLButtonElement>("[data-privy-provider]").forEach((button) => {
    const providerId = button.dataset.privyProvider as OAuthProviderID | undefined;
    if (!providerId || !PRIVY_OAUTH_PROVIDER_IDS.has(providerId)) {
      return;
    }
    button.addEventListener("click", () => {
      void startPrivyLogin(providerId).catch((error: unknown) => {
        const message = userFacingErrorMessage(error, "Could not start the login flow.");
        setPrivyModalStatus(message, "error");
        setStatus(message, "error");
      });
    });
  });
  const emailForm = document.getElementById("privy-modal-email-form") as HTMLFormElement | null;
  emailForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const step = emailForm.dataset.step ?? "request";
    if (step === "request") {
      const emailInput = document.getElementById("privy-modal-email-input") as HTMLInputElement | null;
      const emailValue = emailInput?.value.trim().toLowerCase() ?? "";
      if (!emailValue || !emailValue.includes("@")) {
        setPrivyModalStatus("Enter a valid email address.", "error");
        emailInput?.focus();
        return;
      }
      void sendPrivyEmailCode(emailValue).catch((error: unknown) => {
        console.error("[privy] sendCode failed:", error);
        const message = userFacingErrorMessage(error, "Could not send login code.");
        setPrivyModalStatus(message, "error");
        setPrivyEmailBusy(false);
      });
    } else {
      const codeInput = document.getElementById("privy-modal-code-input") as HTMLInputElement | null;
      const codeValue = codeInput?.value.trim() ?? "";
      if (!codeValue) {
        setPrivyModalStatus("Enter the code from your email.", "error");
        codeInput?.focus();
        return;
      }
      void completePrivyEmailLogin(codeValue).catch((error: unknown) => {
        console.error("[privy] loginWithCode failed:", error);
        const message = userFacingErrorMessage(error, "Could not verify that login code.");
        setPrivyModalStatus(message, "error");
        setPrivyEmailBusy(false);
      });
    }
  });
  const backButton = document.getElementById("privy-modal-code-back");
  backButton?.addEventListener("click", () => {
    resetPrivyEmailStep();
    setPrivyModalStatus("Enter your email or pick a provider.");
    const emailInput = document.getElementById("privy-modal-email-input") as HTMLInputElement | null;
    emailInput?.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closePrivyLoginModal();
    }
  });
}

async function startPrivyLogin(provider: OAuthProviderID = DEFAULT_PRIVY_OAUTH_PROVIDER) {
  if (state.spectator && !state.account) {
    setStatus(`Login wallet is already active for ${state.spectator.email}.`, "success");
    closePrivyLoginModal();
    return;
  }
  const client = await getPrivyClient();
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  localStorage.setItem(PRIVY_OAUTH_PROVIDER_STORAGE_KEY, provider);
  const providerLabel = privyProviderLabel(provider);
  setPrivyModalStatus(`Opening ${providerLabel}…`);
  setStatus(`Opening ${providerLabel}…`);
  const { url } = await client.auth.oauth.generateURL(provider, redirectUri);
  window.location.assign(url);
}

function privyProviderLabel(provider: OAuthProviderID) {
  switch (provider) {
    case "google":
      return "Google login";
    case "github":
      return "GitHub login";
    case "twitter":
      return "X login";
    default:
      return "Privy login";
  }
}

let pendingPrivyEmail: string | null = null;

function resetPrivyEmailStep() {
  pendingPrivyEmail = null;
  const form = document.getElementById("privy-modal-email-form") as HTMLFormElement | null;
  if (form) {
    form.dataset.step = "request";
  }
  const request = form?.querySelector<HTMLElement>('[data-step-panel="request"]');
  const verify = form?.querySelector<HTMLElement>('[data-step-panel="verify"]');
  if (request) request.hidden = false;
  if (verify) verify.hidden = true;
  const emailInput = document.getElementById("privy-modal-email-input") as HTMLInputElement | null;
  if (emailInput) emailInput.value = "";
  const codeInput = document.getElementById("privy-modal-code-input") as HTMLInputElement | null;
  if (codeInput) codeInput.value = "";
  setPrivyEmailBusy(false);
}

function setPrivyEmailBusy(busy: boolean) {
  const form = document.getElementById("privy-modal-email-form") as HTMLFormElement | null;
  if (!form) return;
  form.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input").forEach((element) => {
    element.disabled = busy;
  });
  document.querySelectorAll<HTMLButtonElement>(".privy-modal-provider").forEach((button) => {
    if (busy) {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
    }
  });
}

async function sendPrivyEmailCode(email: string) {
  if (state.spectator && !state.account) {
    setStatus(`Login wallet is already active for ${state.spectator.email}.`, "success");
    closePrivyLoginModal();
    return;
  }
  setPrivyEmailBusy(true);
  setPrivyModalStatus("Sending login code…");
  const client = await getPrivyClient();
  await client.auth.email.sendCode(email);
  pendingPrivyEmail = email;
  const form = document.getElementById("privy-modal-email-form") as HTMLFormElement | null;
  if (form) form.dataset.step = "verify";
  const request = form?.querySelector<HTMLElement>('[data-step-panel="request"]');
  const verify = form?.querySelector<HTMLElement>('[data-step-panel="verify"]');
  if (request) request.hidden = true;
  if (verify) verify.hidden = false;
  const target = document.getElementById("privy-modal-email-target");
  if (target) target.textContent = email;
  setPrivyEmailBusy(false);
  setPrivyModalStatus(`Code sent to ${email}. Check your inbox.`);
  const codeInput = document.getElementById("privy-modal-code-input") as HTMLInputElement | null;
  codeInput?.focus();
}

async function completePrivyEmailLogin(code: string) {
  if (!pendingPrivyEmail) {
    setPrivyModalStatus("Request a new code to continue.", "error");
    resetPrivyEmailStep();
    return;
  }
  setPrivyEmailBusy(true);
  setPrivyModalStatus("Verifying login code…");
  const client = await getPrivyClient();
  const { user } = await client.auth.email.loginWithCode(
    pendingPrivyEmail,
    code,
    "login-or-sign-up",
  );
  const identifier = extractPrivyEmail(user) ?? pendingPrivyEmail;
  pendingPrivyEmail = null;
  setPrivyModalStatus("Funding your wallet…");
  await provisionSpectatorSession(identifier, "email");
}

async function handlePrivyOAuthCallback() {
  if (isAdminRoute || !PRIVY_APP_ID) {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const authorizationCode = params.get("privy_oauth_code") ?? params.get("code");
  const returnedStateCode = params.get("privy_oauth_state") ?? params.get("state") ?? params.get("state_code");
  if (!authorizationCode || !returnedStateCode) {
    return;
  }

  const callbackProvider = params.get("privy_oauth_provider") as OAuthProviderID | null;
  const storedProvider = localStorage.getItem(PRIVY_OAUTH_PROVIDER_STORAGE_KEY) as OAuthProviderID | null;
  const provider: OAuthProviderID = callbackProvider && PRIVY_OAUTH_PROVIDER_IDS.has(callbackProvider)
    ? callbackProvider
    : storedProvider && PRIVY_OAUTH_PROVIDER_IDS.has(storedProvider)
    ? storedProvider
    : DEFAULT_PRIVY_OAUTH_PROVIDER;
  removePrivyCallbackParams(params);
  setStatus(`Completing ${privyProviderLabel(provider)}…`);
  try {
    const client = await getPrivyClient();
    const { user } = await client.auth.oauth.loginWithCode(
      authorizationCode,
      returnedStateCode,
      provider,
      "raw",
      "login-or-sign-up",
    );
    localStorage.removeItem(PRIVY_OAUTH_PROVIDER_STORAGE_KEY);
    const identifier = extractPrivyUserIdentifier(user, provider);
    if (!identifier) {
      throw new Error("Privy login completed, but no user identifier was returned. Check Privy dashboard scopes for this provider.");
    }
    await provisionSpectatorSession(identifier, "Privy");
  } catch (error) {
    console.error("[privy] OAuth callback failed:", error);
    setStatus(userFacingErrorMessage(error, "Login could not be completed."), "error");
  }
}

function removePrivyCallbackParams(params: URLSearchParams) {
  for (const key of [
    "code",
    "state",
    "state_code",
    "scope",
    "authuser",
    "prompt",
    "privy_oauth_code",
    "privy_oauth_state",
    "privy_oauth_provider",
  ]) {
    params.delete(key);
  }
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function extractPrivyEmail(user: PrivyUserLike) {
  for (const account of user.linked_accounts) {
    if ("email" in account && typeof account.email === "string" && account.email.includes("@")) {
      return account.email.trim().toLowerCase();
    }
    if (account.type === "email" && "address" in account && typeof account.address === "string") {
      return account.address.trim().toLowerCase();
    }
  }
  return null;
}

const PRIVY_OAUTH_ACCOUNT_TYPES = new Set<string>([
  "google_oauth",
  "github_oauth",
  "twitter_oauth",
]);

function extractPrivyUserIdentifier(user: PrivyUserLike, provider: OAuthProviderID) {
  const email = extractPrivyEmail(user);
  if (email) {
    return email;
  }
  const oauthType = `${provider}_oauth`;
  const oauthAccount = user.linked_accounts.find(
    (account) => typeof account.type === "string" && account.type === oauthType,
  );
  const subject = oauthAccount && typeof oauthAccount.subject === "string"
    ? oauthAccount.subject
    : null;
  if (subject) {
    return `${provider}-${subject}@privy.local`.toLowerCase();
  }
  const fallback = user.linked_accounts.find(
    (account) => typeof account.type === "string" && PRIVY_OAUTH_ACCOUNT_TYPES.has(account.type) && typeof account.subject === "string",
  );
  if (fallback && typeof fallback.subject === "string" && typeof fallback.type === "string") {
    const providerPrefix = fallback.type.replace(/_oauth$/, "");
    return `${providerPrefix}-${fallback.subject}@privy.local`.toLowerCase();
  }
  return null;
}

async function provisionSpectatorSession(email: string, source: "Privy" | "email") {
  setBusy("spectator-onboard", true);
  setBusy("privy-login-button", true);
  setPrivyModalStatus("Funding your wallet…");
  try {
    const response = await fetch(apiUrl("/api/spectators/onboard"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    const payload = await readJson<SpectatorSession>(response, "Couldn't create your login wallet.");
    applySpectatorSession(payload);
    cacheSpectatorSession(state.spectator);
    setStatus(`${source} login complete. ${payload.fundedAmountFormatted ?? SPECTATOR_STARTING_POINTS.toString()} ${TRADING_UNIT_LABEL} ready.`, "success");
    closePrivyLoginModal();
    await enterAuthenticatedExperience();
  } catch (error) {
    const message = userFacingErrorMessage(error, `Couldn't start the ${source === "Privy" ? "Privy" : "email"} wallet flow.`);
    setStatus(message, "error");
    setPrivyModalStatus(message, "error");
  } finally {
    setBusy("spectator-onboard", false);
    setBusy("privy-login-button", false);
  }
}

function clearSpectatorSession(options: { refreshWallet?: boolean } = {}) {
  const { refreshWallet = true } = options;
  state.spectator = null;
  localStorage.removeItem(SPECTATOR_AUTH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(SPECTATOR_SESSION_STORAGE_KEY);
  state.balance = 0n;
  state.thresholdAllowance = 0n;
  state.intervalAllowance = 0n;
  state.allowance = 0n;
  state.pendingPredictions.clear();
  state.spectatorTrades = [];
  state.lastSeenIntervalStatus.clear();
  renderWallet();
  if (refreshWallet) {
    void refreshWalletState();
  }
}

function logoutSpectator() {
  if (!state.spectator) {
    return;
  }
  setStatus("Logged out", "success");
  clearSpectatorSession();
  renderLandingExperience();
}

async function spectatorRequest<T>(path: string, body: Record<string, unknown>) {
  if (!state.spectator) {
    throw new Error("Email wallet session not found");
  }
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.spectator.authToken}`,
    },
    body: JSON.stringify(body),
  });
  return readJson<T>(response, "Email wallet request failed.");
}

async function spectatorGet<T>(path: string) {
  if (!state.spectator) {
    throw new Error("Email wallet session not found");
  }
  const response = await fetch(apiUrl(path), {
    headers: {
      Authorization: `Bearer ${state.spectator.authToken}`,
    },
  });
  return readJson<T>(response, "Email wallet request failed.");
}

async function connectWallet() {
  if (!window.ethereum) {
    setStatus("Install MetaMask or Rabby", "warning");
    return;
  }
  const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
  state.account = (accounts[0] ?? null) as Address | null;
  attachWalletListeners();
  await switchToConfiguredChain();
  await refreshWalletState();
}

async function switchToConfiguredChain() {
  if (!window.ethereum) {
    setStatus("Wallet not available", "warning");
    return;
  }
  const chainHex = `0x${CHAIN_ID.toString(16)}`;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainHex }],
    });
    setStatus(`Connected to ${CHAIN_NAME}`, "success");
  } catch {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chainHex,
        chainName: CHAIN_NAME,
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
        rpcUrls: [RPC_URL],
        blockExplorerUrls: [ARC_TESTNET_EXPLORER_URL],
      }],
    });
    setStatus(`Added ${CHAIN_NAME}`, "success");
  }
}

function attachWalletListeners() {
  if (!window.ethereum?.on || walletListenersAttached) {
    return;
  }
  walletListenersAttached = true;
  window.ethereum.on("accountsChanged", (accounts) => {
    const nextAccounts = accounts as string[];
    state.account = (nextAccounts[0] ?? null) as Address | null;
    void refreshWalletState();
  });
  window.ethereum.on("chainChanged", () => {
    void refreshWalletState();
  });
}

async function refreshData(options: { forceOnchain?: boolean; forceAdminTrades?: boolean } = {}) {
  try {
    const refreshOnchain = shouldRefreshOnchain(options.forceOnchain);
    const refreshTradeFeed = shouldRefreshAdminTrades(options.forceAdminTrades);
    await hydrateCurrentSessionFast().catch(() => {
      // Keep the fast path best-effort. The slower session list can still fill in.
    });
    const sessionTask = refreshSessions();
    const registryTask = refreshIntervalMarketRegistry();
    const walletTask = refreshOnchain ? refreshWalletState() : Promise.resolve();
    const faucetTask = refreshFaucet();
    const metaTask = refreshMarketMeta();
    const eagerResults = await Promise.allSettled([registryTask, walletTask, faucetTask]);
    const eagerRejected = eagerResults.find((result) => result.status === "rejected");
    await refreshIntervalExperience({ refreshOnchain }).catch(() => {
      // Keep the page usable even if interval hydration fails once.
    });
    if (SHOW_RR_INTERVAL_EXPERIENCE) {
      await refreshRrIntervalExperience({ refreshOnchain }).catch(() => {
        // Keep the page usable even if RR interval hydration fails once.
      });
    }
    await refreshStepsIntervalExperience({ refreshOnchain }).catch(() => {
      // Keep the page usable even if steps interval hydration fails once.
    });
    await refreshSpectatorTrades().catch(() => {
      // Local pending predictions and onchain positions still render if the trade ledger read flakes.
    });
    const deferredResults = await Promise.allSettled([sessionTask, metaTask]);
    const deferredRejected = deferredResults.find((result) => result.status === "rejected");
    if (refreshOnchain) {
      await refreshMarkets().catch(() => {
        // Live telemetry should keep flowing even if the threshold board read fails once.
      });
      state.lastOnchainRefreshAt = Date.now();
    } else {
      renderMarkets();
    }
    if (eagerRejected?.status === "rejected") {
      throw eagerRejected.reason;
    }
    if (deferredRejected?.status === "rejected") {
      throw deferredRejected.reason;
    }
    if (isAdminRoute && refreshTradeFeed) {
      await refreshAdminTrades();
    }
    state.lastRefreshAt = new Date();
    state.refreshFailureCount = 0;
  } catch (error) {
    state.refreshFailureCount += 1;
    renderStreamHealth();
    throw error;
  }
  renderStreamHealth();
  renderSettlementTrail();
}

function shouldRefreshOnchain(force = false) {
  return force || state.lastOnchainRefreshAt === 0 || Date.now() - state.lastOnchainRefreshAt >= ONCHAIN_REFRESH_INTERVAL_MS;
}

function shouldRefreshAdminTrades(force = false) {
  return force || state.lastAdminTradesRefreshAt === 0 || Date.now() - state.lastAdminTradesRefreshAt >= ADMIN_TRADES_REFRESH_INTERVAL_MS;
}

function applySessionsState(sessions: TelemetrySession[], currentSession: TelemetrySession | null = null) {
  const visibleSessions = sessions.filter((session) => {
    if ((session.sampleCount ?? 0) <= 0 && session.status !== "active") {
      return false;
    }
    return session.notes !== "Auto-recovered from sample upload";
  });
  const sortedSessions = sessions
    .filter((session) => visibleSessions.includes(session))
    .sort((left, right) => {
      const leftActive = left.status === "active" ? 1 : 0;
      const rightActive = right.status === "active" ? 1 : 0;
      if (leftActive !== rightActive) {
        return rightActive - leftActive;
      }
      const leftSampleTime = Date.parse(left.lastSampleAt ?? left.createdAt);
      const rightSampleTime = Date.parse(right.lastSampleAt ?? right.createdAt);
      if (leftSampleTime !== rightSampleTime) {
        return rightSampleTime - leftSampleTime;
      }
      return (right.sampleCount ?? 0) - (left.sampleCount ?? 0);
    });
  const freshestSortedSession = sortedSessions[0] ?? null;
  const preferCurrentSession = currentSession && (
    !freshestSortedSession ||
    Date.parse(currentSession.lastSampleAt ?? currentSession.createdAt) >=
      Date.parse(freshestSortedSession.lastSampleAt ?? freshestSortedSession.createdAt)
  );
  state.sessions = preferCurrentSession && currentSession
    ? [currentSession, ...sortedSessions.filter((session) => session.sessionId !== currentSession.sessionId)]
    : sortedSessions;
  const preferredSession = state.preferredSessionId
    ? state.sessions.find((session) => session.sessionId === state.preferredSessionId) ?? null
    : null;
  const nextSessionId = preferredSession?.sessionId ?? state.sessions[0]?.sessionId ?? null;
  if (nextSessionId !== state.currentSessionId) {
    state.currentSessionId = nextSessionId;
    state.preferredSessionId = nextSessionId;
    if (nextSessionId) {
      localStorage.setItem(PREFERRED_SESSION_STORAGE_KEY, nextSessionId);
    }
    state.selectedIntervalStartMs = null;
    state.intervalSamples = [];
    state.intervalReferenceBpm = null;
    state.intervalCurrentBpm = null;
    state.intervalViewRange = null;
    state.intervalMarket = null;
    state.rrSelectedIntervalStartMs = null;
    state.rrIntervalSamples = [];
    state.rrIntervalReferenceMs = null;
    state.rrIntervalCurrentMs = null;
    state.rrIntervalViewRange = null;
    state.rrIntervalMarket = null;
    state.stepsSelectedIntervalStartMs = null;
    state.stepsIntervalSamples = [];
    state.stepsIntervalReference = null;
    state.stepsIntervalCurrent = null;
    state.stepsIntervalViewRange = null;
    state.stepsIntervalMarket = null;
    state.rrDistributionValues = [];
    state.rrDistributionPrevSessionId = null;
  }
  renderSessionOptions();
}

async function hydrateCurrentSessionFast() {
  if (isAdminRoute) {
    return;
  }
  const response = await fetch(apiUrl("/api/cre/sessions/current")).catch(() => null);
  if (!response?.ok) {
    return;
  }
  const currentSession = await readJson<TelemetrySession>(
    response,
    "Current session data is temporarily unavailable.",
  );
  const existingSessions = state.sessions.length > 0
    ? state.sessions.map((session) => session.sessionId === currentSession.sessionId ? { ...session, ...currentSession } : session)
    : [currentSession];
  if (!existingSessions.some((session) => session.sessionId === currentSession.sessionId)) {
    existingSessions.unshift(currentSession);
  }
  applySessionsState(existingSessions, currentSession);
}

async function refreshSessions() {
  const [sessionsResponse, currentResponse] = await Promise.all([
    fetch(apiUrl("/api/telemetry/sessions")),
    isAdminRoute ? Promise.resolve(null) : fetch(apiUrl("/api/cre/sessions/current")).catch(() => null),
  ]);
  const payload = await readJson<TelemetrySession[] | { sessions: TelemetrySession[] }>(
    sessionsResponse,
    "Live session data is temporarily unavailable.",
  );
  const sessions = Array.isArray(payload) ? payload : payload.sessions;
  let currentSession: TelemetrySession | null = null;
  if (currentResponse?.ok) {
    const currentPayload = await readJson<TelemetrySession>(
      currentResponse,
      "Current session data is temporarily unavailable.",
    );
    const matchingSummary = sessions.find((session) => session.sessionId === currentPayload.sessionId);
    currentSession = matchingSummary
      ? { ...matchingSummary, ...currentPayload }
      : currentPayload;
  }
  applySessionsState(sessions, currentSession);
}

async function refreshFaucet() {
  const response = await fetch(apiUrl("/api/faucet"));
  state.faucet = await readJson<FaucetStatus>(response, "Trading access is temporarily unavailable.");
  renderFaucet();
}

async function refreshMarketMeta() {
  const response = await fetch(apiUrl("/api/market-registry"));
  const payload = await readJson<{ markets: MarketMeta[] }>(
    response,
    "Market listings are temporarily unavailable.",
  );
  state.marketMeta = new Map(payload.markets.map((market) => [market.marketId, market]));
}

async function refreshIntervalMarketRegistry() {
  const session = selectedSession();
  const query = session ? `?sessionId=${encodeURIComponent(session.sessionId)}` : "";
  const response = await fetch(apiUrl(`/api/interval-markets${query}`));
  const payload = await readJson<{ markets: IntervalMarketRegistryRecord[] }>(
    response,
    "Interval market registry is temporarily unavailable.",
  );
  state.intervalMarketRegistry = payload.markets ?? [];
}

async function refreshAdminTrades() {
  if (!isAdminRoute) {
    return;
  }
  const adminToken = getCachedAdminApiToken();
  if (!adminToken) {
    state.adminTradesStatus = "error";
    state.adminTradesError = "Enter the admin API key to load the trade feed.";
    renderAdminTrades();
    return;
  }
  state.adminTradesStatus = state.adminTrades.length > 0 ? "ready" : "loading";
  state.adminTradesError = null;
  renderAdminTrades();
  try {
    const response = await fetch(apiUrl("/api/admin/trades?limit=500"), {
      headers: {
        "X-Admin-Token": adminToken,
      },
    });
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem(ADMIN_API_KEY_STORAGE_KEY);
      throw new Error("Admin API key was rejected.");
    }
    const payload = await readJson<{ trades: AdminTradeRecord[] }>(
      response,
      "Trade feed is temporarily unavailable.",
    );
    state.adminTrades = payload.trades ?? [];
    state.adminTradesStatus = "ready";
    state.lastAdminTradesRefreshAt = Date.now();
  } catch (error) {
    state.adminTradesStatus = "error";
    state.adminTradesError = userFacingErrorMessage(error, "Couldn't load user trades.");
  }
  renderAdminTrades();
}

async function refreshSpectatorTrades() {
  if (isAdminRoute || !state.spectator) {
    state.spectatorTrades = [];
    renderAccountOpenPositions();
    return;
  }
  const payload = await spectatorGet<{ trades: SpectatorTradeRecord[] }>("/api/spectators/trades?limit=100");
  state.spectatorTrades = payload.trades ?? [];
  renderAccountOpenPositions();
}

type LeaderboardEntry = {
  rank: number;
  animalName: string;
  points: string;
  isCurrentUser: boolean;
};

async function fetchAndRenderLeaderboard() {
  const body = document.querySelector<HTMLElement>("#leaderboard-body");
  if (!body) return;
  body.innerHTML = `<div class="leaderboard-loading">${t("leaderboard.loading")}</div>`;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (state.spectator?.authToken) {
      headers["Authorization"] = `Bearer ${state.spectator.authToken}`;
    }
    const res = await fetch(apiUrl("/api/leaderboard"), { headers });
    const data = (await res.json()) as { ok: boolean; entries: LeaderboardEntry[] };
    if (!data.ok || !data.entries?.length) {
      body.innerHTML = `<div class="leaderboard-loading">${t("leaderboard.empty")}</div>`;
      return;
    }
    body.innerHTML = `
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>${t("leaderboard.rank")}</th>
            <th>${t("leaderboard.player")}</th>
            <th>${t("leaderboard.points")}</th>
          </tr>
        </thead>
        <tbody>
          ${data.entries.map((e) => `
            <tr class="${e.isCurrentUser ? "leaderboard-me" : ""}">
              <td class="leaderboard-rank">${e.rank}</td>
              <td class="leaderboard-name">${escapeHtml(e.animalName)}${e.isCurrentUser ? " <span class='leaderboard-you'>you</span>" : ""}</td>
              <td class="leaderboard-pts">${escapeHtml(e.points)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch {
    body.innerHTML = `<div class="leaderboard-loading">${t("leaderboard.empty")}</div>`;
  }
}

function getCachedAdminApiToken() {
  return sessionStorage.getItem(ADMIN_API_KEY_STORAGE_KEY) ?? null;
}


async function refreshWalletState() {
  renderWallet();
  const trader = activeTradingAddress();
  if (!trader) {
    state.balance = 0n;
    state.thresholdAllowance = 0n;
    state.intervalAllowance = 0n;
    state.allowance = 0n;
    renderWallet();
    return;
  }
  const [balance, thresholdAllowance, intervalAllowance] = await Promise.all([
    publicClient.readContract({
      address: TOKEN_ADDRESS,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [trader],
    }),
    publicClient.readContract({
      address: TOKEN_ADDRESS,
      abi: tokenAbi,
      functionName: "allowance",
      args: [trader, MARKET_ADDRESS],
    }),
    INTERVAL_MARKET_ADDRESS
      ? publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: tokenAbi,
          functionName: "allowance",
          args: [trader, INTERVAL_MARKET_ADDRESS],
        })
      : Promise.resolve(0n),
  ]);
  state.balance = balance;
  state.thresholdAllowance = thresholdAllowance;
  state.intervalAllowance = intervalAllowance;
  state.allowance = isAdminRoute
    ? thresholdAllowance
    : (INTERVAL_MARKET_ADDRESS ? intervalAllowance : thresholdAllowance);
  renderWallet();
}

async function refreshMarkets() {
  const marketIds = Array.from(state.marketMeta.keys())
    .sort((left, right) => right - left)
    .slice(0, 32);
  const trader = activeTradingAddress();
  if (marketIds.length === 0) {
    state.markets = [];
    renderMarkets();
    renderSettlementOptions();
    return;
  }
  const items: MarketRecord[] = [];
  for (const numericId of marketIds) {
    const id = BigInt(numericId);
    try {
      const market = (await publicClient.readContract({
        address: MARKET_ADDRESS,
        abi: marketAbi,
        functionName: "markets",
        args: [id],
      })) as RawMarketTuple;
      const totalYesShares = await publicClient.readContract({
        address: MARKET_ADDRESS,
        abi: marketAbi,
        functionName: "totalYesShares",
        args: [id],
      });
      const totalNoShares = await publicClient.readContract({
        address: MARKET_ADDRESS,
        abi: marketAbi,
        functionName: "totalNoShares",
        args: [id],
      });

      let myYesShares = 0n;
      let myNoShares = 0n;
      let myClaimed = false;
      if (trader) {
        const position = (await publicClient.readContract({
          address: MARKET_ADDRESS,
          abi: marketAbi,
          functionName: "positions",
          args: [id, trader],
        })) as RawPositionTuple;
        myYesShares = position[0];
        myNoShares = position[1];
        myClaimed = position[2];
      }

      items.push({
        id: market[0],
        sessionIdHash: market[1],
        creator: market[2],
        t: market[3],
        tradingClosesAtElapsedMs: market[4],
        thresholdValue: Number(market[5]),
        thresholdDirection: Number(market[6]),
        signalType: Number(market[7]),
        createdAt: market[8],
        status: Number(market[9]),
        settledBooleanOutcome: market[10],
        observedValue: market[11],
        settledSampleElapsedMs: market[12],
        settledSampleSeq: Number(market[13]),
        yesPool: market[14],
        noPool: market[15],
        totalLiquidity: market[16],
        totalYesShares,
        totalNoShares,
        sessionId: findSessionIdForHash(market[1], Number(market[7])),
        myYesShares,
        myNoShares,
        myClaimed,
      });
    } catch {
      // Skip broken market reads so live telemetry and interval UI can still update.
    }
  }
  state.markets = items.sort((left, right) => Number(right.id - left.id));
  renderMarkets();
  renderSettlementOptions();
}

async function loadIntervalMarket(record: IntervalMarketRegistryRecord): Promise<IntervalParimutuelMarketRecord | null> {
  if (!INTERVAL_MARKET_ADDRESS) {
    return null;
  }
  const trader = activeTradingAddress();

  try {
    const market = await publicClient.readContract({
      address: INTERVAL_MARKET_ADDRESS,
      abi: parimutuelIntervalMarketAbi,
      functionName: "markets",
      args: [BigInt(record.marketId)],
    });

    let myAboveStake = 0n;
    let myBelowStake = 0n;
    let myClaimed = false;
    if (trader) {
      try {
        const position = await publicClient.readContract({
          address: INTERVAL_MARKET_ADDRESS,
          abi: parimutuelIntervalMarketAbi,
          functionName: "positions",
          args: [BigInt(record.marketId), trader],
        });
        myAboveStake = position[0];
        myBelowStake = position[1];
        myClaimed = position[2];
      } catch {
        // Keep the market tradable even if the personal position read flakes once.
      }
    }

    return {
      id: market[0],
      sessionIdHash: market[1],
      creator: market[2],
      intervalStartElapsedMs: market[3],
      intervalEndElapsedMs: market[4],
      tradingClosesAtTimestamp: market[5],
      referenceValue: Number(market[6]),
      signalType: Number(market[7]),
      createdAt: market[8],
      status: Number(market[9]),
      settledOutcomeAbove: market[10],
      observedValue: market[11],
      settledAt: market[12],
      settledSampleElapsedMs: market[13],
      settledSampleSeq: Number(market[14]),
      totalAboveStake: market[15],
      totalBelowStake: market[16],
      myAboveStake,
      myBelowStake,
      myClaimed,
      metric: record.metric,
    };
  } catch {
    const createdAtMs = Date.parse(record.createdAt);
    return {
      id: BigInt(record.marketId),
      sessionIdHash: hashMetricSessionId(record.sessionId, record.metric),
      creator: SETTLEMENT_OPERATOR,
      intervalStartElapsedMs: BigInt(record.windowStartElapsedMs),
      intervalEndElapsedMs: BigInt(record.windowEndElapsedMs),
      tradingClosesAtTimestamp: BigInt(record.tradingClosesAtTimestamp),
      referenceValue: record.referenceValue,
      signalType: record.signalType,
      createdAt: BigInt(Number.isFinite(createdAtMs) ? Math.floor(createdAtMs / 1000) : Math.floor(Date.now() / 1000)),
      status: Date.now() < record.tradingClosesAtTimestamp * 1000 ? 0 : 1,
      settledOutcomeAbove: false,
      observedValue: 0n,
      settledAt: 0n,
      settledSampleElapsedMs: 0n,
      settledSampleSeq: 0,
      totalAboveStake: 0n,
      totalBelowStake: 0n,
      myAboveStake: 0n,
      myBelowStake: 0n,
      myClaimed: false,
      metric: record.metric,
    };
  }
}

function matchingIntervalRegistryRecord(metric: "hr" | "rr" | "steps", startElapsedMs: number | null) {
  const session = selectedSession();
  if (!session || startElapsedMs === null) {
    return null;
  }
  return state.intervalMarketRegistry.find((record) => (
    record.metric === metric &&
    record.sessionId === session.sessionId &&
    record.windowStartElapsedMs === startElapsedMs
  )) ?? null;
}

function latestPublishedIntervalRegistryRecord(metric: "hr" | "rr" | "steps") {
  const session = selectedSession();
  if (!session) {
    return null;
  }
  const records = state.intervalMarketRegistry
    .filter((record) => record.metric === metric && record.sessionId === session.sessionId)
    .sort((left, right) => left.windowStartElapsedMs - right.windowStartElapsedMs)
  if (records.length === 0) {
    return null;
  }
  const currentStartElapsedMs = currentRollingIntervalStartElapsedMs(session);
  const currentOrEarlier = records.filter((record) => record.windowStartElapsedMs <= currentStartElapsedMs);
  return currentOrEarlier.at(-1) ?? records.at(-1) ?? null;
}

async function loadMatchingIntervalMarket(metric: "hr" | "rr" | "steps", startElapsedMs: number | null) {
  const record = matchingIntervalRegistryRecord(metric, startElapsedMs);
  if (!record) {
    return null;
  }
  return loadIntervalMarket(record);
}

async function approveTokens() {
  if (usingSpectatorWallet()) {
    setStatus("Email wallet is already provisioned for live trading", "success");
    return;
  }
  const amount = parseNumberInput("approve-amount") ?? (isAdminRoute ? null : 1000);
  if (!amount || !state.account) {
    setStatus("Connect wallet and enter approval amount", "warning");
    return;
  }
  const parsedAmount = parseUnits(String(amount), COLLATERAL_DECIMALS);
  if (!isAdminRoute) {
    if (state.intervalAllowance > 0n) {
      setStatus(`${COLLATERAL_SYMBOL} interval trading is already enabled`, "success");
      return;
    }
    const approved = await ensureIntervalAllowance(parsedAmount);
    if (approved) {
      setStatus(`Enabled ${COLLATERAL_SYMBOL} interval trading`, "success");
    }
    return;
  }

  const walletClient = getWalletClient();
  const thresholdHash = await walletClient.writeContract({
    account: state.account,
    chain: configuredChain,
    address: TOKEN_ADDRESS,
    abi: tokenAbi,
    functionName: "approve",
    args: [MARKET_ADDRESS, parsedAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: thresholdHash });
  if (INTERVAL_MARKET_ADDRESS) {
    const intervalHash = await walletClient.writeContract({
      account: state.account,
      chain: configuredChain,
      address: TOKEN_ADDRESS,
      abi: tokenAbi,
      functionName: "approve",
      args: [INTERVAL_MARKET_ADDRESS, parsedAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash: intervalHash });
  }
  setStatus(`Approved ${amount} ${COLLATERAL_SYMBOL}`, "success");
  await refreshWalletState();
}

async function ensureIntervalAllowance(requiredAmount: bigint) {
  if (usingSpectatorWallet()) {
    // Server executes the on-chain transaction and manages its own approvals —
    // the client-side allowance reading is irrelevant for spectator wallets.
    return true;
  }
  if (!state.account) {
    setStatus("Connect wallet to trade", "warning");
    return false;
  }
  if (!INTERVAL_MARKET_ADDRESS) {
    setStatus("Interval market contract is not configured", "error");
    return false;
  }
  if (state.intervalAllowance >= requiredAmount) {
    return true;
  }

  const walletClient = getWalletClient();
  setStatus(`Opening wallet to enable ${COLLATERAL_SYMBOL} interval trading…`);
  await walletClient.writeContract({
    account: state.account,
    chain: configuredChain,
    address: TOKEN_ADDRESS,
    abi: tokenAbi,
    functionName: "approve",
    args: [INTERVAL_MARKET_ADDRESS, 2n ** 256n - 1n],
  });
  await refreshWalletState();
  return state.intervalAllowance >= requiredAmount;
}

async function claimFaucet() {
  if (usingSpectatorWallet()) {
    setStatus(`Login wallet already received ${state.spectator?.fundedAmountFormatted ?? SPECTATOR_STARTING_POINTS.toString()} ${TRADING_UNIT_LABEL}`, "success");
    return;
  }
  if (state.faucet?.externalFaucetUrl && !state.faucet.ready) {
    window.open(state.faucet.externalFaucetUrl, "_blank", "noopener,noreferrer");
    setStatus(`Opened ${COLLATERAL_SYMBOL} faucet`, "success");
    return;
  }
  if (!state.account) {
    setStatus("Connect wallet before claiming", "warning");
    return;
  }
  const response = await fetch(apiUrl("/api/faucet/claim"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: state.account }),
  });
  const payload = (await response.json()) as { error?: string; txHash?: string; nextClaimAt?: string };
  if (!response.ok) {
    const msg = payload.error ?? "Claim failed";
    renderFaucet(payload.nextClaimAt ? `${msg}. Next claim: ${new Date(payload.nextClaimAt).toLocaleTimeString()}` : msg);
    setStatus(msg, "warning");
    return;
  }
  const msg = payload.txHash ? `Claim submitted: ${payload.txHash.slice(0, 10)}...` : "Claim submitted";
  renderFaucet(payload.nextClaimAt ? `Claim submitted. Next claim after ${new Date(payload.nextClaimAt).toLocaleTimeString()}` : msg);
  setStatus(msg, "success");
  await refreshWalletState();
  await refreshFaucet();
}

async function mintTokens() {
  const recipient = readInputValue("mint-recipient") as Address;
  const amount = parseNumberInput("mint-amount");
  if (!state.account || !recipient || !amount) {
    setStatus("Enter recipient and amount", "warning");
    return;
  }
  const walletClient = getWalletClient();
  await walletClient.writeContract({
    account: state.account,
    chain: configuredChain,
    address: TOKEN_ADDRESS,
    abi: tokenAbi,
    functionName: "transfer",
    args: [recipient, parseUnits(String(amount), COLLATERAL_DECIMALS)],
  });
  setStatus(`Transferred ${amount} ${COLLATERAL_SYMBOL}`, "success");
}

async function resolveSelectedMarket() {
  const marketId = Number(readInputValue("settle-market-select"));
  const market = state.markets.find((item) => Number(item.id) === marketId);
  const meta = state.marketMeta.get(marketId);
  if (!market || !meta || !state.account) {
    setStatus("Select a resolvable market", "warning");
    return;
  }

  const params = new URLSearchParams({
    sessionId: meta.referenceId,
    threshold: String(meta.threshold),
    direction: meta.direction,
    signalType: String(meta.signalType ?? market.signalType),
  });
  if ((meta.type === "steps_threshold_window" || meta.type === "steps_interval_direction") && typeof meta.windowStartElapsedMs === "number" && typeof meta.windowEndElapsedMs === "number") {
    params.set("marketType", "window_threshold");
    params.set("t1", String(meta.windowStartElapsedMs));
    params.set("t2", String(meta.windowEndElapsedMs));
  } else {
    params.set("marketType", "threshold");
    params.set("t", market.t.toString());
  }
  const response = await fetch(apiUrl(`/api/telemetry/settlement/resolve?${params.toString()}`));
  const payload = (await response.json()) as {
    signalUnit?: string;
    signal?: string;
    result?: { value: boolean; observedValue?: number; sampleSeq?: number; sampleElapsedMs?: number };
    error?: string;
  };
  if (!response.ok || !payload.result) {
    setStatus(payload.error ?? "Settlement lookup failed", "error");
    return;
  }

  const preview = document.querySelector<HTMLElement>("#settlement-preview");
  if (preview) {
    const unit = payload.signalUnit ?? signalTypeUnit(meta.signalType ?? market.signalType, meta);
    preview.textContent = `Resolved ${payload.result.value ? "YES" : "NO"} at ${payload.result.observedValue} ${unit} using sample ${payload.result.sampleSeq}.`;
  }

  const walletClient = getWalletClient();
  await walletClient.writeContract({
    account: state.account,
    chain: configuredChain,
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "closeMarket",
    args: [BigInt(marketId)],
  });
  await walletClient.writeContract({
    account: state.account,
    chain: configuredChain,
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "requestSettlement",
    args: [BigInt(marketId)],
  });
  await walletClient.writeContract({
    account: state.account,
    chain: configuredChain,
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "fulfillSettlement",
    args: [
      BigInt(marketId),
      payload.result.value,
      BigInt(payload.result.observedValue ?? 0),
      payload.result.sampleSeq ?? 0,
      BigInt(payload.result.sampleElapsedMs ?? 0),
    ],
  });
  setStatus(`Settled market #${marketId}`, "success");
  await refreshMarkets();
}

async function takePosition(marketId: bigint, isYes: boolean, inputId: string) {
  const amount = parseNumberInput(inputId);
  if (!amount) {
    setStatus("Enter a bet amount", "warning");
    return;
  }
  if (usingSpectatorWallet()) {
    const payload = await spectatorRequest<{ txHash: string; explorerUrl?: string }>("/api/spectators/trade/threshold", {
      marketId: Number(marketId),
      isYes,
      amount,
    });
    setStatus(`Placed ${amount} ${TRADING_UNIT_LABEL} on ${isYes ? "YES" : "NO"}${payload.txHash ? ` · ${shortenHash(payload.txHash)}` : ""}`, "success");
    await refreshMarkets();
    await refreshWalletState();
    if (payload.txHash) {
      return;
    }
    return;
  }
  if (!state.account) {
    setStatus("Connect wallet to bet", "warning");
    return;
  }
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account: state.account,
    chain: configuredChain,
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "takePosition",
    args: [marketId, isYes, parseUnits(String(amount), TRADING_UNIT_DECIMALS)],
  });
  setStatus(`Submitting ${amount} ${TRADING_UNIT_LABEL} on ${isYes ? "YES" : "NO"}…`);
  await publicClient.waitForTransactionReceipt({ hash });
  setStatus(`Placed ${amount} ${TRADING_UNIT_LABEL} on ${isYes ? "YES" : "NO"} · ${shortenHash(hash)}`, "success");
  await refreshMarkets();
  await refreshWalletState();
}

function intervalClaimable(market: IntervalParimutuelMarketRecord | null) {
  if (!market || market.status !== 1 || market.myClaimed) {
    return false;
  }
  const winningStake = market.settledOutcomeAbove ? market.myAboveStake : market.myBelowStake;
  const refundScenario = market.settledOutcomeAbove ? market.totalAboveStake === 0n : market.totalBelowStake === 0n;
  return winningStake > 0n || (refundScenario && (market.myAboveStake > 0n || market.myBelowStake > 0n));
}

function estimateIntervalPayout(market: IntervalParimutuelMarketRecord, isAbove: boolean, stake: number) {
  const collateralIn = parseUnits(String(stake), TRADING_UNIT_DECIMALS);
  if (collateralIn <= 0n) {
    return 0;
  }
  const nextAbove = market.totalAboveStake + (isAbove ? collateralIn : 0n);
  const nextBelow = market.totalBelowStake + (isAbove ? 0n : collateralIn);
  const totalPool = nextAbove + nextBelow;
  const winningPool = isAbove ? nextAbove : nextBelow;
  if (winningPool <= 0n) {
    return 0;
  }
  return Number(formatUnits((totalPool * collateralIn) / winningPool, TRADING_UNIT_DECIMALS));
}

function intervalStakeSummary(market: IntervalParimutuelMarketRecord, metricLabel: string) {
  const totalAbove = Number(formatUnits(market.totalAboveStake, TRADING_UNIT_DECIMALS));
  const totalBelow = Number(formatUnits(market.totalBelowStake, TRADING_UNIT_DECIMALS));
  const myAbove = Number(formatUnits(market.myAboveStake, TRADING_UNIT_DECIMALS));
  const myBelow = Number(formatUnits(market.myBelowStake, TRADING_UNIT_DECIMALS));
  const poolCopy = `Pool ${metricLabel}: Above ${totalAbove.toFixed(2)} / Below ${totalBelow.toFixed(2)} ${TRADING_UNIT_LABEL}.`;
  const myExposure = myAbove > 0 || myBelow > 0
    ? ` Your position: Above ${myAbove.toFixed(2)} / Below ${myBelow.toFixed(2)} ${TRADING_UNIT_LABEL}.`
    : "";
  return `${poolCopy}${myExposure}`;
}

async function takeIntervalPosition(
  marketId: bigint,
  isAbove: boolean,
  inputId: string,
  metricLabel: string,
) {
  const amount = parseNumberInput(inputId);
  if (!amount) {
    setStatus("Enter a position size", "warning");
    return;
  }
  // Spectator wallets are fully managed server-side — skip all client-side
  // balance/allowance/contract checks and let the server validate.
  if (usingSpectatorWallet()) {
    setStatus(`Submitting ${amount} ${TRADING_UNIT_LABEL} on ${metricLabel} ${isAbove ? "above" : "below"}…`);
    const payload = await spectatorRequest<{ txHash: string; explorerUrl?: string }>("/api/spectators/trade/interval", {
      marketId: Number(marketId),
      isAbove,
      amount,
    });
    // Server returns txHash immediately on broadcast — show modal and explorer link right away.
    const txHash = payload.txHash as `0x${string}`;
    setStatus(`Submitted — waiting for confirmation…`, "success");
    const metric = metricKeyForLabel(metricLabel);
    const prediction: PendingPrediction = {
      marketId,
      metric,
      metricLabel,
      isAbove,
      amount,
      reference: activeIntervalReferenceForMetric(metric) ?? 0,
      unit: metricUnitLabel(metric),
      txHash,
      notified: false,
    };
    recordPendingPrediction(prediction);
    notifyPredictionPlaced(prediction);
    // Wait for on-chain confirmation in the background then refresh position state.
    void publicClient.waitForTransactionReceipt({ hash: txHash }).then(async () => {
      setStatus(`Placed ${amount} ${TRADING_UNIT_LABEL} on ${metricLabel} ${isAbove ? "above" : "below"} · ${shortenHash(txHash)}`, "success");
      await refreshWalletState();
      await refreshIntervalMarketRegistry();
      await refreshSpectatorTrades().catch(() => {});
      await refreshIntervalExperience();
      if (SHOW_RR_INTERVAL_EXPERIENCE) {
        await refreshRrIntervalExperience();
      }
      await refreshStepsIntervalExperience();
      renderIntervalTradePanel();
      if (SHOW_RR_INTERVAL_EXPERIENCE) {
        renderRrIntervalTradePanel();
      }
      renderStepsIntervalTradePanel();
    }).catch(() => {
      setStatus(`Transaction may have failed — check explorer`, "warning");
    });
    return;
  }
  if (!INTERVAL_MARKET_ADDRESS) {
    setStatus("Interval market contract is not configured", "error");
    return;
  }
  if (!state.account) {
    setStatus("Connect wallet to trade", "warning");
    return;
  }
  const collateralIn = parseUnits(String(amount), TRADING_UNIT_DECIMALS);
  if (state.balance < collateralIn) {
    setStatus(`Not enough ${TRADING_UNIT_LABEL} to place that interval position`, "warning");
    return;
  }
  const approved = await ensureIntervalAllowance(collateralIn);
  if (!approved) {
    setStatus(`Enable ${COLLATERAL_SYMBOL} interval trading first`, "warning");
    return;
  }
  const walletClient = getWalletClient();
  setStatus(`Confirming ${amount} ${TRADING_UNIT_LABEL} on ${metricLabel} ${isAbove ? "above" : "below"}…`);
  const hash = await walletClient.writeContract({
    account: state.account,
    chain: configuredChain,
    address: INTERVAL_MARKET_ADDRESS,
    abi: parimutuelIntervalMarketAbi,
    functionName: "takePosition",
    args: [marketId, isAbove, collateralIn],
  });
  setStatus(`Waiting for ${metricLabel} ${isAbove ? "above" : "below"} confirmation…`);
  await publicClient.waitForTransactionReceipt({ hash });
  setStatus(`Placed ${amount} ${TRADING_UNIT_LABEL} on ${metricLabel} ${isAbove ? "above" : "below"} · ${shortenHash(hash)}`, "success");
  await refreshWalletState();
  await refreshIntervalMarketRegistry();
  await refreshSpectatorTrades().catch(() => {
    // The local position state still updates from onchain reads if the ledger lags.
  });
  await refreshIntervalExperience();
  if (SHOW_RR_INTERVAL_EXPERIENCE) {
    await refreshRrIntervalExperience();
  }
  await refreshStepsIntervalExperience();
}

async function claimIntervalMarket(marketId: bigint, metric: "hr" | "rr" | "steps") {
  if (!INTERVAL_MARKET_ADDRESS) {
    setStatus("Interval market contract is not configured", "error");
    return;
  }
  if (usingSpectatorWallet()) {
    setStatus(`Confirming ${metric.toUpperCase()} interval claim…`);
    const payload = await spectatorRequest<{ txHash: string; explorerUrl?: string }>("/api/spectators/claim/interval", {
      marketId: Number(marketId),
    });
    setStatus(`Claimed ${metric.toUpperCase()} interval market #${marketId.toString()} · ${shortenHash(payload.txHash)}`, "success");
    await refreshWalletState();
    await refreshIntervalMarketRegistry();
    await refreshSpectatorTrades().catch(() => {
      // Claim confirmation should not be blocked by a ledger refresh failure.
    });
    await refreshIntervalExperience();
    if (SHOW_RR_INTERVAL_EXPERIENCE) {
      await refreshRrIntervalExperience();
    }
    await refreshStepsIntervalExperience();
    return;
  }
  if (!state.account) {
    setStatus("Connect wallet to claim", "warning");
    return;
  }
  const walletClient = getWalletClient();
  setStatus(`Confirming ${metric.toUpperCase()} interval claim…`);
  const hash = await walletClient.writeContract({
    account: state.account,
    chain: configuredChain,
    address: INTERVAL_MARKET_ADDRESS,
    abi: parimutuelIntervalMarketAbi,
    functionName: "claim",
    args: [marketId],
  });
  setStatus(`Submitting claim for ${metric.toUpperCase()} interval market #${marketId.toString()}…`);
  await publicClient.waitForTransactionReceipt({ hash });
  setStatus(`Claimed ${metric.toUpperCase()} interval market #${marketId.toString()} · ${shortenHash(hash)}`, "success");
  await refreshWalletState();
  await refreshIntervalMarketRegistry();
  await refreshSpectatorTrades().catch(() => {
    // Claim confirmation should not be blocked by a ledger refresh failure.
  });
  await refreshIntervalExperience();
  if (SHOW_RR_INTERVAL_EXPERIENCE) {
    await refreshRrIntervalExperience();
  }
  await refreshStepsIntervalExperience();
}

async function claimMarket(marketId: bigint) {
  if (usingSpectatorWallet()) {
    await spectatorRequest<{ txHash: string }>("/api/spectators/claim/threshold", {
      marketId: Number(marketId),
    });
    setStatus(`Claimed market #${marketId}`, "success");
    await refreshMarkets();
    await refreshWalletState();
    return;
  }
  if (!state.account) {
    setStatus("Connect wallet to claim", "warning");
    return;
  }
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account: state.account,
    chain: configuredChain,
    address: MARKET_ADDRESS,
    abi: marketAbi,
    functionName: "claim",
    args: [marketId],
  });
  setStatus(`Submitting claim for market #${marketId.toString()}…`);
  await publicClient.waitForTransactionReceipt({ hash });
  setStatus(`Claimed market #${marketId}`, "success");
  await refreshMarkets();
  await refreshWalletState();
}

function renderWallet() {
  const readout = document.querySelector<HTMLElement>("#wallet-readout");
  const balance = document.querySelector<HTMLElement>("#token-balance");
  const allowance = document.querySelector<HTMLElement>("#token-allowance");
  const mintPanel = document.querySelector<HTMLElement>("#mint-panel");
  const spectatorSummary = document.querySelector<HTMLElement>("#spectator-summary");
  const spectatorStatus = document.querySelector<HTMLElement>("#spectator-status");
  const spectatorReset = document.querySelector<HTMLButtonElement>("#spectator-reset");
  const privyLoginButton = document.querySelector<HTMLButtonElement>("#privy-login-button");
  const accountInitial = document.querySelector<HTMLElement>("#account-avatar-initial");
  const accountEmail = document.querySelector<HTMLElement>("#account-menu-email");
  const accountPoints = document.querySelector<HTMLElement>("#account-menu-points");
  if (readout) {
    if (state.account) {
      readout.textContent = `${shortenAddress(state.account)}${addressesEqual(state.account, SETTLEMENT_OPERATOR) ? " · operator" : ""}`;
    } else if (state.spectator) {
      readout.textContent = `${shortenAddress(state.spectator.walletAddress)} · ${state.spectator.email}`;
    } else {
      readout.textContent = "Not connected";
    }
  }
  if (balance) {
    balance.textContent = `${formatDisplay(state.balance)} ${TRADING_UNIT_LABEL}`;
  }
  if (allowance) {
    allowance.textContent = `${formatDisplay(state.allowance)} ${TRADING_UNIT_LABEL}`;
  }
  if (spectatorSummary) {
    spectatorSummary.textContent = state.spectator
      ? `Login wallet active for ${state.spectator.email}.`
      : "Log in to fund the live run.";
  }
  if (spectatorStatus) {
    spectatorStatus.textContent = state.spectator
      ? `Ready on ${shortenAddress(state.spectator.walletAddress)} with ${formatDisplay(state.balance)} ${TRADING_UNIT_LABEL} available.`
      : `Privy verifies the user, then the backend funds a no-prompt testing seat with ${SPECTATOR_STARTING_POINTS.toLocaleString()} ${TRADING_UNIT_LABEL}.`;
  }
  if (spectatorReset) {
    spectatorReset.disabled = !state.spectator;
  }
  if (privyLoginButton) {
    privyLoginButton.disabled = !PRIVY_APP_ID;
    privyLoginButton.innerHTML = state.spectator
      ? `<span>${formatSpectatorDisplayEmail(state.spectator.email)}</span><small>${formatDisplay(state.balance)} ${TRADING_UNIT_LABEL} ready</small>`
      : `<span>Log in</span><small>${PRIVY_APP_ID ? `${SPECTATOR_STARTING_POINTS.toLocaleString()} ${TRADING_UNIT_LABEL} ready` : "Privy app id missing"}</small>`;
  }
  if (accountInitial) {
    accountInitial.textContent = state.spectator ? spectatorInitial(state.spectator.email) : "?";
  }
  if (accountEmail) {
    accountEmail.textContent = state.spectator ? formatSpectatorDisplayEmail(state.spectator.email) : "Signed out";
  }
  if (accountPoints) {
    accountPoints.textContent = `${formatDisplay(state.balance)} ${TRADING_UNIT_LABEL}`;
  }
  const topbarPoints = document.querySelector<HTMLElement>("#account-topbar-points");
  if (topbarPoints) {
    topbarPoints.textContent = (state.spectator || state.account) && state.balance > 0n
      ? `${formatDisplay(state.balance)} ${TRADING_UNIT_LABEL}`
      : "";
  }
  renderAccountOpenPositions();
  updateNudgeAnimation();
  const privyLogoutButton = document.querySelector<HTMLButtonElement>("#privy-logout-button");
  if (privyLogoutButton) {
    privyLogoutButton.hidden = !state.spectator;
  }
  if (mintPanel) {
    mintPanel.style.display = isAdminRoute && addressesEqual(state.account, SETTLEMENT_OPERATOR) ? "block" : "none";
  }
  renderAccessSummary();
}

function renderAccessSummary() {
  const summary = document.querySelector<HTMLElement>("#access-summary");
  if (!summary || isAdminRoute) {
    return;
  }
  if (state.spectator && !state.account) {
    summary.textContent = `Login wallet is live with ${formatDisplay(state.balance)} ${TRADING_UNIT_LABEL}.`;
  } else if (!state.account) {
    summary.textContent = `Log in with Google, GitHub, or X to get ${SPECTATOR_STARTING_POINTS.toLocaleString()} ${TRADING_UNIT_LABEL} for the live markets.`;
  } else if (state.balance <= 0n) {
    summary.textContent = "Wallet connected. Claim a test balance to enter the live interval.";
  } else if (state.allowance <= 0n) {
    summary.textContent = "Funding is ready. Enable trading once to place interval positions.";
  } else {
    summary.textContent = `Trading is live with ${formatDisplay(state.balance)} ${TRADING_UNIT_LABEL} available.`;
  }
  renderBroadcastSummary();
}

function renderBroadcastSummary() {
  const intervalWindow = document.querySelector<HTMLElement>("#hero-interval-window");
  const reference = document.querySelector<HTMLElement>("#hero-reference-bpm");
  const current = document.querySelector<HTMLElement>("#hero-current-bpm");
  const marketNote = document.querySelector<HTMLElement>("#hero-market-note");
  const accessNote = document.querySelector<HTMLElement>("#hero-access-note");
  const analystSessionState = document.querySelector<HTMLElement>("#analyst-session-state");
  const analystSignalRead = document.querySelector<HTMLElement>("#analyst-signal-read");
  const analystTradingState = document.querySelector<HTMLElement>("#analyst-trading-state");
  const analystContextNote = document.querySelector<HTMLElement>("#analyst-context-note");
  if (!intervalWindow || !reference || !current || !marketNote || !accessNote || isAdminRoute) {
    return;
  }

  const session = selectedSession();
  const market = currentIntervalMarket();

  if (!session || !state.intervalViewRange) {
    intervalWindow.textContent = "Waiting for live session";
  } else {
    const startedAt = new Date(session.clientStartedAt ?? session.createdAt);
    const startAt = new Date(startedAt.getTime() + state.intervalViewRange.startElapsedMs);
    const endAt = new Date(startedAt.getTime() + state.intervalViewRange.endElapsedMs);
    intervalWindow.textContent = formatIntervalSubtitle(startAt, endAt);
  }

  const displayReference = activeIntervalReferenceForMetric("hr");
  reference.textContent = displayReference ? `${displayReference} bpm` : "--";
  current.textContent = state.intervalCurrentBpm ? `${state.intervalCurrentBpm} bpm` : "--";

  if (!session || !state.intervalViewRange) {
    marketNote.textContent = "Waiting for the first live interval to open.";
  } else if (!market) {
    marketNote.textContent = "No live interval is open yet. The market will activate automatically.";
  } else if (market.status !== 0) {
    marketNote.textContent = "This interval is closed. Stay with the broadcast while the next one opens.";
  } else {
    marketNote.textContent = `The current ${LIVE_INTERVAL_LABEL} interval is live with above-reference and below-reference positions.`;
  }

  if (analystSessionState) {
    analystSessionState.textContent = !session
      ? "Waiting for live session"
      : state.intervalViewRange
        ? `Window ${intervalWindow.textContent ?? "live"}`
        : "Session live, interval pending";
  }

  if (analystSignalRead) {
    analystSignalRead.textContent = state.intervalCurrentBpm === null || displayReference === null
      ? "No interval signal yet"
      : state.intervalCurrentBpm > displayReference
        ? `${state.intervalCurrentBpm - displayReference} bpm above reference`
        : state.intervalCurrentBpm < displayReference
          ? `${displayReference - state.intervalCurrentBpm} bpm below reference`
          : "Live HR is sitting on the reference";
  }

  if (state.spectator && !state.account) {
    accessNote.textContent = `Your login wallet is funded with ${formatDisplay(state.balance)} ${TRADING_UNIT_LABEL}. You can place positions from this phone view.`;
  } else if (!state.account) {
    accessNote.textContent = "Log in with Google, GitHub, or X to start paper predicting on this live view.";
  } else if (state.balance <= 0n) {
    accessNote.textContent = "Wallet connected. Claim a test balance below to activate interval trading.";
  } else if (state.allowance <= 0n) {
    accessNote.textContent = "Funding is ready. Enable trading once below.";
  } else {
    accessNote.textContent = "Trading is ready below. You can move directly into the current interval market.";
  }

  if (analystTradingState) {
    analystTradingState.textContent = state.spectator && !state.account
      ? `${formatDisplay(state.balance)} ${TRADING_UNIT_LABEL} ready`
      : !state.account
        ? "Log in to start"
        : state.balance <= 0n
          ? "Balance required"
          : state.allowance <= 0n
            ? "Approval required"
            : "Desk is trade-ready";
  }

  if (analystContextNote) {
    analystContextNote.textContent = !session
      ? "The rail will populate as soon as the event starts streaming telemetry."
      : !currentIntervalMarket()
        ? "The session is live, but this interval has not opened a trade yet."
        : currentIntervalMarket()?.status !== 0
          ? "This interval is closed. Stay on the feed and wait for the next window to open."
          : "This window is actionable. Use the board for flow and the market panel for execution.";
  }

  renderStreamHealth();
  renderSettlementTrail();
}

function renderStreamHealth() {
  const stateNode = document.querySelector<HTMLElement>("#stream-health-state");
  const detailNode = document.querySelector<HTMLElement>("#stream-health-detail");
  if (!stateNode || !detailNode) {
    return;
  }
  const session = selectedSession();
  const lastSampleAt = session?.lastSampleAt ? Date.parse(session.lastSampleAt) : null;
  const sampleAgeMs = lastSampleAt ? Date.now() - lastSampleAt : null;
  const sampleCount = session?.sampleCount ?? 0;
  const hasOpenMarkets = [state.intervalMarket, state.stepsIntervalMarket].some((market) => market?.status === 0);
  if (state.refreshFailureCount > 0) {
    stateNode.textContent = `Retrying feed (${state.refreshFailureCount})`;
    detailNode.textContent = "The UI keeps polling and will recover automatically.";
    return;
  }
  if (!session) {
    stateNode.textContent = "Waiting for session";
    detailNode.textContent = "Telemetry will appear when the event feed starts.";
    return;
  }
  if (sampleAgeMs !== null && sampleAgeMs <= 20_000) {
    stateNode.textContent = "Live feed solid";
    detailNode.textContent = `${sampleCount.toLocaleString()} samples · last ${Math.max(1, Math.round(sampleAgeMs / 1000))}s ago · ${hasOpenMarkets ? "markets open" : "markets syncing"}.`;
    return;
  }
  stateNode.textContent = "Feed lagging";
  detailNode.textContent = sampleAgeMs === null
    ? `${sampleCount.toLocaleString()} samples loaded, waiting for latest timestamp.`
    : `${sampleCount.toLocaleString()} samples · last ${Math.round(sampleAgeMs / 1000)}s ago.`;
}

function renderSettlementTrail() {
  const list = document.querySelector<HTMLElement>("#settlement-trail-list");
  if (!list || isAdminRoute) {
    return;
  }
  const markets = [state.intervalMarket, state.stepsIntervalMarket, state.rrIntervalMarket].filter(Boolean) as IntervalParimutuelMarketRecord[];
  if (markets.length === 0) {
    list.innerHTML = `
      <div class="settlement-trail-empty">
        <strong>No interval proof yet</strong>
        <span>Once the automation publishes a market, this trail will show create tx, telemetry window, settlement tx, and claim readiness.</span>
      </div>
    `;
    return;
  }
  list.innerHTML = markets.map((market) => settlementTrailCard(market)).join("");
}

function settlementTrailCard(market: IntervalParimutuelMarketRecord) {
  const record = registryRecordForMarket(market);
  const label = metricDisplayName(market.metric);
  const unit = metricUnit(market.metric);
  const settled = market.status === 1 || Boolean(record?.settledTxHash);
  const observed = market.observedValue > 0n ? market.observedValue.toString() : record?.settledObservedValue?.toString();
  const settledOutcomeAbove = market.status === 1 ? market.settledOutcomeAbove : record?.settledOutcomeAbove;
  return `
    <article class="settlement-trail-card">
      <div class="settlement-trail-title">
        <span>${label} #${market.id.toString()}</span>
        <strong>${settled ? "Settled onchain" : market.status === 0 ? "Open onchain" : statusLabel(market.status)}</strong>
      </div>
      <div class="settlement-steps">
        <div><span>1. Market</span><strong>${txLink(record?.createdTxHash) ?? "Registry synced"}</strong></div>
        <div><span>2. Window</span><strong>${Number(market.intervalStartElapsedMs / 1000n)}s-${Number(market.intervalEndElapsedMs / 1000n)}s</strong></div>
        <div><span>3. Settlement</span><strong>${txLink(record?.settledTxHash) ?? (settled ? "Tx indexed soon" : "Awaiting close")}</strong></div>
        <div><span>4. Outcome</span><strong>${settled && observed ? `${settledOutcomeAbove ? "Above" : "Below"} · ${observed} ${unit}` : "Pending"}</strong></div>
      </div>
      <p>${settled ? `Resolved from sample #${market.settledSampleSeq || record?.settledSampleSeq || "-"} and now claimable by winning positions.` : "Automation will settle this after the telemetry window closes."}</p>
    </article>
  `;
}

function registryRecordForMarket(market: IntervalParimutuelMarketRecord) {
  return state.intervalMarketRegistry.find((record) => record.metric === market.metric && record.marketId === Number(market.id));
}

function txLink(hash?: string) {
  if (!hash) {
    return null;
  }
  const safeHash = escapeHtml(hash);
  return `<a href="${ARC_TESTNET_EXPLORER_URL}/tx/${safeHash}" target="_blank" rel="noreferrer">${shortenHash(hash)}</a>`;
}

function metricDisplayName(metric: "hr" | "rr" | "steps") {
  if (metric === "rr") return "RR interval";
  if (metric === "steps") return "Steps";
  return "Heart rate";
}

function metricUnit(metric: "hr" | "rr" | "steps") {
  if (metric === "rr") return "ms";
  if (metric === "steps") return "steps";
  return "bpm";
}

function renderFaucet(message?: string) {
  const amount = document.querySelector<HTMLElement>("#faucet-amount");
  const cooldown = document.querySelector<HTMLElement>("#faucet-cooldown");
  const count = document.querySelector<HTMLElement>("#faucet-count");
  const status = document.querySelector<HTMLElement>("#faucet-status");
  const claimButton = document.querySelector<HTMLButtonElement>("#faucet-claim");
  if (amount) {
    amount.textContent = state.faucet ? `${state.faucet.claimAmountFormatted} ${state.faucet.tokenSymbol ?? COLLATERAL_SYMBOL}` : `10 ${COLLATERAL_SYMBOL}`;
  }
  if (cooldown) {
    cooldown.textContent = state.faucet ? formatDuration(state.faucet.cooldownMs) : "6h";
  }
  if (count) {
    count.textContent = String(state.faucet?.totalClaimedWallets ?? 0);
  }
  if (status) {
    status.textContent = message ?? (
      usingSpectatorWallet()
        ? `Email wallet is already funded for this run.`
        : state.faucet?.ready
          ? `One ${COLLATERAL_SYMBOL} allocation per wallet every 3 hours.`
          : state.faucet?.externalFaucetUrl
            ? `Use the Circle faucet for ${COLLATERAL_SYMBOL} on Arc Testnet.`
            : "Test-balance claims are not configured right now."
    );
    status.classList.toggle("notice-error", Boolean(message && message.toLowerCase().includes("next claim")));
  }
  if (claimButton) {
    claimButton.disabled = usingSpectatorWallet() || (!state.account && !(state.faucet?.externalFaucetUrl && !state.faucet.ready));
  }
  renderAccessSummary();
}

function renderSessionOptions() {
  const select = document.querySelector<HTMLSelectElement>("#session-select");
  if (select) {
    const previousValue = select.value || state.preferredSessionId || "";
    const sessions = isAdminRoute
      ? state.sessions
      : state.sessions.slice(0, Math.min(4, state.sessions.length));

    select.innerHTML = sessions.map((session) => {
      const started = session.clientStartedAt ?? session.createdAt;
      return `<option value="${session.sessionId}">${session.sessionId.slice(0, 8)} · ${session.status} · ${formatClock(new Date(started), session)}</option>`;
    }).join("");
    if (sessions.length > 0) {
      const nextValue = sessions.some((session) => session.sessionId === previousValue)
        ? previousValue
        : (state.currentSessionId && sessions.some((session) => session.sessionId === state.currentSessionId))
          ? state.currentSessionId
          : sessions[0]!.sessionId;
      select.value = nextValue;
      state.preferredSessionId = nextValue;
      localStorage.setItem(PREFERRED_SESSION_STORAGE_KEY, nextValue);
    }
  }
  renderComputedElapsed();
}

function renderComputedElapsed() {
  const target = document.querySelector<HTMLElement>("#computed-elapsed");
  if (!target) {
    return;
  }
  const elapsed = computeTargetElapsedMs();
  const session = selectedSession();
  const minutes = Number(readInputValue("target-minutes"));
  const bpm = readInputValue("threshold-bpm");
  const stake = readInputValue("seed-liquidity");
  const bpmReadout = document.querySelector<HTMLElement>("#threshold-bpm-readout");
  const minutesReadout = document.querySelector<HTMLElement>("#target-minutes-readout");
  if (bpmReadout && bpm) {
    bpmReadout.textContent = `${bpm} bpm`;
  }
  const settlementAt = Number.isFinite(minutes) && minutes > 0 ? targetSettlementDate(minutes) : null;
  if (minutesReadout) {
    minutesReadout.textContent = settlementAt ? formatClock(settlementAt, session) : "-";
  }
  if (!elapsed || !session || !Number.isFinite(minutes) || !settlementAt) {
    target.textContent = "Select a live session to see the exact local settlement and close times.";
    return;
  }
  const closeAt = settlementAt;
  target.textContent = `${stake || "0"} ${COLLATERAL_SYMBOL} on ${statementLabel(Number(readInputValue("threshold-direction")), Number(bpm), formatClock(settlementAt, session))}. Market participation closes at ${formatClock(closeAt, session)} local time.`;
}

async function fetchIntervalWindow(sessionId: string, intervalStartMs: number, metric: "hr" | "rr" | "steps") {
  const intervalMs = LIVE_INTERVAL_MS;
  const params = new URLSearchParams({
    intervalStartMs: String(intervalStartMs),
    intervalMs: String(intervalMs),
    metric,
  });
  const isCurrentSession = sessionId === state.currentSessionId;
  const path = isCurrentSession
    ? `/api/cre/sessions/current/interval-window?${params.toString()}`
    : `/api/cre/sessions/${sessionId}/interval-window?${params.toString()}`;
  const response = await fetch(apiUrl(path));
  const payload = await readJson<IntervalWindowPayload>(response, "Live interval telemetry is temporarily unavailable.");
  const points = (payload.samples ?? [])
    .slice()
    .sort((left, right) => left.elapsedMsSinceSessionStart - right.elapsedMsSinceSessionStart);
  return {
    ok: true,
    sessionId: payload.sessionId,
    metric: payload.metric,
    intervalStartMs: payload.intervalStartMs,
    intervalEndMs: payload.intervalEndMs,
    referenceValue: payload.referenceValue ?? null,
    currentValue: payload.currentValue ?? points.at(-1)?.value ?? null,
    latestElapsedMs: payload.latestElapsedMs ?? points.at(-1)?.elapsedMsSinceSessionStart ?? null,
    samples: points,
  } satisfies IntervalWindowPayload;
}

function telemetrySampleFromIntervalPoint(
  point: IntervalWindowPayload["samples"][number],
  metric: "hr" | "rr" | "steps",
): TelemetrySample {
  return {
    sampleSeq: point.sampleSeq,
    bpm: metric === "hr" ? point.value : 0,
    rrLatestMs: metric === "rr" ? point.value : null,
    steps: metric === "steps" ? point.value : null,
    phoneObservedAt: point.phoneObservedAt,
    elapsedMsSinceSessionStart: point.elapsedMsSinceSessionStart,
  };
}

async function refreshIntervalExperience(options: { refreshOnchain?: boolean } = { refreshOnchain: true }) {
  if (isAdminRoute) {
    return;
  }
  const session = selectedSession();
  if (!session) {
    state.intervalSamples = [];
    state.intervalReferenceBpm = null;
    state.intervalCurrentBpm = null;
    state.intervalViewRange = null;
    state.intervalMarket = null;
    renderIntervalHero();
    return;
  }

  const intervals = buildIntervalOptions(session);
  if (intervals.length === 0) {
    state.intervalSamples = [];
    state.intervalReferenceBpm = null;
    state.intervalCurrentBpm = null;
    state.intervalViewRange = null;
    state.intervalMarket = null;
    renderIntervalHero();
    return;
  }

  const latestPublished = latestPublishedIntervalRegistryRecord("hr");
  const currentWindowStartMs = currentRollingIntervalStartElapsedMs(session);
  const targetStartMs = currentWindowStartMs;
  const selected =
    intervals.find((item) => item.startElapsedMs === targetStartMs) ??
    intervals[intervals.length - 1];
  const activeStartElapsedMs = selected?.startElapsedMs ?? currentWindowStartMs;
  state.selectedIntervalStartMs = activeStartElapsedMs;
  const window = await fetchIntervalWindow(session.sessionId, activeStartElapsedMs, "hr");
  const market = options.refreshOnchain
    ? latestPublished && latestPublished.windowStartElapsedMs === activeStartElapsedMs
      ? await loadIntervalMarket(latestPublished)
      : await loadMatchingIntervalMarket("hr", activeStartElapsedMs)
    : state.intervalMarket && Number(state.intervalMarket.intervalStartElapsedMs) === activeStartElapsedMs
      ? state.intervalMarket
      : null;
  state.intervalSamples = window.samples.map((sample) => telemetrySampleFromIntervalPoint(sample, "hr"));
  state.intervalReferenceBpm = window.referenceValue;
  state.intervalCurrentBpm = window.currentValue ?? state.intervalSamples[state.intervalSamples.length - 1]?.bpm ?? window.referenceValue;
  state.intervalViewRange = {
    startElapsedMs: activeStartElapsedMs,
    endElapsedMs: activeStartElapsedMs + LIVE_INTERVAL_MS,
  };
  state.intervalMarket = market;
  renderIntervalHero();
}

async function refreshRrIntervalExperience(options: { refreshOnchain?: boolean } = { refreshOnchain: true }) {
  if (isAdminRoute) {
    return;
  }
  const session = selectedSession();
  if (!session) {
    state.rrIntervalSamples = [];
    state.rrIntervalReferenceMs = null;
    state.rrIntervalCurrentMs = null;
    state.rrIntervalViewRange = null;
    state.rrIntervalMarket = null;
    state.rrDistributionValues = [];
    state.rrDistributionPrevSessionId = null;
    renderRrIntervalHero();
    renderRrDistribution();
    return;
  }

  const intervals = buildRrIntervalOptions(session);
  if (intervals.length === 0) {
    state.rrIntervalSamples = [];
    state.rrIntervalReferenceMs = null;
    state.rrIntervalCurrentMs = null;
    state.rrIntervalViewRange = null;
    state.rrIntervalMarket = null;
    state.rrDistributionValues = [];
    state.rrDistributionPrevSessionId = null;
    renderRrIntervalHero();
    renderRrDistribution();
    return;
  }

  const latestPublished = latestPublishedIntervalRegistryRecord("rr");
  const currentWindowStartMs = currentRollingIntervalStartElapsedMs(session);
  const targetStartMs = state.rrSelectedIntervalStartMs === null
    ? latestPublished?.windowStartElapsedMs ?? currentWindowStartMs
    : state.rrSelectedIntervalStartMs;
  const selected =
    intervals.find((item) => item.startElapsedMs === targetStartMs) ??
    intervals[intervals.length - 1];
  const activeStartElapsedMs = selected?.startElapsedMs ?? targetStartMs;
  state.rrSelectedIntervalStartMs = activeStartElapsedMs;
  const window = await fetchIntervalWindow(session.sessionId, activeStartElapsedMs, "rr");
  const market = options.refreshOnchain
    ? latestPublished && latestPublished.windowStartElapsedMs === activeStartElapsedMs
      ? await loadIntervalMarket(latestPublished)
      : await loadMatchingIntervalMarket("rr", activeStartElapsedMs)
    : state.rrIntervalMarket && Number(state.rrIntervalMarket.intervalStartElapsedMs) === activeStartElapsedMs
      ? state.rrIntervalMarket
      : null;
  state.rrIntervalSamples = window.samples.map((sample) => telemetrySampleFromIntervalPoint(sample, "rr"));
  state.rrIntervalReferenceMs = window.referenceValue;
  state.rrIntervalCurrentMs = window.currentValue ?? state.rrIntervalSamples[state.rrIntervalSamples.length - 1]?.rrLatestMs ?? window.referenceValue;
  state.rrIntervalViewRange = {
    startElapsedMs: activeStartElapsedMs,
    endElapsedMs: activeStartElapsedMs + LIVE_INTERVAL_MS,
  };
  state.rrIntervalMarket = market;
  renderRrIntervalHero();
  accumulateRrDistribution(state.rrIntervalSamples);
  renderRrDistribution();
}

async function refreshStepsIntervalExperience(options: { refreshOnchain?: boolean } = { refreshOnchain: true }) {
  if (isAdminRoute) {
    return;
  }
  const session = selectedSession();
  if (!session) {
    state.stepsIntervalSamples = [];
    state.stepsIntervalReference = null;
    state.stepsIntervalCurrent = null;
    state.stepsIntervalViewRange = null;
    state.stepsIntervalMarket = null;
    renderStepsIntervalHero();
    return;
  }

  const intervals = buildStepsIntervalOptions(session);
  if (intervals.length === 0) {
    state.stepsIntervalSamples = [];
    state.stepsIntervalReference = null;
    state.stepsIntervalCurrent = null;
    state.stepsIntervalViewRange = null;
    state.stepsIntervalMarket = null;
    renderStepsIntervalHero();
    return;
  }

  const latestPublished = latestPublishedIntervalRegistryRecord("steps");
  const currentWindowStartMs = currentRollingIntervalStartElapsedMs(session);
  const targetStartMs = currentWindowStartMs;
  const selected =
    intervals.find((item) => item.startElapsedMs === targetStartMs) ??
    intervals[intervals.length - 1];
  const activeStartElapsedMs = selected?.startElapsedMs ?? targetStartMs;
  state.stepsSelectedIntervalStartMs = activeStartElapsedMs;
  const window = await fetchIntervalWindow(session.sessionId, activeStartElapsedMs, "steps");
  const market = options.refreshOnchain
    ? latestPublished && latestPublished.windowStartElapsedMs === activeStartElapsedMs
      ? await loadIntervalMarket(latestPublished)
      : await loadMatchingIntervalMarket("steps", activeStartElapsedMs)
    : state.stepsIntervalMarket && Number(state.stepsIntervalMarket.intervalStartElapsedMs) === activeStartElapsedMs
      ? state.stepsIntervalMarket
      : null;
  state.stepsIntervalSamples = window.samples.map((sample) => telemetrySampleFromIntervalPoint(sample, "steps"));
  state.stepsIntervalReference = window.referenceValue;
  state.stepsIntervalCurrent = window.currentValue ?? state.stepsIntervalSamples[state.stepsIntervalSamples.length - 1]?.steps ?? window.referenceValue;
  state.stepsIntervalViewRange = {
    startElapsedMs: activeStartElapsedMs,
    endElapsedMs: activeStartElapsedMs + LIVE_INTERVAL_MS,
  };
  state.stepsIntervalMarket = market;
  renderStepsIntervalHero();
}

function renderRrIntervalHero() {
  const title = document.querySelector<HTMLElement>("#rr-interval-title");
  const subtitle = document.querySelector<HTMLElement>("#rr-interval-subtitle");
  const reference = document.querySelector<HTMLElement>("#rr-interval-reference");
  const current = document.querySelector<HTMLElement>("#rr-interval-current");
  const tabs = document.querySelector<HTMLElement>("#rr-interval-tabs");
  const chart = document.querySelector<SVGElement>("#rr-interval-chart");
  const returnCopy = document.querySelector<HTMLElement>("#rr-interval-return-copy");
  if (!title || !subtitle || !reference || !current || !tabs || !chart || !returnCopy) {
    return;
  }

  const session = selectedSession();
  if (!session || !state.rrIntervalViewRange) {
    title.textContent = `Live ${LIVE_INTERVAL_LABEL} RR interval`;
    subtitle.textContent = t("trade.waiting.rr");
    reference.textContent = "--";
    current.textContent = "--";
    tabs.innerHTML = "";
    chart.innerHTML = "";
    returnCopy.textContent = "The RR market will open automatically once live RR telemetry starts flowing from the event.";
    renderRrIntervalCountdown();
    renderRrIntervalTradePanel();
    return;
  }

  const intervals = buildRrIntervalOptions(session);
  const selected = intervals.find((item) => item.startElapsedMs === state.rrIntervalViewRange?.startElapsedMs) ?? intervals[intervals.length - 1];
  const rrHeroReference = activeIntervalReferenceForMetric("rr");
  title.textContent = `Live ${LIVE_INTERVAL_LABEL} RR interval`;
  subtitle.textContent = `Window ${formatIntervalSubtitle(selected.startAt, selected.endAt)}`;
  reference.textContent = rrHeroReference ? `${rrHeroReference} ms` : "--";
  current.textContent = state.rrIntervalCurrentMs ? `${state.rrIntervalCurrentMs} ms` : "--";
  tabs.innerHTML = intervals.map((interval) => (
    `<button class="interval-tab${interval.startElapsedMs === selected.startElapsedMs ? " active" : ""}" id="rr-interval-tab-${interval.startElapsedMs}">
      ${formatClock(interval.startAt, session)}
    </button>`
  )).join("");
  for (const interval of intervals) {
    bindClick(`rr-interval-tab-${interval.startElapsedMs}`, () => {
      state.rrSelectedIntervalStartMs = interval.startElapsedMs;
      void refreshRrIntervalExperience();
    });
  }
  chart.innerHTML = renderIntervalChart(state.rrIntervalSamples, rrHeroReference, "rr");
  renderRrIntervalCountdown();
  renderRrIntervalTradePanel();
}

function renderRrIntervalCountdown() {
  const countdown = document.querySelector<HTMLElement>("#rr-interval-countdown");
  if (!countdown) {
    return;
  }
  const session = selectedSession();
  if (!session || !state.rrIntervalViewRange) {
    countdown.textContent = "--:--";
    return;
  }
  const startedAt = new Date(session.clientStartedAt ?? session.createdAt);
  const closeAt = startedAt.getTime() + state.rrIntervalViewRange.endElapsedMs;
  const remainingMs = closeAt - Date.now();
  countdown.textContent = remainingMs > 0 ? formatCountdown(remainingMs) : "Closed";
}

function renderRrIntervalTradePanel() {
  const aboveButton = document.querySelector<HTMLButtonElement>("#rr-interval-side-above");
  const belowButton = document.querySelector<HTMLButtonElement>("#rr-interval-side-below");
  const aboveMultiplier = document.querySelector<HTMLElement>("#rr-interval-above-multiplier");
  const belowMultiplier = document.querySelector<HTMLElement>("#rr-interval-below-multiplier");
  const returnCopy = document.querySelector<HTMLElement>("#rr-interval-return-copy");
  const tradeButton = document.querySelector<HTMLButtonElement>("#rr-interval-trade-submit");
  if (!aboveButton || !belowButton || !aboveMultiplier || !belowMultiplier || !returnCopy || !tradeButton) {
    return;
  }

  const market = currentRrIntervalMarket();
  const amount = parseNumberInput("rr-interval-trade-amount") ?? 0;
  const yesEstimate = market ? estimateIntervalPayout(market, true, 1) : 0;
  const noEstimate = market ? estimateIntervalPayout(market, false, 1) : 0;
  aboveMultiplier.textContent = market ? `${yesEstimate.toFixed(2)}x` : "--";
  belowMultiplier.textContent = market ? `${noEstimate.toFixed(2)}x` : "--";
  aboveButton.classList.toggle("active", state.rrIntervalSelectedSide === "above");
  belowButton.classList.toggle("active", state.rrIntervalSelectedSide === "below");
  aboveButton.classList.toggle("secondary", state.rrIntervalSelectedSide !== "above");
  belowButton.classList.toggle("secondary", state.rrIntervalSelectedSide !== "below");
  tradeButton.disabled = !market || (market.status !== 0 && !intervalClaimable(market));
  if (!market) {
    returnCopy.textContent = "No onchain RR interval market is open yet. Keep the CRE automation loop running and the next interval will publish automatically.";
    tradeButton.textContent = "Current interval unavailable";
    return;
  }
  if (market.status === 1) {
    const claimable = intervalClaimable(market);
    returnCopy.textContent = claimable
      ? `This RR interval is settled. Your ${market.settledOutcomeAbove ? "Above" : "Below"} position can now be claimed.`
      : `This RR interval settled ${market.settledOutcomeAbove ? "Above" : "Below"} at ${market.observedValue.toString()} ms.`;
    tradeButton.textContent = claimable ? "Claim payout" : "Interval settled";
    tradeButton.disabled = !claimable;
    return;
  }
  if (market.status !== 0) {
    returnCopy.textContent = "This RR interval is not open.";
    tradeButton.textContent = "Interval unavailable";
    return;
  }
  const chosenEstimate = estimateIntervalPayout(market, state.rrIntervalSelectedSide === "above", amount || 1);
  const profit = chosenEstimate - (amount || 1);
  tradeButton.textContent = "Enter RR interval position";
  returnCopy.textContent = `${state.rrIntervalSelectedSide === "above" ? "Above" : "Below"} is pricing at ${(state.rrIntervalSelectedSide === "above" ? yesEstimate : noEstimate).toFixed(2)}x. A ${amount || 1} ${TRADING_UNIT_LABEL} position would return about ${chosenEstimate.toFixed(2)} ${TRADING_UNIT_LABEL} if correct (${profit >= 0 ? "+" : ""}${profit.toFixed(2)}). ${intervalStakeSummary(market, "RR")}`;
}

function renderStepsIntervalHero() {
  const title = document.querySelector<HTMLElement>("#steps-interval-title");
  const subtitle = document.querySelector<HTMLElement>("#steps-interval-subtitle");
  const reference = document.querySelector<HTMLElement>("#steps-interval-reference");
  const current = document.querySelector<HTMLElement>("#steps-interval-current");
  const tabs = document.querySelector<HTMLElement>("#steps-interval-tabs");
  const chart = document.querySelector<SVGElement>("#steps-interval-chart");
  const returnCopy = document.querySelector<HTMLElement>("#steps-interval-return-copy");
  if (!title || !subtitle || !reference || !current || !tabs || !chart || !returnCopy) {
    return;
  }

  const session = selectedSession();
  if (!session || !state.stepsIntervalViewRange) {
    title.textContent = `Live ${LIVE_INTERVAL_LABEL} steps interval`;
    subtitle.textContent = t("trade.waiting.steps");
    reference.textContent = "--";
    current.textContent = "--";
    tabs.innerHTML = "";
    chart.innerHTML = "";
    returnCopy.textContent = "";
    renderStepsIntervalCountdown();
    renderStepsIntervalTradePanel();
    return;
  }

  const intervals = buildStepsIntervalOptions(session);
  const selected = intervals.find((item) => item.startElapsedMs === state.stepsIntervalViewRange?.startElapsedMs) ?? intervals[intervals.length - 1];
  const stepsHeroReference = activeIntervalReferenceForMetric("steps");
  title.textContent = `Live ${LIVE_INTERVAL_LABEL} steps interval`;
  subtitle.textContent = `Window ${formatIntervalSubtitle(selected.startAt, selected.endAt)}`;
  reference.textContent = stepsHeroReference !== null ? `${stepsHeroReference} steps` : "--";
  current.textContent = state.stepsIntervalCurrent !== null ? `${state.stepsIntervalCurrent} steps` : "--";
  tabs.innerHTML = intervals.map((interval) => (
    `<button class="interval-tab${interval.startElapsedMs === selected.startElapsedMs ? " active" : ""}" id="steps-interval-tab-${interval.startElapsedMs}">
      ${formatClock(interval.startAt, session)}
    </button>`
  )).join("");
  for (const interval of intervals) {
    bindClick(`steps-interval-tab-${interval.startElapsedMs}`, () => {
      state.stepsSelectedIntervalStartMs = interval.startElapsedMs;
      void refreshStepsIntervalExperience();
    });
  }
  chart.innerHTML = renderIntervalChart(state.stepsIntervalSamples, stepsHeroReference, "steps");
  renderStepsIntervalCountdown();
  renderStepsIntervalTradePanel();
  renderAccountOpenPositions();
}

function renderStepsIntervalCountdown() {
  const countdown = document.querySelector<HTMLElement>("#steps-interval-countdown");
  if (!countdown) {
    return;
  }
  const session = selectedSession();
  if (!session || !state.stepsIntervalViewRange) {
    countdown.textContent = "--:--";
    return;
  }
  const startedAt = new Date(session.clientStartedAt ?? session.createdAt);
  const closeAt = startedAt.getTime() + state.stepsIntervalViewRange.endElapsedMs;
  const remainingMs = closeAt - Date.now();
  countdown.textContent = remainingMs > 0 ? formatCountdown(remainingMs) : "Closed";
}

function renderStepsIntervalTradePanel() {
  const aboveButton = document.querySelector<HTMLButtonElement>("#steps-interval-side-above");
  const belowButton = document.querySelector<HTMLButtonElement>("#steps-interval-side-below");
  const aboveMultiplier = document.querySelector<HTMLElement>("#steps-interval-above-multiplier");
  const belowMultiplier = document.querySelector<HTMLElement>("#steps-interval-below-multiplier");
  const returnCopy = document.querySelector<HTMLElement>("#steps-interval-return-copy");
  const tradeButton = document.querySelector<HTMLButtonElement>("#steps-interval-trade-submit");
  if (!aboveButton || !belowButton || !aboveMultiplier || !belowMultiplier || !returnCopy || !tradeButton) {
    return;
  }

  const market = currentStepsIntervalMarket();
  const yesEstimate = market ? estimateIntervalPayout(market, true, 1) : 0;
  const noEstimate = market ? estimateIntervalPayout(market, false, 1) : 0;
  aboveMultiplier.textContent = market ? `${yesEstimate.toFixed(2)}x` : "--";
  belowMultiplier.textContent = market ? `${noEstimate.toFixed(2)}x` : "--";
  aboveButton.classList.toggle("active", state.stepsIntervalSelectedSide === "above");
  belowButton.classList.toggle("active", state.stepsIntervalSelectedSide === "below");
  aboveButton.classList.toggle("secondary", state.stepsIntervalSelectedSide !== "above");
  belowButton.classList.toggle("secondary", state.stepsIntervalSelectedSide !== "below");
  tradeButton.disabled = !market || (market.status !== 0 && !intervalClaimable(market));
  if (!market) {
    returnCopy.textContent = "";
    tradeButton.textContent = "Enter position";
    return;
  }
  if (market.status === 1) {
    const claimable = intervalClaimable(market);
    returnCopy.textContent = claimable
      ? `This steps interval is settled. Your ${market.settledOutcomeAbove ? "Above" : "Below"} position can now be claimed.`
      : `This steps interval settled ${market.settledOutcomeAbove ? "Above" : "Below"} at ${market.observedValue.toString()} steps.`;
    tradeButton.textContent = claimable ? "Claim payout" : "Interval settled";
    tradeButton.disabled = !claimable;
    return;
  }
  if (market.status !== 0) {
    returnCopy.textContent = "This steps interval is not open.";
    tradeButton.textContent = "Interval unavailable";
    return;
  }
  tradeButton.textContent = "Enter position";
  returnCopy.textContent = "";
}

function renderSettlementOptions() {
  const select = document.querySelector<HTMLSelectElement>("#settle-market-select");
  if (!select) {
    return;
  }
  select.innerHTML = state.markets
    .filter((market) => market.status === 0 || market.status === 1)
    .map((market) => {
      const meta = state.marketMeta.get(Number(market.id));
      const session = market.sessionId ? state.sessions.find((item) => item.sessionId === market.sessionId) ?? null : null;
      return `<option value="${market.id.toString()}">#${market.id.toString()} · ${marketTitle(market, meta, formatMarketSchedule(session, market.t))}</option>`;
    })
    .join("");
}

function positionChipMarkup() {
  const chips: string[] = [];
  const seen = new Set<string>();
  const pushChip = (key: string, chip: string) => {
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    chips.push(chip);
  };
  for (const prediction of state.pendingPredictions.values()) {
    const side = prediction.isAbove ? "Above" : "Below";
    pushChip(
      `interval:${prediction.metric}:${prediction.marketId.toString()}:${side}`,
      `<div class="wager-chip is-pending"><strong>${escapeHtml(prediction.metricLabel)}</strong><span>Confirming interval #${prediction.marketId.toString()}</span><em>${side}</em></div>`,
    );
  }
  for (const market of state.markets.filter((item) => item.myYesShares > 0n || item.myNoShares > 0n)) {
    const meta = state.marketMeta.get(Number(market.id));
    const session = market.sessionId ? state.sessions.find((item) => item.sessionId === market.sessionId) ?? null : null;
    const title = marketTitle(market, meta, formatMarketSchedule(session, market.t));
    if (market.myYesShares > 0n) {
      pushChip(`threshold:${market.id.toString()}:yes`, `<div class="wager-chip"><strong>#${market.id.toString()}</strong><span>${title}</span><em>${isDirectionalInterval(meta) ? "Above" : "Yes"}</em></div>`);
    }
    if (market.myNoShares > 0n) {
      pushChip(`threshold:${market.id.toString()}:no`, `<div class="wager-chip"><strong>#${market.id.toString()}</strong><span>${title}</span><em>${isDirectionalInterval(meta) ? "Below" : "No"}</em></div>`);
    }
  }
  for (const market of [state.intervalMarket, state.stepsIntervalMarket, state.rrIntervalMarket]) {
    if (!market || (market.myAboveStake <= 0n && market.myBelowStake <= 0n)) {
      continue;
    }
    const metricLabel = market.metric === "steps" ? "Steps" : market.metric === "rr" ? "RR" : "HR";
    const isSettled = market.status === 1;
    if (market.myAboveStake > 0n) {
      const won = isSettled && market.settledOutcomeAbove;
      const outcomeHtml = isSettled ? `<strong class="${won ? "chip-won" : "chip-lost"}">${won ? t("account.won") : t("account.lost")}</strong>` : "";
      pushChip(`interval:${market.metric}:${market.id.toString()}:Above`, `<div class="wager-chip${isSettled ? (won ? " is-won" : " is-lost") : ""}"><strong>${metricLabel}</strong><span>Interval #${market.id.toString()}</span><em>${t("trade.above")}</em>${outcomeHtml}</div>`);
    }
    if (market.myBelowStake > 0n) {
      const won = isSettled && !market.settledOutcomeAbove;
      const outcomeHtml = isSettled ? `<strong class="${won ? "chip-won" : "chip-lost"}">${won ? t("account.won") : t("account.lost")}</strong>` : "";
      pushChip(`interval:${market.metric}:${market.id.toString()}:Below`, `<div class="wager-chip${isSettled ? (won ? " is-won" : " is-lost") : ""}"><strong>${metricLabel}</strong><span>Interval #${market.id.toString()}</span><em>${t("trade.below")}</em>${outcomeHtml}</div>`);
    }
  }
  for (const trade of state.spectatorTrades) {
    const isSettled = trade.status === "settled";
    const metricLabel = trade.metric === "HR" ? "Heart Rate" : trade.metric;
    const userWon = isSettled && trade.settledOutcomeAbove != null &&
      ((trade.side === "Above" && trade.settledOutcomeAbove) || (trade.side === "Below" && !trade.settledOutcomeAbove));
    const outcomeHtml = isSettled ? `<strong class="${userWon ? "chip-won" : "chip-lost"}">${userWon ? t("account.won") : t("account.lost")}</strong>` : "";
    pushChip(
      `ledger:${trade.kind}:${trade.marketId}:${trade.side}`,
      `<div class="wager-chip${isSettled ? (userWon ? " is-won" : " is-lost") : ""}"><strong>${escapeHtml(metricLabel)}</strong><span>${escapeHtml(trade.marketLabel)}</span><em>${escapeHtml(trade.side)}</em>${outcomeHtml}</div>`,
    );
  }
  return chips;
}

function renderAccountOpenPositions() {
  const target = document.querySelector<HTMLElement>("#account-open-positions");
  if (!target) {
    return;
  }
  const chips = positionChipMarkup();
  target.innerHTML = chips.length === 0
    ? `<div class="account-empty-position">${t("account.nopositions")}</div>`
    : `
      <div class="account-position-head">
        <span>${t("account.positions")}</span>
        <strong>${chips.length}</strong>
      </div>
      <div class="account-position-list">${chips.join("")}</div>
    `;
}

function updateNudgeAnimation() {
  const hasPrediction = positionChipMarkup().length > 0;
  document.querySelectorAll<HTMLElement>(".trade-side").forEach((btn) => {
    btn.classList.toggle("nudge-shine", !hasPrediction);
  });
}

function renderMarkets() {
  const grid = document.querySelector<HTMLElement>("#market-grid");
  const count = document.querySelector<HTMLElement>("#market-count");
  const wagers = document.querySelector<HTMLElement>("#my-wagers");
  if (!grid || !count) {
    return;
  }
  count.textContent = `${state.markets.length} markets`;
  if (wagers) {
    const chips = positionChipMarkup();
    wagers.innerHTML = chips.length === 0
      ? `
        <div class="rail-empty">
          <strong>No open positions</strong>
          <p>Your active interval exposure will appear here once you take a side.</p>
        </div>
      `
      : `
        <div class="wagers-panel">
          <div class="section-head">
            <h3>Open positions</h3>
            <span class="meta-label">${chips.length}</span>
          </div>
          <div class="wager-list">
            ${chips.join("")}
          </div>
        </div>
      `;
  }
  renderAccountOpenPositions();
  grid.innerHTML = state.markets.length === 0
    ? `
      <div class="market-empty">
        <strong>The market board is standing by.</strong>
        <p>${selectedSession() ? "This board will populate automatically once live interval markets begin publishing." : "This board will fill automatically once the live session starts publishing interval markets."}</p>
      </div>
    `
    : state.markets.map((market) => marketCard(market)).join("");
  renderBroadcastSummary();
  renderMarketCountdowns();
  for (const market of state.markets) {
    bindClick(`yes-${market.id.toString()}`, () => takePosition(market.id, true, `amount-${market.id.toString()}`));
    bindClick(`no-${market.id.toString()}`, () => takePosition(market.id, false, `amount-${market.id.toString()}`));
    bindClick(`claim-${market.id.toString()}`, () => claimMarket(market.id));
    bindInput(`amount-${market.id.toString()}`, () => updateMarketEstimate(market.id));
  }
  for (const market of state.markets) {
    updateMarketEstimate(market.id);
  }
}

function renderAdminTrades() {
  const target = document.querySelector<HTMLElement>("#admin-trades");
  if (!target) {
    return;
  }
  if (state.adminTradesStatus === "loading") {
    target.innerHTML = `
      <div class="admin-trade-skeleton"></div>
      <div class="admin-trade-skeleton"></div>
      <div class="admin-trade-skeleton"></div>
    `;
    return;
  }
  if (state.adminTradesStatus === "error") {
    target.innerHTML = `
      <div class="admin-trade-state">
        <strong>Couldn't load trades</strong>
        <p>${escapeHtml(state.adminTradesError ?? "The trade feed is temporarily unavailable.")}</p>
        <button id="admin-trades-retry" class="secondary" type="button">Try again</button>
      </div>
    `;
    bindClick("admin-trades-retry", () => refreshAdminTrades());
    return;
  }
  if (state.adminTrades.length === 0) {
    target.innerHTML = `
      <div class="admin-trade-state">
        <strong>No trades recorded yet</strong>
        <p>Once a user enters a position, the onchain event will appear here with wallet and market details.</p>
      </div>
    `;
    return;
  }

  const totalAmount = state.adminTrades.reduce((sum, trade) => sum + Number(trade.amountFormatted || 0), 0);
  const uniqueUsers = new Set(state.adminTrades.map((trade) => trade.account.toLowerCase())).size;
  target.innerHTML = `
    <div class="admin-trade-summary">
      <div><span>Total trades</span><strong>${state.adminTrades.length}</strong></div>
      <div><span>Unique wallets</span><strong>${uniqueUsers}</strong></div>
      <div><span>Total staked</span><strong>${totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${TRADING_UNIT_LABEL}</strong></div>
    </div>
    <div class="admin-trade-list">
      ${state.adminTrades.map((trade) => adminTradeRow(trade)).join("")}
    </div>
  `;
}

function adminTradeRow(trade: AdminTradeRecord) {
  const sessionLabel = trade.sessionId
    ? `${trade.sessionId.slice(0, 8)}...`
    : "No session";
  const outcome = trade.settledOutcomeAbove === null || trade.settledOutcomeAbove === undefined
    ? ""
    : `<span class="admin-trade-outcome">Settled ${trade.settledOutcomeAbove ? "Above" : "Below"}${trade.settledObservedValue !== null && trade.settledObservedValue !== undefined ? ` at ${trade.settledObservedValue}` : ""}</span>`;
  return `
    <article class="admin-trade-row">
      <div class="admin-trade-main">
        <div>
          <strong>${shortenAddress(trade.account)}</strong>
          <span>${shortenAddress(trade.account)} · ${escapeHtml(sessionLabel)}</span>
        </div>
        <a href="${ARC_TESTNET_EXPLORER_URL}/tx/${trade.txHash}" target="_blank" rel="noopener noreferrer">${shortenHash(trade.txHash)}</a>
      </div>
      <div class="admin-trade-details">
        <span>${escapeHtml(trade.kind)}</span>
        <span>#${trade.marketId} · ${escapeHtml(trade.metric)}</span>
        <span>${escapeHtml(trade.side)}</span>
        <strong>${escapeHtml(trade.amountFormatted)} ${TRADING_UNIT_LABEL}</strong>
      </div>
      <div class="admin-trade-meta">
        <span>${escapeHtml(trade.marketLabel)}</span>
        <span>${trade.blockNumber ? `Block ${escapeHtml(trade.blockNumber)}` : "Block pending"}</span>
        ${outcome}
      </div>
    </article>
  `;
}

function renderIntervalHero() {
  const title = document.querySelector<HTMLElement>("#interval-title");
  const subtitle = document.querySelector<HTMLElement>("#interval-subtitle");
  const reference = document.querySelector<HTMLElement>("#interval-reference");
  const current = document.querySelector<HTMLElement>("#interval-current");
  const tabs = document.querySelector<HTMLElement>("#interval-tabs");
  const chart = document.querySelector<SVGElement>("#interval-chart");
  const returnCopy = document.querySelector<HTMLElement>("#interval-return-copy");
  if (!title || !subtitle || !reference || !current || !tabs || !chart || !returnCopy) {
    return;
  }

  const session = selectedSession();
  if (!session || !state.intervalViewRange) {
    title.textContent = `Live ${LIVE_INTERVAL_LABEL} interval`;
    subtitle.textContent = t("trade.waiting.hr");
    reference.textContent = "--";
    current.textContent = "--";
    tabs.innerHTML = "";
    chart.innerHTML = "";
    returnCopy.textContent = "The market will open automatically once live telemetry starts flowing from the event.";
    renderIntervalCountdown();
    renderIntervalTradePanel();
    renderBroadcastSummary();
    return;
  }

  const intervals = buildIntervalOptions(session);
  const selected = intervals.find((item) => item.startElapsedMs === state.intervalViewRange?.startElapsedMs) ?? intervals[intervals.length - 1];
  const heroReference = activeIntervalReferenceForMetric("hr");
  title.textContent = `Live ${LIVE_INTERVAL_LABEL} interval`;
  subtitle.textContent = `Window ${formatIntervalSubtitle(selected.startAt, selected.endAt)}`;
  reference.textContent = heroReference ? `${heroReference} bpm` : "--";
  current.textContent = state.intervalCurrentBpm ? `${state.intervalCurrentBpm} bpm` : "--";
  tabs.innerHTML = intervals.map((interval) => (
    `<button class="interval-tab${interval.startElapsedMs === selected.startElapsedMs ? " active" : ""}" id="interval-tab-${interval.startElapsedMs}">
      ${formatClock(interval.startAt, session)}
    </button>`
  )).join("");
  for (const interval of intervals) {
    bindClick(`interval-tab-${interval.startElapsedMs}`, () => {
      // The live trade panel always snaps back to the latest open interval on refresh.
      state.selectedIntervalStartMs = interval.startElapsedMs;
      void refreshIntervalExperience();
    });
  }
  chart.innerHTML = renderIntervalChart(state.intervalSamples, heroReference, "hr");
  renderIntervalCountdown();
  renderIntervalTradePanel();
  renderAccountOpenPositions();
  renderBroadcastSummary();
}

function renderIntervalCountdown() {
  const countdown = document.querySelector<HTMLElement>("#interval-countdown");
  if (!countdown) {
    return;
  }
  const session = selectedSession();
  if (!session || !state.intervalViewRange) {
    countdown.textContent = "--:--";
    return;
  }
  const startedAt = new Date(session.clientStartedAt ?? session.createdAt);
  const closeAt = startedAt.getTime() + state.intervalViewRange.endElapsedMs;
  const remainingMs = closeAt - Date.now();
  countdown.textContent = remainingMs > 0 ? formatCountdown(remainingMs) : "Closed";
}

function renderIntervalTradePanel() {
  const aboveButton = document.querySelector<HTMLButtonElement>("#interval-side-above");
  const belowButton = document.querySelector<HTMLButtonElement>("#interval-side-below");
  const aboveMultiplier = document.querySelector<HTMLElement>("#interval-above-multiplier");
  const belowMultiplier = document.querySelector<HTMLElement>("#interval-below-multiplier");
  const returnCopy = document.querySelector<HTMLElement>("#interval-return-copy");
  const tradeButton = document.querySelector<HTMLButtonElement>("#interval-trade-submit");
  if (!aboveButton || !belowButton || !aboveMultiplier || !belowMultiplier || !returnCopy || !tradeButton) {
    return;
  }

  const market = currentIntervalMarket();
  const yesEstimate = market ? estimateIntervalPayout(market, true, 1) : 0;
  const noEstimate = market ? estimateIntervalPayout(market, false, 1) : 0;
  aboveMultiplier.textContent = market ? `${yesEstimate.toFixed(2)}x` : "--";
  belowMultiplier.textContent = market ? `${noEstimate.toFixed(2)}x` : "--";
  aboveButton.classList.toggle("active", state.intervalSelectedSide === "above");
  belowButton.classList.toggle("active", state.intervalSelectedSide === "below");
  aboveButton.classList.toggle("secondary", state.intervalSelectedSide !== "above");
  belowButton.classList.toggle("secondary", state.intervalSelectedSide !== "below");
  tradeButton.disabled = market ? (market.status !== 0 && !intervalClaimable(market)) : false;
  if (!market) {
    returnCopy.textContent = "Waiting for an active interval market…";
    tradeButton.textContent = t("trade.submit");
    return;
  }
  if (market.status === 1) {
    const claimable = intervalClaimable(market);
    returnCopy.textContent = claimable
      ? `This interval is settled. Your ${market.settledOutcomeAbove ? t("trade.above") : t("trade.below")} position can now be claimed.`
      : `This interval settled ${market.settledOutcomeAbove ? t("trade.above") : t("trade.below")} at ${market.observedValue.toString()} bpm.`;
    tradeButton.textContent = claimable ? t("modal.claim") : t("trade.settled");
    tradeButton.disabled = !claimable;
    return;
  }
  if (market.status !== 0) {
    returnCopy.textContent = "";
    tradeButton.textContent = t("trade.unavailable");
    return;
  }
  tradeButton.textContent = t("trade.submit");
  returnCopy.textContent = "";
}

function marketCard(market: MarketRecord) {
  const canClaim = market.status === 3 && !market.myClaimed && (market.myYesShares > 0n || market.myNoShares > 0n);
  const session = market.sessionId ? state.sessions.find((item) => item.sessionId === market.sessionId) ?? null : null;
  const settlementLabel = formatMarketSchedule(session, market.t);
  const closeAtMs = marketCloseTimestamp(session, market.tradingClosesAtElapsedMs);
  const closeMeta = closeAtMs ? String(closeAtMs) : "";
  const meta = state.marketMeta.get(Number(market.id));
  const isInterval = isDirectionalInterval(meta);
  return `
    <article class="market-card frosted">
      <div class="market-title-row">
        <div>
          <div class="market-tag">Market #${market.id.toString()}</div>
          <h3>${marketTitle(market, meta, settlementLabel)}</h3>
        </div>
        <div class="market-status status-${market.status}" data-close-at="${closeMeta}" id="countdown-${market.id.toString()}">${countdownLabel(market, closeAtMs)}</div>
      </div>
      <div class="odds-grid compact-grid">
        <div><span>${meta?.type === "rr_interval_direction" ? "Reference RR" : meta?.type === "steps_interval_direction" ? "Reference Steps" : isInterval ? "Reference HR" : "Total pool"}</span><strong>${isInterval ? intervalReferenceLabel(meta, market) : `${formatDisplay(market.yesPool + market.noPool)} ${TRADING_UNIT_LABEL}`}</strong></div>
      </div>
      <div class="bet-row">
        <label class="stacked-input">
          <span>Position size (${TRADING_UNIT_LABEL})</span>
          <input id="amount-${market.id.toString()}" class="text-input slim" type="number" min="1" step="1" value="10" />
        </label>
        <button id="yes-${market.id.toString()}">${isInterval ? "Above" : "Bet Yes"}</button>
        <button id="no-${market.id.toString()}" class="secondary">${isInterval ? "Below" : "Bet No"}</button>
      </div>
      <div class="market-copy" id="estimate-${market.id.toString()}">Estimated return if correct: calculating...</div>
      ${market.status === 3 ? `<div class="settled-strip">Observed ${market.observedValue.toString()} ${signalTypeUnit(market.signalType, meta)} · outcome ${market.settledBooleanOutcome ? "YES" : "NO"}</div>` : ""}
      ${canClaim ? `<button id="claim-${market.id.toString()}">Claim payout</button>` : ""}
    </article>
  `;
}

function renderMarketCountdowns() {
  const elements = document.querySelectorAll<HTMLElement>("[data-close-at]");
  for (const element of elements) {
    const closeAt = Number(element.dataset.closeAt ?? "");
    const marketId = Number((element.id.split("-")[1] ?? ""));
    const market = state.markets.find((item) => Number(item.id) === marketId);
    if (!market) {
      continue;
    }
    element.textContent = countdownLabel(market, Number.isFinite(closeAt) ? closeAt : null);
  }
}

function selectedSession() {
  const sessionId = readInputValue("session-select");
  return state.sessions.find((session) => session.sessionId === sessionId)
    ?? state.sessions.find((session) => session.sessionId === state.currentSessionId)
    ?? state.sessions.find((session) => session.status === "active" && (session.sampleCount ?? 0) > 0)
    ?? null;
}

function computeTargetElapsedMs() {
  const session = selectedSession();
  const targetMinutes = Number(readInputValue("target-minutes"));
  if (!session || !Number.isFinite(targetMinutes) || targetMinutes <= 0) {
    return null;
  }
  const startedAt = new Date(session.clientStartedAt ?? session.createdAt);
  const targetDate = targetSettlementDate(targetMinutes);
  const elapsed = targetDate.getTime() - startedAt.getTime();
  return elapsed > 0 ? elapsed : null;
}

function findSessionIdForHash(hash: `0x${string}`, signalType = 0) {
  for (const session of state.sessions) {
    const expectedHash = signalType === 7
      ? hashMetricSessionId(session.sessionId, "rr")
      : hashSessionId(session.sessionId);
    if (expectedHash === hash) {
      return session.sessionId;
    }
  }
  return null;
}

function hashSessionId(sessionId: string) {
  return keccak256(stringToHex(sessionId));
}

function hashMetricSessionId(sessionId: string, metric: "hr" | "rr" | "steps") {
  return metric === "hr" ? hashSessionId(sessionId) : hashSessionId(`${metric}:${sessionId}`);
}

function getWalletClient() {
  if (!window.ethereum || !state.account) {
    throw new Error("Wallet not connected");
  }
  return createWalletClient({
    account: state.account,
    chain: configuredChain,
    transport: custom(window.ethereum),
  });
}

function toYoutubeEmbedUrl(input: string): string {
  // Accept any YouTube URL format and return a clean embed URL
  // Handles: youtu.be/ID, youtube.com/watch?v=ID, youtube.com/live/ID, youtube.com/embed/ID
  try {
    const u = new URL(input.trim());
    let videoId: string | null = null;
    if (u.hostname === "youtu.be") {
      videoId = u.pathname.slice(1).split("?")[0];
    } else if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) {
        videoId = u.pathname.split("/embed/")[1].split("?")[0];
      } else if (u.pathname.startsWith("/live/")) {
        videoId = u.pathname.split("/live/")[1].split("?")[0];
      } else {
        videoId = u.searchParams.get("v");
      }
    }
    if (videoId) {
      return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
    }
  } catch {}
  return input.trim();
}

async function saveYoutubeUrl() {
  const raw = readInputValue("youtube-url");
  if (!raw) {
    setStatus("Enter a YouTube embed URL", "warning");
    return;
  }
  const value = toYoutubeEmbedUrl(raw);
  console.log("[saveYoutubeUrl] normalised URL:", raw, "→", value);
  state.youtubeUrl = value;
  localStorage.setItem(YOUTUBE_STORAGE_KEY, value);
  renderBroadcastMedia();
  try {
    console.log("[saveYoutubeUrl] posting to /api/admin/config:", value);
    const res = await fetch(apiUrl("/api/admin/config"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeUrl: value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
      const msg = data?.error ?? `HTTP ${res.status}`;
      console.error("[saveYoutubeUrl] server rejected save:", res.status, msg);
      setStatus(`Embed saved locally but server rejected save (${res.status}: ${msg})`, "warning");
      return;
    }
    console.log("[saveYoutubeUrl] server confirmed save");
  } catch (err) {
    console.error("[saveYoutubeUrl] network error:", err);
    setStatus("Embed saved locally but failed to reach server", "warning");
    return;
  }
  setStatus("Updated broadcast embed.", "success");
}

async function fetchServerConfig() {
  try {
    const res = await fetch(apiUrl("/api/config"));
    if (!res.ok) return;
    const data = (await res.json()) as { ok: boolean; youtubeUrl: string };
    if (data.ok && data.youtubeUrl && !data.youtubeUrl.includes("YOUR_CHANNEL_ID")) {
      state.youtubeUrl = data.youtubeUrl;
      localStorage.setItem(YOUTUBE_STORAGE_KEY, data.youtubeUrl);
      renderBroadcastMedia();
    }
  } catch {}
}


function bindClick(id: string, handler: () => void | Promise<void>) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  let inFlight = false;
  element.addEventListener("click", () => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    element.setAttribute("aria-busy", "true");
    void Promise.resolve(handler()).catch((error: unknown) => {
      setStatus(userFacingErrorMessage(error, "That action couldn't be completed."), "error");
    }).finally(() => {
      inFlight = false;
      element.removeAttribute("aria-busy");
    });
  });
}

function bindInput(id: string, handler: () => void) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  element.addEventListener("input", handler);
  element.addEventListener("change", handler);
}

function setBusy(id: string, busy: boolean) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  if (busy) {
    element.setAttribute("aria-busy", "true");
  } else {
    element.removeAttribute("aria-busy");
  }
}

function readInputValue(id: string) {
  const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return element?.value.trim() ?? "";
}

function parseNumberInput(id: string) {
  const raw = Number(readInputValue(id));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function setStatus(message: string, tone: StatusTone = "neutral") {
  state.status = message;
  state.statusTone = tone;
  const pill = document.querySelector<HTMLElement>("#status-pill");
  if (pill) {
    pill.textContent = message;
    pill.dataset.tone = tone;
  }
}

function userFacingErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }
  const message = error.message.trim();
  const lower = message.toLowerCase();
  if (lower.includes("nonce too low")) {
    return "A previous wallet transaction is still pending. Confirm it in MetaMask or wait, then try again.";
  }
  if (lower.includes("already known")) {
    return "That wallet transaction is already pending in MetaMask.";
  }
  if (lower.includes("replacement transaction underpriced")) {
    return "A previous wallet transaction is still pending. Confirm or replace it in MetaMask, then retry.";
  }
  if (
    lower.includes("user rejected") ||
    lower.includes("rejected the request") ||
    lower.includes("denied transaction") ||
    lower.includes("user denied")
  ) {
    return "Wallet action was cancelled.";
  }
  if (lower.includes("wallet not connected")) {
    return "Connect a wallet to continue.";
  }
  if (
    lower.includes("unexpected token") ||
    lower.includes("json") ||
    lower.includes("parse")
  ) {
    return "Live data is still syncing. Retrying automatically.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("load failed")
  ) {
    return "Couldn't refresh the live event data. Retrying automatically.";
  }
  if (lower.includes("insufficient funds")) {
    return "There isn't enough balance available for that action.";
  }
  if (lower.includes("execution reverted")) {
    return "The transaction didn't complete. Check market status, balance, and approval.";
  }
  return message.length > 120 ? fallback : message;
}

async function readJson<T>(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    throw new Error(fallbackMessage);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}

function hasConfiguredBroadcast() {
  const url = state.youtubeUrl.trim();
  return Boolean(url) && !url.includes("YOUR_CHANNEL_ID");
}

function broadcastMediaMarkup() {
  if (!hasConfiguredBroadcast()) {
    return `
      <div class="video-placeholder">
        <div class="video-placeholder-kicker">${t("broadcast.standby.kicker")}</div>
        <strong>${t("broadcast.standby.title")}</strong>
      </div>
    `;
  }
  // Always use youtube-nocookie.com — avoids cookie/bot-check issues with cross-site
  // tracking restrictions in Safari and Chrome. Upgrade any stored youtube.com URL here
  // so existing Supabase entries benefit without needing a re-save.
  const embedSrc = state.youtubeUrl.replace(
    /https?:\/\/(www\.)?youtube\.com\/embed\//,
    "https://www.youtube-nocookie.com/embed/",
  );
  return `
    <iframe
      id="youtube-embed"
      src="${escapeHtml(embedSrc)}"
      title="Live stream"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; storage-access"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  `;
}

function renderBroadcastMedia() {
  const media = document.querySelector<HTMLElement>("#broadcast-media");
  if (!media) {
    return;
  }
  media.classList.toggle("is-placeholder", !hasConfiguredBroadcast());
  media.innerHTML = broadcastMediaMarkup();
}

function formatDisplay(value: bigint) {
  return Number(formatUnits(value, TRADING_UNIT_DECIMALS)).toFixed(2);
}

function formatElapsed(ms: bigint) {
  const totalSeconds = Number(ms / 1000n);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function activeTimeZone(session?: TelemetrySession | null) {
  return session?.eventTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function formatClock(date: Date, session?: TelemetrySession | null) {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: activeTimeZone(session),
  }).format(date);
}

function formatMarketSchedule(session: TelemetrySession | null, elapsedMs: bigint) {
  if (!session) {
    return formatElapsed(elapsedMs);
  }
  const startedAt = new Date(session.clientStartedAt ?? session.createdAt);
  const settlementAt = new Date(startedAt.getTime() + Number(elapsedMs));
  return formatClock(settlementAt, session);
}

function marketCloseTimestamp(session: TelemetrySession | null, elapsedMs: bigint) {
  if (!session) {
    return null;
  }
  const startedAt = new Date(session.clientStartedAt ?? session.createdAt);
  return startedAt.getTime() + Number(elapsedMs);
}

function targetSettlementDate(minutes: number) {
  const target = new Date();
  target.setSeconds(0, 0);
  target.setMinutes(target.getMinutes() + minutes);
  return target;
}

function signalTypeLabel(signalType: number, meta?: MarketMeta) {
  if (meta?.type === "hr_interval_direction") return "Heart Rate";
  if (meta?.type === "rr_interval_direction") return "RR Interval";
  if (meta?.type === "steps_interval_direction") return "Steps";
  switch (signalType) {
    case 0:
      return "Heart Rate";
    case 1:
      return "RMSSD";
    case 2:
      return "SDNN";
    case 3:
      return "Steps";
    case 4:
      return "Cadence";
    case 5:
      return "Pace";
    case 6:
      return "Distance";
    case 7:
      return "RR Interval";
    default:
      return "Signal";
  }
}

function signalTypeUnit(signalType: number, meta?: MarketMeta) {
  if (meta?.type === "hr_interval_direction") return "bpm";
  if (meta?.type === "rr_interval_direction") return "ms";
  if (meta?.type === "steps_interval_direction") return "steps";
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

function statementLabel(direction: number, thresholdValue: number, timeLabel: string, signalType = 0, meta?: MarketMeta) {
  return `${signalTypeLabel(signalType, meta)} ${direction === 1 ? "below" : "above"} ${thresholdValue} ${signalTypeUnit(signalType, meta)} at ${timeLabel}`;
}

function isDirectionalInterval(meta: MarketMeta | undefined) {
  return meta?.type === "hr_interval_direction" || meta?.type === "rr_interval_direction" || meta?.type === "steps_interval_direction";
}

function intervalReferenceLabel(meta: MarketMeta | undefined, market: MarketRecord) {
  if (meta?.type === "rr_interval_direction") {
    return `${meta.referenceRrMs ?? market.thresholdValue} ms`;
  }
  if (meta?.type === "steps_interval_direction") {
    return `${meta.referenceSteps ?? market.thresholdValue} steps`;
  }
  if (meta?.type === "hr_interval_direction") {
    return `${meta.referenceBpm ?? market.thresholdValue} bpm`;
  }
  return `${market.thresholdValue} ${signalTypeUnit(market.signalType, meta)}`;
}

function marketTitle(market: MarketRecord, meta: MarketMeta | undefined, settlementLabel: string) {
  if (meta?.type === "hr_interval_direction") {
    return `Heart Rate above or below ${meta.referenceBpm ?? market.thresholdValue} at ${settlementLabel}`;
  }
  if (meta?.type === "rr_interval_direction") {
    return `RR above or below ${meta.referenceRrMs ?? market.thresholdValue} ms at ${settlementLabel}`;
  }
  if (meta?.type === "steps_interval_direction") {
    return `Steps above or below ${meta.referenceSteps ?? market.thresholdValue} over ${LIVE_INTERVAL_MINUTES} minutes ending at ${settlementLabel}`;
  }
  if (meta?.type === "steps_threshold_window") {
    return `Steps ${meta.direction === "under" ? "below" : "above"} ${meta.threshold} over ${LIVE_INTERVAL_MINUTES} minutes ending at ${settlementLabel}`;
  }
  return statementLabel(market.thresholdDirection, market.thresholdValue, settlementLabel, market.signalType, meta);
}

function countdownLabel(market: MarketRecord, closeAtMs: number | null) {
  if (market.status !== 0 || !closeAtMs) {
    return statusLabel(market.status);
  }
  const remainingMs = closeAtMs - Date.now();
  if (remainingMs <= 0) {
    return "Market participation closed";
  }
  return `Market participation closes in ${formatCountdown(remainingMs)}`;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function updateMarketEstimate(marketId: bigint) {
  const market = state.markets.find((item) => item.id === marketId);
  const target = document.querySelector<HTMLElement>(`#estimate-${marketId.toString()}`);
  if (!market || !target) {
    return;
  }
  const stake = parseNumberInput(`amount-${marketId.toString()}`) ?? 0;
  if (stake <= 0) {
    target.textContent = "Enter a stake to see the estimated return if your prediction is correct.";
    return;
  }
  const yesEstimate = estimatePayout(market, true, stake);
  const noEstimate = estimatePayout(market, false, stake);
  const yesProfit = yesEstimate - stake;
  const noProfit = noEstimate - stake;
  target.textContent = `Estimated total payout if correct: Yes ~${yesEstimate.toFixed(2)} ${TRADING_UNIT_LABEL} (profit ${yesProfit >= 0 ? "+" : ""}${yesProfit.toFixed(2)}), No ~${noEstimate.toFixed(2)} ${TRADING_UNIT_LABEL} (profit ${noProfit >= 0 ? "+" : ""}${noProfit.toFixed(2)}).`;
}

function estimatePayout(market: MarketRecord, isYes: boolean, stake: number) {
  const collateralIn = parseUnits(String(stake), TRADING_UNIT_DECIMALS);
  const yesPool = market.yesPool;
  const noPool = market.noPool;
  if (collateralIn <= 0n || yesPool <= 0n || noPool <= 0n) {
    return 0;
  }
  const invariant = yesPool * noPool;
  let sharesOut = 0n;
  let totalCollateral = yesPool + noPool;
  let totalWinningShares = isYes ? market.totalYesShares : market.totalNoShares;
  if (isYes) {
    const newNoPool = noPool + collateralIn;
    const newYesPool = invariant / newNoPool;
    sharesOut = yesPool - newYesPool;
  } else {
    const newYesPool = yesPool + collateralIn;
    const newNoPool = invariant / newYesPool;
    sharesOut = noPool - newNoPool;
  }
  totalCollateral += collateralIn;
  totalWinningShares += sharesOut;
  if (sharesOut <= 0n || totalWinningShares <= 0n) {
    return 0;
  }
  return Number(formatUnits((totalCollateral * sharesOut) / totalWinningShares, TRADING_UNIT_DECIMALS));
}

function currentIntervalMarket() {
  return state.intervalMarket;
}

function currentRrIntervalMarket() {
  return state.rrIntervalMarket;
}

function currentStepsIntervalMarket() {
  return state.stepsIntervalMarket;
}

function buildIntervalOptionsFor(session: TelemetrySession, selectedIntervalStartMs: number | null, inWindowElapsedMs: number | null) {
  const startedAt = new Date(session.clientStartedAt ?? session.createdAt);
  const wallClockElapsedMs = Math.max(0, Date.now() - startedAt.getTime());
  const latestSampleElapsedMs = session.status === "active"
    ? Math.max(session.lastElapsedMs ?? 0, inWindowElapsedMs ?? 0, wallClockElapsedMs)
    : Math.max(session.lastElapsedMs ?? 0, inWindowElapsedMs ?? 0);
  const intervalMs = LIVE_INTERVAL_MS;
  const currentStart = Math.floor(latestSampleElapsedMs / intervalMs) * intervalMs;
  const options: Array<{ startElapsedMs: number; endElapsedMs: number; startAt: Date; endAt: Date }> = [];
  for (let offset = 3; offset >= 0; offset -= 1) {
    const startElapsedMs = currentStart - offset * intervalMs;
    if (startElapsedMs < 0) {
      continue;
    }
    const endElapsedMs = startElapsedMs + intervalMs;
    options.push({
      startElapsedMs,
      endElapsedMs,
      startAt: new Date(startedAt.getTime() + startElapsedMs),
      endAt: new Date(startedAt.getTime() + endElapsedMs),
    });
  }
  if (
    selectedIntervalStartMs !== null &&
    selectedIntervalStartMs >= 0 &&
    !options.some((option) => option.startElapsedMs === selectedIntervalStartMs)
  ) {
    const startElapsedMs = selectedIntervalStartMs;
    options.unshift({
      startElapsedMs,
      endElapsedMs: startElapsedMs + intervalMs,
      startAt: new Date(startedAt.getTime() + startElapsedMs),
      endAt: new Date(startedAt.getTime() + startElapsedMs + intervalMs),
    });
  }
  return options.sort((left, right) => left.startElapsedMs - right.startElapsedMs);
}

function currentRollingIntervalStartElapsedMs(session: TelemetrySession) {
  const startedAt = new Date(session.clientStartedAt ?? session.createdAt);
  const wallClockElapsedMs = Math.max(0, Date.now() - startedAt.getTime());
  const latestElapsedMs = session.status === "active"
    ? Math.max(session.lastElapsedMs ?? 0, wallClockElapsedMs)
    : (session.lastElapsedMs ?? wallClockElapsedMs);
  return Math.floor(latestElapsedMs / LIVE_INTERVAL_MS) * LIVE_INTERVAL_MS;
}

function buildIntervalOptions(session: TelemetrySession) {
  const inWindowElapsedMs = state.intervalSamples[state.intervalSamples.length - 1]?.elapsedMsSinceSessionStart ?? null;
  return buildIntervalOptionsFor(session, state.selectedIntervalStartMs, inWindowElapsedMs);
}

function buildRrIntervalOptions(session: TelemetrySession) {
  const inWindowElapsedMs = state.rrIntervalSamples[state.rrIntervalSamples.length - 1]?.elapsedMsSinceSessionStart ?? null;
  return buildIntervalOptionsFor(session, state.rrSelectedIntervalStartMs, inWindowElapsedMs);
}

function buildStepsIntervalOptions(session: TelemetrySession) {
  const inWindowElapsedMs = state.stepsIntervalSamples[state.stepsIntervalSamples.length - 1]?.elapsedMsSinceSessionStart ?? null;
  return buildIntervalOptionsFor(session, state.stepsSelectedIntervalStartMs, inWindowElapsedMs);
}

function formatIntervalSubtitle(startAt: Date, endAt: Date) {
  const session = selectedSession();
  return `${formatClock(startAt, session)}-${formatClock(endAt, session)}`;
}

function metricSampleValue(sample: TelemetrySample, metric: "hr" | "rr" | "steps") {
  if (metric === "rr") {
    return sample.rrLatestMs ?? null;
  }
  if (metric === "steps") {
    return sample.steps ?? null;
  }
  return sample.bpm;
}

function renderIntervalChart(samples: TelemetrySample[], referenceValue: number | null, metric: "hr" | "rr" | "steps" = "hr") {
  if (samples.length === 0) {
    return `
      <rect x="0" y="0" width="720" height="260" fill="rgba(255,255,255,0.4)" rx="16"></rect>
      <text x="50%" y="46%" text-anchor="middle" fill="rgba(17,17,17,0.66)" font-size="18" font-weight="700">${metric === "rr" ? t("trade.chart.waiting.rr") : metric === "steps" ? t("trade.chart.waiting.steps") : t("trade.chart.waiting.hr")}</text>
      <text x="50%" y="58%" text-anchor="middle" fill="rgba(17,17,17,0.48)" font-size="14">${t("trade.chart.lede")}</text>
    `;
  }
  const valuedSamples = samples.filter((sample) => metricSampleValue(sample, metric) !== null);
  if (valuedSamples.length === 0) {
    return `
      <rect x="0" y="0" width="720" height="260" fill="rgba(255,255,255,0.4)" rx="16"></rect>
      <text x="50%" y="46%" text-anchor="middle" fill="rgba(17,17,17,0.66)" font-size="18" font-weight="700">${metric === "rr" ? t("trade.chart.waiting.rr") : metric === "steps" ? t("trade.chart.waiting.steps") : t("trade.chart.waiting.hr")}</text>
      <text x="50%" y="58%" text-anchor="middle" fill="rgba(17,17,17,0.48)" font-size="14">${t("trade.chart.lede")}</text>
    `;
  }
  const width = 720;
  const height = 260;
  const paddingX = 20;
  const paddingY = 20;
  const values = valuedSamples.map((sample) => metricSampleValue(sample, metric) ?? 0);
  const padding = metric === "rr" ? 30 : metric === "steps" ? 12 : 3;
  const minValue = Math.min(...values, referenceValue ?? Infinity) - padding;
  const maxValue = Math.max(...values, referenceValue ?? 0) + padding;
  const start = valuedSamples[0]?.elapsedMsSinceSessionStart ?? 0;
  const end = valuedSamples[valuedSamples.length - 1]?.elapsedMsSinceSessionStart ?? start + 1;
  const xFor = (value: number) => paddingX + ((value - start) / Math.max(1, end - start)) * (width - paddingX * 2);
  const yFor = (value: number) => height - paddingY - ((value - minValue) / Math.max(1, maxValue - minValue)) * (height - paddingY * 2);
  const path = valuedSamples.map((sample, index) => `${index === 0 ? "M" : "L"} ${xFor(sample.elapsedMsSinceSessionStart).toFixed(1)} ${yFor(metricSampleValue(sample, metric) ?? 0).toFixed(1)}`).join(" ");
  const last = valuedSamples[valuedSamples.length - 1];
  const lastValue = metricSampleValue(last, metric) ?? 0;
  const referenceY = referenceValue !== null ? yFor(referenceValue) : null;
  return `
    <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(255,255,255,0.45)" rx="16"></rect>
    ${referenceY !== null ? `<line x1="${paddingX}" y1="${referenceY}" x2="${width - paddingX}" y2="${referenceY}" stroke="rgba(255,138,76,0.65)" stroke-dasharray="6 6" />` : ""}
    <path d="${path}" fill="none" stroke="#ff8a4c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${xFor(last.elapsedMsSinceSessionStart)}" cy="${yFor(lastValue)}" r="6" fill="#ff8a4c" />
  `;
}

function setIntervalSide(side: "above" | "below") {
  state.intervalSelectedSide = side;
  renderIntervalTradePanel();
}

function setRrIntervalSide(side: "above" | "below") {
  state.rrIntervalSelectedSide = side;
  renderRrIntervalTradePanel();
}

function setStepsIntervalSide(side: "above" | "below") {
  state.stepsIntervalSelectedSide = side;
  renderStepsIntervalTradePanel();
}

function nudgeIntervalStake(amount: number) {
  const input = document.querySelector<HTMLInputElement>("#interval-trade-amount");
  if (!input) {
    return;
  }
  const currentValue = Number(input.value || "0");
  input.value = String(Math.max(1, currentValue + amount));
  renderIntervalTradePanel();
}

function nudgeRrIntervalStake(amount: number) {
  const input = document.querySelector<HTMLInputElement>("#rr-interval-trade-amount");
  if (!input) {
    return;
  }
  const currentValue = Number(input.value || "0");
  input.value = String(Math.max(1, currentValue + amount));
  renderRrIntervalTradePanel();
}

function nudgeStepsIntervalStake(amount: number) {
  const input = document.querySelector<HTMLInputElement>("#steps-interval-trade-amount");
  if (!input) {
    return;
  }
  const currentValue = Number(input.value || "0");
  input.value = String(Math.max(1, currentValue + amount));
  renderStepsIntervalTradePanel();
}

function setRrIntervalStakeToMax() {
  const input = document.querySelector<HTMLInputElement>("#rr-interval-trade-amount");
  if (!input) {
    return;
  }
  input.value = String(Math.max(1, Math.floor(Number(formatUnits(state.balance, TRADING_UNIT_DECIMALS)))));
  renderRrIntervalTradePanel();
}

async function withConfirmingElement<T>(
  element: HTMLButtonElement,
  label: string,
  task: () => Promise<T> | T,
) {
  const previousText = element.textContent ?? "";
  const previousDisabled = element.disabled;
  element.disabled = true;
  element.setAttribute("aria-busy", "true");
  element.classList.add("is-confirming");
  element.textContent = label;
  try {
    return await task();
  } finally {
    element.textContent = previousText;
    element.disabled = previousDisabled;
    element.removeAttribute("aria-busy");
    element.classList.remove("is-confirming");
  }
}

async function withConfirmingButton<T>(
  buttonId: string,
  label: string,
  task: () => Promise<T> | T,
) {
  const button = document.querySelector<HTMLButtonElement>(`#${buttonId}`);
  if (!button) {
    return task();
  }
  return withConfirmingElement(button, label, task);
}

async function submitIntervalTrade() {
  return withConfirmingButton("interval-trade-submit", "Confirming", async () => {
  let market = currentIntervalMarket();
  if (!market || market.status !== 0) {
    await refreshIntervalExperience();
    market = currentIntervalMarket();
  }
  if (!market) {
    setStatus(`No active ${LIVE_INTERVAL_LABEL} interval market yet`, "warning");
    return;
  }
  if (market.status === 1 && intervalClaimable(market)) {
    await claimIntervalMarket(market.id, "hr");
    return;
  }
  if (market.status !== 0) {
    setStatus(`The current ${LIVE_INTERVAL_LABEL} HR interval is no longer open`, "warning");
    return;
  }
  setStatus("Opening wallet for HR interval position…");
  await takeIntervalPosition(
    market.id,
    state.intervalSelectedSide === "above",
    "interval-trade-amount",
    "HR",
  );
  });
}

async function submitRrIntervalTrade() {
  return withConfirmingButton("rr-interval-trade-submit", "Confirming", async () => {
  let market = currentRrIntervalMarket();
  if (!market || market.status !== 0) {
    await refreshRrIntervalExperience();
    market = currentRrIntervalMarket();
  }
  if (!market) {
    setStatus(`No active ${LIVE_INTERVAL_LABEL} RR interval market yet`, "warning");
    return;
  }
  if (market.status === 1 && intervalClaimable(market)) {
    await claimIntervalMarket(market.id, "rr");
    return;
  }
  if (market.status !== 0) {
    setStatus(`The current ${LIVE_INTERVAL_LABEL} RR interval is no longer open`, "warning");
    return;
  }
  setStatus("Opening wallet for RR interval position…");
  await takeIntervalPosition(
    market.id,
    state.rrIntervalSelectedSide === "above",
    "rr-interval-trade-amount",
    "RR",
  );
  });
}

async function submitStepsIntervalTrade() {
  return withConfirmingButton("steps-interval-trade-submit", "Confirming", async () => {
  let market = currentStepsIntervalMarket();
  if (!market || market.status !== 0) {
    await refreshStepsIntervalExperience();
    market = currentStepsIntervalMarket();
  }
  if (!market) {
    setStatus(`No active ${LIVE_INTERVAL_LABEL} steps interval market yet`, "warning");
    return;
  }
  if (market.status === 1 && intervalClaimable(market)) {
    await claimIntervalMarket(market.id, "steps");
    return;
  }
  if (market.status !== 0) {
    setStatus(`The current ${LIVE_INTERVAL_LABEL} steps interval is no longer open`, "warning");
    return;
  }
  setStatus("Opening wallet for steps interval position…");
  await takeIntervalPosition(
    market.id,
    state.stepsIntervalSelectedSide === "above",
    "steps-interval-trade-amount",
    "steps",
  );
  });
}

function formatDuration(ms: number) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  return hours >= 1 ? `${hours}h` : `${Math.floor(ms / (60 * 1000))}m`;
}


function statusLabel(status: number) {
  return ["Open", "Closed", "Settlement Requested", "Settled", "Cancelled"][status] ?? `Status ${status}`;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatSpectatorDisplayEmail(email: string) {
  const syntheticMatch = email.match(/^([a-z]+)-([^@]+)@privy\.local$/i);
  if (syntheticMatch) {
    const provider = syntheticMatch[1];
    const subject = syntheticMatch[2];
    const providerLabel = provider === "twitter" ? "X" : `${provider.charAt(0).toUpperCase()}${provider.slice(1)}`;
    const shortSubject = subject.length > 10 ? `${subject.slice(0, 6)}…${subject.slice(-2)}` : subject;
    return `${providerLabel} · ${shortSubject}`;
  }
  if (email.length <= 28) {
    return email;
  }
  const [name = "", domain = ""] = email.split("@");
  const shortName = name.length > 14 ? `${name.slice(0, 11)}…` : name;
  return domain ? `${shortName}@${domain}` : email;
}

function spectatorInitial(email: string) {
  const trimmed = email.trim();
  const syntheticMatch = trimmed.match(/^([a-z]+)-([^@]+)@privy\.local$/i);
  const source = syntheticMatch?.[1] ?? trimmed;
  return (source.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();
}

function shortenHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function addressesEqual(left: string | null, right: string) {
  return (left ?? "").toLowerCase() === right.toLowerCase();
}

function apiUrl(path: string) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ── HRV Distribution (vertical bell curve) ──────────────────────────────────

function accumulateRrDistribution(samples: TelemetrySample[]) {
  const session = selectedSession();
  const sessionId = session?.sessionId ?? null;
  if (sessionId !== state.rrDistributionPrevSessionId) {
    state.rrDistributionValues = [];
    state.rrDistributionPrevSessionId = sessionId;
  }
  const existing = new Set(state.rrDistributionValues);
  for (const sample of samples) {
    if (sample.rrIntervalsMs) {
      for (const rr of sample.rrIntervalsMs) {
        if (!existing.has(rr)) {
          state.rrDistributionValues.push(rr);
          existing.add(rr);
        }
      }
    } else if (sample.rrLatestMs && !existing.has(sample.rrLatestMs)) {
      state.rrDistributionValues.push(sample.rrLatestMs);
      existing.add(sample.rrLatestMs);
    }
  }
}

function computeRrBins(values: number[], binWidth: number): { center: number; count: number }[] {
  if (values.length === 0) return [];
  const counts = new Map<number, number>();
  for (const v of values) {
    const center = Math.round(v / binWidth) * binWidth;
    counts.set(center, (counts.get(center) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([center, count]) => ({ center, count }))
    .sort((a, b) => a.center - b.center);
}

function computeRrKde(values: number[], nPoints: number): { x: number; y: number }[] {
  if (values.length < 2) return [];
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  const bandwidth = Math.max(5, 1.06 * sd * Math.pow(values.length, -0.2));
  const min = Math.min(...values) - bandwidth * 2;
  const max = Math.max(...values) + bandwidth * 2;
  const step = (max - min) / (nPoints - 1);
  const result: { x: number; y: number }[] = [];
  const inv = 1 / (values.length * bandwidth);
  const sqrt2pi = Math.sqrt(2 * Math.PI);
  for (let i = 0; i < nPoints; i++) {
    const x = min + i * step;
    let density = 0;
    for (const v of values) {
      const u = (x - v) / bandwidth;
      density += Math.exp(-0.5 * u * u) / sqrt2pi;
    }
    result.push({ x, y: density * inv });
  }
  return result;
}

function rrStats(values: number[]) {
  if (values.length === 0) return { mean: null, sdnn: null, rmssd: null };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sdnn = values.length > 1
    ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1))
    : null;
  let rmssd: number | null = null;
  if (values.length > 2) {
    let sumSqDiff = 0;
    for (let i = 1; i < values.length; i++) {
      const diff = values[i]! - values[i - 1]!;
      sumSqDiff += diff * diff;
    }
    rmssd = Math.sqrt(sumSqDiff / (values.length - 1));
  }
  return { mean, sdnn, rmssd };
}

function renderRrDistribution() {
  const svg = document.querySelector<SVGElement>("#rr-distribution-chart");
  const countEl = document.querySelector<HTMLElement>("#rr-dist-count");
  const meanEl = document.querySelector<HTMLElement>("#rr-dist-mean");
  const sdnnEl = document.querySelector<HTMLElement>("#rr-dist-sdnn");
  const rmssdEl = document.querySelector<HTMLElement>("#rr-dist-rmssd");
  if (!svg) return;

  const values = state.rrDistributionValues;
  const n = values.length;
  if (countEl) countEl.textContent = `${n} sample${n !== 1 ? "s" : ""}`;

  const stats = rrStats(values);
  if (meanEl) meanEl.textContent = stats.mean !== null ? `${Math.round(stats.mean)} ms` : "--";
  if (sdnnEl) sdnnEl.textContent = stats.sdnn !== null ? `${stats.sdnn.toFixed(1)} ms` : "--";
  if (rmssdEl) rmssdEl.textContent = stats.rmssd !== null ? `${stats.rmssd.toFixed(1)} ms` : "--";

  if (n === 0) {
    svg.innerHTML = `
      <rect x="0" y="0" width="200" height="480" fill="rgba(255,255,255,0.04)" rx="12"/>
      <text x="100" y="230" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="13" font-weight="600">Waiting for</text>
      <text x="100" y="250" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="13" font-weight="600">RR intervals</text>
    `;
    return;
  }

  // Chart dimensions (vertical: Y = RR value axis, X = density axis)
  const w = 200;
  const h = 480;
  const padTop = 20;
  const padBot = 20;
  const padLeft = 36;
  const padRight = 12;
  const chartH = h - padTop - padBot;
  const chartW = w - padLeft - padRight;

  const minRR = Math.min(...values);
  const maxRR = Math.max(...values);
  const rangeRR = Math.max(1, maxRR - minRR);
  const displayMin = minRR - rangeRR * 0.15;
  const displayMax = maxRR + rangeRR * 0.15;
  const displayRange = displayMax - displayMin;

  // Y maps RR value to vertical position (top = high RR, bottom = low RR)
  const yForRR = (rr: number) => padTop + chartH - ((rr - displayMin) / displayRange) * chartH;

  // Bins (horizontal bars from left axis)
  const binWidth = Math.max(5, Math.round(rangeRR / 25));
  const bins = computeRrBins(values, binWidth);
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  let barsMarkup = "";
  const barThickness = Math.max(2, (binWidth / displayRange) * chartH - 1);
  for (const bin of bins) {
    const cy = yForRR(bin.center);
    const barW = (bin.count / maxCount) * chartW * 0.7;
    barsMarkup += `<rect x="${padLeft}" y="${(cy - barThickness / 2).toFixed(1)}" width="${barW.toFixed(1)}" height="${barThickness.toFixed(1)}" fill="rgba(255,138,76,0.35)" rx="2"/>`;
  }

  // KDE curve (vertical: path goes along Y axis, X = density)
  let kdeMarkup = "";
  let kdeFillMarkup = "";
  const kde = computeRrKde(values, 80);
  if (kde.length > 0) {
    const maxDensity = Math.max(...kde.map((p) => p.y), 1e-10);
    const points = kde.map((p) => ({
      x: padLeft + (p.y / maxDensity) * chartW * 0.85,
      y: yForRR(p.x),
    }));
    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    kdeMarkup = `<path d="${pathD}" fill="none" stroke="#ff8a4c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
    const fillD = `M ${padLeft} ${points[0]!.y.toFixed(1)} ${points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")} L ${padLeft} ${points[points.length - 1]!.y.toFixed(1)} Z`;
    kdeFillMarkup = `<path d="${fillD}" fill="url(#kde-gradient)" opacity="0.25"/>`;
  }

  // Mean line
  let meanMarkup = "";
  if (stats.mean !== null) {
    const meanY = yForRR(stats.mean);
    meanMarkup = `<line x1="${padLeft}" y1="${meanY.toFixed(1)}" x2="${w - padRight}" y2="${meanY.toFixed(1)}" stroke="rgba(255,138,76,0.6)" stroke-dasharray="4 4" stroke-width="1.5"/>`;
  }

  // SDNN bracket
  let sdnnMarkup = "";
  if (stats.mean !== null && stats.sdnn !== null) {
    const upperY = yForRR(stats.mean + stats.sdnn);
    const lowerY = yForRR(stats.mean - stats.sdnn);
    const bracketX = w - padRight - 6;
    sdnnMarkup = `
      <line x1="${bracketX}" y1="${upperY.toFixed(1)}" x2="${bracketX}" y2="${lowerY.toFixed(1)}" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
      <line x1="${bracketX - 3}" y1="${upperY.toFixed(1)}" x2="${bracketX + 3}" y2="${upperY.toFixed(1)}" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
      <line x1="${bracketX - 3}" y1="${lowerY.toFixed(1)}" x2="${bracketX + 3}" y2="${lowerY.toFixed(1)}" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    `;
  }

  // Live RR dot
  const latestRR = values[values.length - 1];
  const liveMarkup = latestRR
    ? `<circle cx="${padLeft + 4}" cy="${yForRR(latestRR).toFixed(1)}" r="4.5" fill="#ff8a4c" class="hrv-live-dot"/>`
    : "";

  // Y-axis tick labels (RR values in ms)
  let tickMarkup = "";
  const tickStep = displayRange < 100 ? 20 : displayRange < 300 ? 50 : 100;
  const firstTick = Math.ceil(displayMin / tickStep) * tickStep;
  for (let rr = firstTick; rr <= displayMax; rr += tickStep) {
    const ty = yForRR(rr);
    tickMarkup += `<text x="${padLeft - 4}" y="${(ty + 4).toFixed(1)}" text-anchor="end" fill="rgba(255,255,255,0.4)" font-size="10" font-family="IBM Plex Mono, monospace">${rr}</text>`;
    tickMarkup += `<line x1="${padLeft - 2}" y1="${ty.toFixed(1)}" x2="${padLeft}" y2="${ty.toFixed(1)}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>`;
  }

  svg.innerHTML = `
    <defs>
      <linearGradient id="kde-gradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ff8a4c" stop-opacity="0"/>
        <stop offset="100%" stop-color="#ff8a4c" stop-opacity="0.6"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(255,255,255,0.03)" rx="12"/>
    <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${h - padBot}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    ${tickMarkup}
    ${barsMarkup}
    ${kdeFillMarkup}
    ${kdeMarkup}
    ${meanMarkup}
    ${sdnnMarkup}
    ${liveMarkup}
  `;
}
