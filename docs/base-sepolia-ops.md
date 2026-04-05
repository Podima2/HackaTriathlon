# Arc Testnet Ops

## Current Arc Contracts

- Chain: `Arc Testnet`
- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Gas token: native `USDC`
- Collateral token: `USDC` at `0x3600000000000000000000000000000000000000`
- `PredictionMarket`: `0x86e8A602DB5A6c6cD9c5C5a753195F326BA4C1F3`
- `ChainlinkTelemetryFeed`: `0x060CD06A3035b59E5fB609d64446c26FF2b00300`
- `CRETelemetryReceiver`: `0xD05247c2cBE8f38f90ebd85AcECdFF9cce7d16F1`
- Settlement operator: `0x8B6E5E7D4116f766BF1BE714FCc8bcAfA23D32D2`

## Get Test USDC

- Circle faucet: `https://faucet.circle.com/`
- Select `Arc Testnet`

## Approve Market Contract

```bash
PRIVATE_KEY=... \
COLLATERAL_TOKEN=0x3600000000000000000000000000000000000000 \
SPENDER=0x86e8A602DB5A6c6cD9c5C5a753195F326BA4C1F3 \
AMOUNT=10000000 \
~/.foundry/bin/forge script script/ApproveHacktri.s.sol:ApproveHacktriScript \
  --rpc-url arc_testnet \
  --broadcast
```

## Create Live Threshold Market

```bash
PRIVATE_KEY=... \
PREDICTION_MARKET=0x86e8A602DB5A6c6cD9c5C5a753195F326BA4C1F3 \
SESSION_ID_HASH=<cast keccak session-id> \
TARGET_ELAPSED_MS=<t> \
TRADING_CLOSES_AT_MS=<close> \
THRESHOLD_VALUE=<value> \
THRESHOLD_DIRECTION=<0 for over, 1 for under> \
SIGNAL_TYPE=<0 hr, 1 rmssd, 2 sdnn, 7 rr-interval> \
SEED_LIQUIDITY=1000000 \
~/.foundry/bin/forge script script/CreateThresholdMarket.s.sol:CreateThresholdMarketScript \
  --rpc-url arc_testnet \
  --broadcast
```

## Finalize Market

```bash
PRIVATE_KEY=... \
PREDICTION_MARKET=0x86e8A602DB5A6c6cD9c5C5a753195F326BA4C1F3 \
MARKET_ID=<id> \
BOOLEAN_OUTCOME=true \
OBSERVED_VALUE=<value> \
SAMPLE_SEQ=<seq> \
SAMPLE_ELAPSED_MS=<elapsed-ms> \
~/.foundry/bin/forge script script/FinalizeThresholdMarket.s.sol:FinalizeThresholdMarketScript \
  --rpc-url arc_testnet \
  --broadcast
```

## Claim

```bash
PRIVATE_KEY=... \
PREDICTION_MARKET=0x86e8A602DB5A6c6cD9c5C5a753195F326BA4C1F3 \
MARKET_ID=<id> \
~/.foundry/bin/forge script script/ClaimMarket.s.sol:ClaimMarketScript \
  --rpc-url arc_testnet \
  --broadcast
```

## Deploy Telemetry Contracts

```bash
PRIVATE_KEY=... \
CHAINLINK_TELEMETRY_REPORTER=0x8B6E5E7D4116f766BF1BE714FCc8bcAfA23D32D2 \
~/.foundry/bin/forge script script/DeployChainlinkTelemetryFeed.s.sol:DeployChainlinkTelemetryFeedScript \
  --rpc-url arc_testnet \
  --broadcast \
  --with-gas-price 200000000000
```

```bash
PRIVATE_KEY=... \
CRE_TELEMETRY_OWNER=0x8B6E5E7D4116f766BF1BE714FCc8bcAfA23D32D2 \
CRE_TELEMETRY_FORWARDER=0x0000000000000000000000000000000000000000 \
~/.foundry/bin/forge script script/DeployCRETelemetryReceiver.s.sol:DeployCRETelemetryReceiverScript \
  --rpc-url arc_testnet \
  --broadcast \
  --skip-simulation \
  --with-gas-price 220000000000
```

## CRE Simulation

From [cre-workflows](/Users/agustinschiariti/Desktop/PreCannes/cre-workflows):

```bash
PATH="$HOME/.bun/bin:$PATH" ~/.cre/bin/cre workflow simulate ./snapshot-publisher \
  -R . \
  -T staging-settings \
  -e /tmp/cre-sim.env \
  --non-interactive \
  --trigger-index 0 \
  --broadcast
```

## Local CRE Automation

```bash
npm run cre:runner
```

```bash
npm run cre:autopilot
```
