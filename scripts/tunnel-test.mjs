import { spawn } from "node:child_process";

const cwd = process.cwd();
const serverPort = process.env.PORT ?? "8787";
const serverUrl = `http://127.0.0.1:${serverPort}`;

let shuttingDown = false;
let serverReady = false;
let tunnelReady = false;

const server = spawn("npm", ["run", "serve:single"], {
  cwd,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

let tunnel;

server.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(`[server] ${text}`);

  if (!serverReady && text.includes(`PreCannes signaling server listening on http://localhost:${serverPort}`)) {
    serverReady = true;
    startTunnel();
  }
});

server.stderr.on("data", (chunk) => {
  process.stderr.write(`[server] ${chunk.toString()}`);
});

server.on("exit", (code) => {
  if (!shuttingDown) {
    console.error(`[tunnel-test] server exited unexpectedly with code ${code}`);
    shutdown(code ?? 1);
  }
});

function startTunnel() {
  console.log(`[tunnel-test] server is ready at ${serverUrl}`);

  tunnel = spawn("cloudflared", ["tunnel", "--url", serverUrl], {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const onTunnelData = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`[cloudflared] ${text}`);

    if (tunnelReady) {
      return;
    }

    const match = text.match(/https:\/\/[a-z0-9.-]+\.trycloudflare\.com/iu);
    if (!match) {
      return;
    }

    tunnelReady = true;
    const baseUrl = match[0];
    console.log("");
    console.log("[tunnel-test] Copy these URLs:");
    console.log(`${baseUrl}/laptop`);
    console.log(`${baseUrl}/phone`);
    console.log("");
  };

  tunnel.stdout.on("data", onTunnelData);
  tunnel.stderr.on("data", onTunnelData);

  tunnel.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[tunnel-test] cloudflared exited unexpectedly with code ${code}`);
      shutdown(code ?? 1);
    }
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (tunnel && !tunnel.killed) {
    tunnel.kill("SIGTERM");
  }

  if (!server.killed) {
    server.kill("SIGTERM");
  }

  setTimeout(() => process.exit(exitCode), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
