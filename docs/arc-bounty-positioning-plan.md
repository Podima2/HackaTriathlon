# Arc Bounty Positioning Plan

## What We're Competing For

**"Best Prediction Markets Built on Arc with Real-World Signal"** — $3,000 bounty.

Judged on:
1. Functional MVP with architecture diagram
2. Video demonstration + presentation
3. Effective use of Circle's developer tools/tech
4. GitHub repo

---

## Our Angle

**"Biometric prediction markets settled by live physiological and motion telemetry from wearable sensors."**

Why this wins:
- Not another election/macro market clone
- End-to-end data pipeline already built: BLE sensor → iPhone → backend → smart contract settlement
- Real-world signal is the literal requirement — we have it from a chest strap and phone sensors
- Demo-able live: strap on a heart rate belt, start a run, watch markets resolve
- USDC-native collateral on Arc = zero crypto friction for participants

---

## Arc Testnet Details (from docs)

| Parameter | Value |
|-----------|-------|
| Chain ID | `5042002` |
| RPC URL | `https://rpc.testnet.arc.network` |
| WebSocket | `wss://rpc.testnet.arc.network` |
| Block Explorer | `https://testnet.arcscan.app` |
| Native currency | USDC (18 decimals as native gas, 6 decimals as ERC-20) |
| USDC address | `0x3600000000000000000000000000000000000000` |
| EURC address | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Faucet | `https://faucet.circle.com` (select "Arc Testnet") |
| Min base fee | ~160 Gwei (targets ~$0.01/tx) |
| Finality | Deterministic, sub-second |
| Solidity compat | Standard EVM, ^0.8.24 works fine |

### EVM Gotchas on Arc

- Block timestamps can be identical across multiple blocks — don't assume strict ordering
- `PREV_RANDAO` always returns 0 — no on-chain randomness (not needed for us)
- USDC blocklist is enforced pre-mempool — wallets must not be blocklisted
- Set `maxFeePerGas >= 160 Gwei` or transactions may hang

---

## What Needs to Change

### 1. Deploy to Arc Testnet

**Effort: Low**

| File | Change |
|------|--------|
| `foundry.toml` | Add `arc_testnet = "https://rpc.testnet.arc.network"` under `[rpc_endpoints]` |
| `src/server/index.ts` | Replace `baseSepoliaChain` with Arc chain config: id `5042002`, name `"Arc Testnet"`, currency `{ name: "USDC", symbol: "USDC", decimals: 18 }`, RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app` |
| `src/client/main.ts` | Replace `baseSepolia` import. Update `CHAIN_ID` default to `5042002`, `CHAIN_NAME` to `"Arc Testnet"`, `RPC_URL` to `https://rpc.testnet.arc.network` |
| All Foundry scripts in `script/` | Use `--rpc-url arc_testnet` |
| `.env` / env vars | Update RPC URL, update contract addresses after deploy |

### 2. Replace HacktriToken with USDC as Collateral

**Effort: Medium**

The `PredictionMarket.sol` constructor already accepts any ERC20 as `collateralToken`. Deploy it pointing at USDC on Arc (`0x3600000000000000000000000000000000000000`) instead of HacktriToken.

**Critical: USDC ERC-20 interface uses 6 decimals on Arc** (even though native balances are 18 decimals). This means:

| Area | Change |
|------|--------|
| Contract deployment | `collateralToken_ = 0x3600000000000000000000000000000000000000` — no HacktriToken deploy |
| Server `parseUnits`/`formatUnits` | All calls change from 18 decimals to 6. Example: `parseUnits("1000", 18)` → `parseUnits("10", 6)` |
| Client `parseUnits`/`formatUnits` | Same — audit every instance in `main.ts` |
| Server faucet | Remove the HacktriToken mint faucet. Users get testnet USDC from `https://faucet.circle.com` instead. Optionally keep a simplified "fund wallet" flow that transfers server-held USDC. |
| Seed liquidity amounts | Adjust for 6-decimal USDC — current defaults assume 18 decimals |
| Server ABI references | Replace `hacktriTokenAbi` with standard ERC20 ABI (same functions, just point at USDC address) |
| Client `TOKEN_ADDRESS` | `0x3600000000000000000000000000000000000000` |

The contract itself is decimal-agnostic (raw uint256 math) — no Solidity changes needed for this.

### 3. Generalize Contract for Multi-Signal Markets

**Effort: Medium**

Currently field names are HR-specific (`thresholdBpm`, `observedBpm`). The actual logic is already generic — it compares a threshold to an observed value.

Changes to `PredictionMarket.sol`:

- Rename `thresholdBpm` → `thresholdValue` (uint32 → uint64 to handle step counts)
- Rename `observedBpm` → `observedValue`
- Add `uint8 signalType` to `Market` struct (0=HR, 1=RMSSD, 2=SDNN, 3=Steps, 4=Cadence, 5=Pace, 6=Distance)
- Add `signalType` to `MarketCreated` and `MarketSettled` events
- Update `createThresholdMarket` to accept `signalType`
- Update `fulfillSettlement` to accept `observedValue` (renamed from `observedBpm`)
- Update `settlementSpec` view

