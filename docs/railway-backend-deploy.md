# Railway Backend Deploy

## What Goes Where

- **Vercel**: frontend only
- **Railway**: backend only

The frontend depends on public backend endpoints for:

- faucet
- telemetry sessions
- settlement resolution

## Railway Service

Deploy this same repo to Railway, but treat it as the backend service.

Railway will use:

- [railway.json](/Users/agustinschiariti/Desktop/PreCannes/railway.json)
- `npm run start`
- health check: `/api/health`

## Required Railway Environment Variables

Set these in Railway:

- `PORT`
- `TELEMETRY_API_KEY`
- `BASE_RPC_URL=https://rpc.testnet.arc.network`
- `ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network`
- `COLLATERAL_TOKEN=0x3600000000000000000000000000000000000000`
- `COLLATERAL_SYMBOL=USDC`
- `COLLATERAL_DECIMALS=6`
- `PREDICTION_MARKET=0x86e8A602DB5A6c6cD9c5C5a753195F326BA4C1F3`
- `CHAINLINK_TELEMETRY_FEED=0x060CD06A3035b59E5fB609d64446c26FF2b00300`
- `CRE_TELEMETRY_RECEIVER=0xD05247c2cBE8f38f90ebd85AcECdFF9cce7d16F1`
- `BASE_PRIVATE_KEY=<your Arc Testnet owner key>`
- `FAUCET_CLAIM_AMOUNT=10000000`
- `FAUCET_COOLDOWN_MS=10800000`
- `ENABLE_SERVER_FAUCET=false`
- `TURN_PROVIDER=cloudflare`
- `CLOUDFLARE_TURN_KEY_ID=<if you still need WebRTC/TURN>`
- `CLOUDFLARE_TURN_API_TOKEN=<if you still need WebRTC/TURN>`
- `CLOUDFLARE_TURN_TTL_SECONDS=3600`

## Vercel Frontend Variable

After Railway gives you a public URL like:

`https://your-backend.up.railway.app`

set this in Vercel:

- `VITE_API_BASE_URL=https://your-backend.up.railway.app`

Then redeploy the Vercel frontend.

## Smoke Tests

After Railway deploys, confirm:

```bash
curl https://your-backend.up.railway.app/api/health
```

```bash
curl https://your-backend.up.railway.app/api/faucet
```

```bash
curl https://your-backend.up.railway.app/api/telemetry
```

## Important Limitation

The current backend stores live fallback state in local files under `data/`.

Telemetry itself should be persisted in Supabase. If Railway restarts or the filesystem is reset, file-backed fallback state such as local registry cache can still be lost.
