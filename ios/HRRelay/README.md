# HR Relay

Native iPhone app for reading BLE heart-rate telemetry and relaying it to a backend with durable local buffering.

## Status

This is the initial scaffold:

- SwiftUI app shell
- CoreBluetooth HR ingestion manager
- file-backed local session/sample persistence
- upload worker with retry loop
- operational screens for pairing, session control, telemetry, and diagnostics

## Generate the Xcode Project

This repo uses `XcodeGen` to avoid committing a large `project.pbxproj`.

1. Install XcodeGen on your Mac:
   - `brew install xcodegen`
2. Generate the project:
   - `cd ios/HRRelay`
   - `xcodegen generate`
3. Open `HRRelay.xcodeproj` in Xcode.

## Run on Your iPhone

1. In Xcode, set your Apple ID signing team for the `HRRelay` target.
2. Connect your iPhone.
3. Select your device and run.
4. With free provisioning, the install is valid for personal testing and expires after 7 days.

## Backend Configuration

Set these keys in `Config/Info.plist` or directly in Xcode:

- `HRRelayAPIBaseURL`
- `HRRelayAPIKey`

Example:

- `HRRelayAPIBaseURL = https://your-host.example.com/api/telemetry`
- `HRRelayAPIKey = your-shared-secret`

If no base URL is set, the app falls back to mock mode.

For LAN testing against your Mac, you can also use:

- `HRRelayAPIBaseURL = http://<YOUR_MAC_LAN_IP>:8787/api/telemetry`

## Notes

- The persistence layer is file-backed for now to keep the first build self-contained.
- The next hardening step is swapping the sample store to SQLite.
- Background BLE behavior still needs device testing with the Decathlon belt and DJI Mimo active.
