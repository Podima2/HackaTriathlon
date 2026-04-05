#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
SERVER_LOG="$RUNTIME_DIR/server.log"
TUNNEL_LOG="$RUNTIME_DIR/tunnel.log"
SERVER_PID_FILE="$RUNTIME_DIR/server.pid"
TUNNEL_PID_FILE="$RUNTIME_DIR/tunnel.pid"
PLIST_PATH="$ROOT_DIR/ios/HRRelay/Config/Info.plist"
PROJECT_PATH="$ROOT_DIR/ios/HRRelay/HRRelay.xcodeproj"
SCHEME="HRRelay"
SERVER_URL="http://localhost:8787"
API_SUFFIX="/api/telemetry"

BUILD_MODE="${BUILD_MODE:-build}"
IOS_DESTINATION="${IOS_DESTINATION:-generic/platform=iOS}"
BUILD_CONFIGURATION="${BUILD_CONFIGURATION:-Debug}"
SKIP_BUILD="${SKIP_BUILD:-0}"

mkdir -p "$RUNTIME_DIR"

cleanup_existing() {
  for pid_file in "$SERVER_PID_FILE" "$TUNNEL_PID_FILE"; do
    if [[ -f "$pid_file" ]]; then
      local pid
      pid="$(cat "$pid_file")"
      if kill -0 "$pid" >/dev/null 2>&1; then
        kill "$pid" >/dev/null 2>&1 || true
        sleep 1
      fi
      rm -f "$pid_file"
    fi
  done
}

start_server() {
  : > "$SERVER_LOG"
  (
    cd "$ROOT_DIR"
    npm run server:start
  ) >"$SERVER_LOG" 2>&1 &
  echo $! > "$SERVER_PID_FILE"
}

wait_for_server() {
  local attempts=0
  until curl -s "$SERVER_URL/api/health" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if (( attempts > 30 )); then
      echo "Server failed to start. Check $SERVER_LOG"
      exit 1
    fi
    sleep 1
  done
}

start_tunnel() {
  : > "$TUNNEL_LOG"
  cloudflared tunnel --url "$SERVER_URL" >"$TUNNEL_LOG" 2>&1 &
  echo $! > "$TUNNEL_PID_FILE"
}

extract_tunnel_url() {
  local attempts=0
  local tunnel_url=""
  until [[ -n "$tunnel_url" ]]; do
    attempts=$((attempts + 1))
    tunnel_url="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | tail -n 1 || true)"
    if (( attempts > 60 )); then
      echo "Tunnel URL not found. Check $TUNNEL_LOG"
      exit 1
    fi
    sleep 1
  done
  echo "$tunnel_url"
}

update_plist_backend() {
  local api_url="$1$API_SUFFIX"
  /usr/libexec/PlistBuddy -c "Set :HRRelayAPIBaseURL $api_url" "$PLIST_PATH"
}

run_build() {
  if [[ "$SKIP_BUILD" == "1" ]]; then
    return
  fi

  xcodebuild \
    -project "$PROJECT_PATH" \
    -scheme "$SCHEME" \
    -configuration "$BUILD_CONFIGURATION" \
    -destination "$IOS_DESTINATION" \
    "$BUILD_MODE"
}

cleanup_existing
start_server
wait_for_server
start_tunnel
TUNNEL_URL="$(extract_tunnel_url)"
update_plist_backend "$TUNNEL_URL"
run_build

echo ""
echo "Live stack ready"
echo "Server log: $SERVER_LOG"
echo "Tunnel log: $TUNNEL_LOG"
echo "Tunnel URL: $TUNNEL_URL"
echo "App backend URL: ${TUNNEL_URL}${API_SUFFIX}"
echo ""
echo "If you want device install/run from CLI, export IOS_DESTINATION='id=<YOUR_DEVICE_ID>' and optionally BUILD_MODE=run."
