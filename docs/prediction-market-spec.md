# Prediction Market MVP Spec

## Scope

Deterministic heart-rate markets settled from backend telemetry using `elapsedMsSinceSessionStart`.

## Canonical Time Reference

- All market times are elapsed milliseconds since session start.
- UTC timestamps remain in backend records for audit only.
- Onchain market parameters must not use local wall-clock time.

## Supported Market Types

### 1. Exact heart rate at `t`

- Market type: `ExactHeartRate`
- Settlement endpoint: `marketType=exact&t=<elapsedMs>`
- Resolution rule: nearest sample to `t`
- Tie-break: earlier sample wins
- Settlement payload should include:
  - observed BPM
  - sample sequence
  - sample elapsed time
  - distance from target `t`

### 2. Threshold heart rate at `t`

- Market type: `ThresholdHeartRate`
- Settlement endpoint: `marketType=threshold&t=<elapsedMs>&threshold=<bpm>&direction=over|under`
- Resolution rule: nearest sample to `t`
- Tie-break: earlier sample wins
- Comparison rules:
  - `over` means `observedBpm > threshold`
  - `under` means `observedBpm < threshold`
- Binary outcome:
  - `true` means YES wins
  - `false` means NO wins

### 3. Interval average heart rate between `t1` and `t2`

- Market type: `IntervalAverageHeartRate`
- Settlement endpoint: `marketType=interval_avg&t1=<elapsedMs>&t2=<elapsedMs>`
- Trading closes before `t1`
- Window is inclusive: `[t1, t2]`

### 4. Interval max heart rate between `t1` and `t2`

- Market type: `IntervalMaxHeartRate`
- Settlement endpoint: `marketType=interval_max&t1=<elapsedMs>&t2=<elapsedMs>`
- Trading closes before `t1`
- Window is inclusive: `[t1, t2]`

### 5. Interval min heart rate between `t1` and `t2`

- Market type: `IntervalMinHeartRate`
- Settlement endpoint: `marketType=interval_min&t1=<elapsedMs>&t2=<elapsedMs>`
- Trading closes before `t1`
- Window is inclusive: `[t1, t2]`

## Suggested Onchain MVP

The first onchain payout flow should prioritize binary threshold markets because payout logic is much simpler.

### MVP Binary Flow

1. Create threshold market
2. Users buy YES or NO
3. Market closes
4. Anyone requests settlement
5. Offchain settlement service resolves `true` or `false`
6. Contract stores:
   - boolean outcome
   - observed BPM
   - sample sequence
   - sample elapsed time
7. Winners claim

## AMM Choice For MVP

Use a simple binary AMM for threshold markets only.

- creator seeds testnet liquidity
- users buy YES or NO outcome shares
- displayed odds come from pool ratio
- settlement picks YES or NO winner
- winners claim from the combined collateral pool

This is a pragmatic hackathon compromise:

- fast to understand
- easy to visualize in the UI
- fits your creator-challenge idea
- avoids the unresolved payout design for raw numeric predictions

## Suggested Deferred Work

Numeric markets such as exact/avg/max/min should initially ship as:

- informational settlement output
- offchain ranking / UI display

If you want onchain payouts for numeric markets, decide one of these mechanisms:

- closest-to-value wins
- bracketed ranges
- scalar market with LMSR-style buckets

That is a separate market-design problem and should not block the first binary deterministic market launch.

## Contract Notes

The Solidity skeleton in `contracts/PredictionMarket.sol` currently supports:

- threshold market creation
- liquidity seeding
- buying YES / NO shares
- close
- settlement request
- settlement fulfillment
- claim

It is still an MVP skeleton, not production-grade market microstructure.

Important gaps before deployment:

- audited ERC20 collateral integration
- access control on settlement fulfillment
- fee model
- liquidity provider accounting
- slippage limits
- reentrancy protection
- tests

The current scaffold now includes:

- `HacktriToken.sol`
- ERC20 collateral transfers inside `PredictionMarket.sol`
- a Foundry deployment script
- a Foundry lifecycle test

It is still MVP-grade code and needs hardening before real deployment.

## Polygon Amoy Deployment Inputs

- Network: `Polygon Amoy`
- RPC: `https://rpc-amoy.polygon.technology/`
- Mock collateral token: `HACKTRI`
- Settlement operator:
  `0x449CCED8EC3a7bf4ec6E763d55c1857a3f63239d`

## Oracle / CRE Mapping

For a threshold market:

1. Read market parameters from contract
2. Map `sessionIdHash` to offchain session ID
3. Call settlement endpoint
4. Submit:
   - boolean outcome
   - observed BPM as numeric value
   - sample sequence
   - sample elapsed time

For numeric markets:

- same oracle flow
- payout semantics remain a product decision