No logic changes needed — the over/under comparison works for any numeric signal.

### 4. Backend Multi-Signal Settlement

**Effort: Medium**

Changes to `src/server/index.ts`:

- Add `/api/upload-motion` endpoint (pairs with iOS telemetry plan)
- Store motion samples alongside HR samples in telemetry store
- Settlement endpoint gains `signalType` parameter
- For each signal type, query the appropriate field from samples:
  - `hr` → `bpm`
  - `hrv_rmssd` → `rmssd`
  - `hrv_sdnn` → `sdnn`
  - `steps` → `steps`
  - `cadence` → `currentCadenceStepsPerSec`
  - `pace` → `currentPaceSecPerMeter`
- Same resolution logic (nearest sample to target time, threshold comparison) regardless of signal

### 5. Frontend Multi-Signal Display

**Effort: Medium-High**

Changes to `src/client/main.ts`:

- Signal type dropdown in market creation (HR, RMSSD, Steps, Cadence, Pace)
- Live telemetry dashboard showing all active signals for the session
- Market cards display signal type + threshold in human terms ("Steps over 500 in 5 min", "RMSSD below 40ms at t=120s")
- USDC amounts displayed with 6 decimal formatting
- MetaMask prompts users to add Arc Testnet (chain ID 5042002)

### 6. Deliverables

**Architecture diagram:**

```
┌──────────────┐     BLE      ┌──────────────────┐
│  HR Belt     │─────────────→│  iPhone           │
│  (Polar/etc) │              │  HRRelay App      │
└──────────────┘              │  - HR + RR        │
                              │  - Pedometer      │
                              │  - Steps/Cadence  │
                              └────────┬─────────┘
                                       │ HTTPS upload
                                       ▼
                              ┌──────────────────┐
                              │  Backend Server   │
                              │  - Telemetry store│
                              │  - Settlement     │
                              │    resolution     │
                              └────────┬─────────┘
                                       │ viem / forge
                                       ▼
                              ┌──────────────────┐
                              │  Arc Blockchain   │
                              │  Chain ID: 5042002│
                              │  Gas: USDC        │
                              │  Finality: <1s    │
                              │                   │
                              │  PredictionMarket │
                              │  .sol (USDC       │
                              │   collateral)     │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │  Frontend         │
                              │  - Live telemetry │
                              │  - Market trading │
                              │  - USDC balances  │
                              └──────────────────┘
```

**Video demo script:**
1. Show iPhone app connecting to heart rate belt
2. Show live dashboard: HR, HRV, steps streaming in real-time
3. Create a market ("HR over 150 in 2 min") — collateral in USDC on Arc
4. Take a YES position — gas paid in USDC, sub-second confirmation
5. Athlete starts running — HR climbing on dashboard
6. Market closes, settlement auto-resolves from live telemetry
7. Claim winnings in USDC
8. Callout: all gas in USDC, no ETH needed, deterministic finality

---

## Implementation Order

### Phase 1: Arc chain swap
1. Update `foundry.toml` with Arc testnet RPC
2. Update server + client chain definitions (chain ID 5042002, USDC native currency)
3. Get testnet USDC from Circle faucet
4. Deploy existing `PredictionMarket.sol` with USDC (`0x360...`) as collateral
5. Fix all decimal handling (18 → 6 for ERC-20 USDC amounts)
6. Set `maxFeePerGas >= 160 Gwei` in server transaction config
7. Verify basic create/trade/settle flow on Arc

### Phase 2: Generalize contract
1. Rename BPM-specific fields to generic signal fields
2. Add `signalType` to Market struct + events
3. Redeploy to Arc

### Phase 3: Backend multi-signal
1. Motion telemetry upload endpoint
2. Signal-type-aware settlement resolution
3. Store + query motion samples

### Phase 4: Frontend
1. Multi-signal market creation UI
2. Live telemetry dashboard
3. USDC formatting (6 decimals)
4. Arc network auto-add for MetaMask

### Phase 5: Deliverables
1. Architecture diagram (clean up the ASCII above into Mermaid or SVG)
2. Record video demo
3. README for bounty submission format

---

## Bounty Qualification Checklist

| Requirement | Status | Covered By |
|-------------|--------|------------|
| Functional MVP (frontend + backend) | Partial — backend + contracts exist, frontend needs polish | Phase 1 + 4 |
| Architecture diagram | Not yet | Phase 5 |
| Video demonstration | Not yet | Phase 5 |
| Effective use of Circle tools | Not yet — currently Base Sepolia + custom token | Phase 1 (Arc + USDC + faucet) |
| GitHub repo | Exists | Clean up in Phase 5 |

---

## Circle Tools We're Using (for submission narrative)

1. **Arc Testnet** — EVM-compatible L1 with USDC-native gas
2. **USDC as collateral** — prediction market positions denominated in USDC
3. **USDC as gas** — all transactions pay fees in USDC, no ETH needed
4. **Circle Faucet** — testnet USDC distribution
5. **Deterministic finality** — market settlement confirmed in <1 second
6. **EURC potential** — architecture supports multi-currency markets (EURC collateral for EU-facing markets) — mention as future work even if not implemented
