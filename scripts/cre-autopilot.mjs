import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CRE_PROJECT_ROOT = join(ROOT, "cre-workflows");
const CRE_BIN = join(homedir(), ".cre", "bin", "cre");
const BUN_BIN_DIR = join(homedir(), ".bun", "bin");
const RUNNER_SCRIPT = join(ROOT, "scripts", "cre-runner.mjs");
const WORKFLOW_DIR = "./snapshot-publisher";
const target = process.env.CRE_AUTOPILOT_TARGET ?? "staging-settings";
const triggerIndex = process.env.CRE_AUTOPILOT_TRIGGER_INDEX ?? "0";
const pollMs = Number(process.env.CRE_AUTOPILOT_POLL_MS ?? 15000);

function readEnvValue(name) {
  if (process.env[name]) return process.env[name];
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return "";
  const content = readFileSync(envPath, "utf8");
  const line = content
    .split("\n")
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) return "";
  return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, "");
}

function log(event, details = {}) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...details })}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (!existsSync(CRE_BIN)) {
  fail("missing cre cli");
}

const privateKey = readEnvValue("CRE_ETH_PRIVATE_KEY") || readEnvValue("BASE_PRIVATE_KEY");
if (!privateKey) {
  fail("missing CRE_ETH_PRIVATE_KEY/BASE_PRIVATE_KEY");
}

const tempDir = mkdtempSync(join(tmpdir(), "cre-autopilot-"));
const envFile = join(tempDir, "cre.env");
writeFileSync(envFile, `CRE_ETH_PRIVATE_KEY=${privateKey}\n`, "utf8");

const runnerChild = spawn("node", [RUNNER_SCRIPT], {
  cwd: ROOT,
  env: {
    ...process.env,
    CRE_RUNNER_PUBLISH_SNAPSHOT: "false",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

runnerChild.stdout.on("data", (chunk) => process.stdout.write(chunk));
runnerChild.stderr.on("data", (chunk) => process.stderr.write(chunk));

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  runnerChild.kill("SIGTERM");
  rmSync(tempDir, { recursive: true, force: true });
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop();
    process.exit(0);
  });
}

runnerChild.on("exit", (code) => {
  if (!stopping && code !== 0) {
    process.stderr.write(`cre-runner exited ${code}\n`);
    stop();
    process.exit(code ?? 1);
  }
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTxHash(output) {
  const matches = output.match(/0x[a-fA-F0-9]{64}/g);
  if (!matches || matches.length === 0) return "";
  return matches[matches.length - 1];
}

async function simulateOnce() {
  const result = spawnSync(
    CRE_BIN,
    [
      "workflow",
      "simulate",
      WORKFLOW_DIR,
      "-R",
      ".",
      "-T",
      target,
      "-e",
      envFile,
      "--non-interactive",
      "--trigger-index",
      triggerIndex,
      "--broadcast",
    ],
    {
      cwd: CRE_PROJECT_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${BUN_BIN_DIR}:${process.env.PATH ?? ""}`,
      },
    },
  );

  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0) {
    const trimmed = combined.trim().split("\n").slice(-8).join("\n");
    throw new Error(trimmed || "cre simulate failed");
  }

  return extractTxHash(combined);
}

log("cre-autopilot-start", { pollMs, target });

while (!stopping) {
  try {
    const txHash = await simulateOnce();
    log("snapshot-simulated", { txHash });
  } catch (error) {
    log("snapshot-simulate-error", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (stopping) break;
  await sleep(pollMs);
}
