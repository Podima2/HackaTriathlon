import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sessionsPath = join(root, "data", "telemetry", "sessions.json");
const samplesPath = join(root, "data", "telemetry", "samples.json");

const [command, sessionPrefix, nextStatus] = process.argv.slice(2);

if (!command || command === "help") {
  printHelp();
  process.exit(0);
}

const sessions = JSON.parse(readFileSync(sessionsPath, "utf8"));
const samples = JSON.parse(readFileSync(samplesPath, "utf8"));

if (command === "list") {
  const rows = Object.values(sessions)
    .map((session) => {
      const sessionSamples = samples[session.sessionId] ?? [];
      return {
        sessionId: session.sessionId,
        status: session.status,
        createdAt: session.createdAt,
        finalizedAt: session.finalizedAt ?? null,
        abandonedAt: session.abandonedAt ?? null,
        sampleCount: sessionSamples.length,
        firstSampleAt: sessionSamples[0]?.phoneObservedAt ?? null,
        lastSampleAt: sessionSamples[sessionSamples.length - 1]?.phoneObservedAt ?? null,
      };
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

if (command === "mark") {
  if (!sessionPrefix || !nextStatus) {
    console.error("Usage: node scripts/telemetry-session-admin.mjs mark <session-prefix> <finalized|abandoned|active>");
    process.exit(1);
  }

  const matches = Object.values(sessions).filter((session) => session.sessionId.startsWith(sessionPrefix));
  if (matches.length !== 1) {
    console.error(`Expected exactly 1 session match for prefix '${sessionPrefix}', found ${matches.length}.`);
    process.exit(1);
  }

  if (!["finalized", "abandoned", "active"].includes(nextStatus)) {
    console.error("Status must be one of: finalized, abandoned, active");
    process.exit(1);
  }

  const target = matches[0];
  target.status = nextStatus;
  if (nextStatus === "finalized") {
    target.finalizedAt = new Date().toISOString();
    delete target.abandonedAt;
  } else if (nextStatus === "abandoned") {
    target.abandonedAt = new Date().toISOString();
    delete target.finalizedAt;
  } else {
    delete target.finalizedAt;
    delete target.abandonedAt;
  }

  writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2));
  console.log(JSON.stringify({
    sessionId: target.sessionId,
    status: target.status,
    finalizedAt: target.finalizedAt ?? null,
    abandonedAt: target.abandonedAt ?? null,
    sampleCount: (samples[target.sessionId] ?? []).length,
  }, null, 2));
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
process.exit(1);

function printHelp() {
  console.log(`Usage:
  node scripts/telemetry-session-admin.mjs list
  node scripts/telemetry-session-admin.mjs mark <session-prefix> <finalized|abandoned|active>`);
}
