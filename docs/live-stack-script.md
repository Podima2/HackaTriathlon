# Live Stack Script

## Purpose

`scripts/live-stack.sh` automates the repetitive local loop:

1. restart the Node backend
2. create a fresh Cloudflare quick tunnel
3. patch the iPhone app `Info.plist` with the new tunnel URL
4. optionally run an Xcode build

## Default Usage

```bash
./scripts/live-stack.sh
```

Defaults:

- restarts backend on `localhost:8787`
- starts a fresh quick tunnel
- updates `ios/HRRelay/Config/Info.plist`
- runs `xcodebuild ... build` for `HRRelay`

## Optional Device Build / Run

Build for a specific device:

```bash
IOS_DESTINATION="id=<YOUR_DEVICE_ID>" ./scripts/live-stack.sh
```

Run/install on a connected device:

```bash
BUILD_MODE=run IOS_DESTINATION="id=<YOUR_DEVICE_ID>" ./scripts/live-stack.sh
```

Skip the Xcode build entirely:

```bash
SKIP_BUILD=1 ./scripts/live-stack.sh
```

## Outputs

The script prints:

- backend health readiness
- the new `trycloudflare.com` URL
- the exact app backend URL written into `Info.plist`

Logs are written to:

- `.runtime/server.log`
- `.runtime/tunnel.log`

## Notes

- Quick tunnel URLs are temporary and rotate when the tunnel restarts.
- The script intentionally updates the app config each time to match that reality.
- For a stable hostname, move later to a named Cloudflare Tunnel.
