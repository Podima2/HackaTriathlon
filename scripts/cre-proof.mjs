import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, http } from 'viem'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CRE_PROJECT_ROOT = join(ROOT, 'cre-workflows')
const WORKFLOW_DIR = './snapshot-publisher'
const CRE_BIN = join(homedir(), '.cre', 'bin', 'cre')
const BUN_BIN_DIR = join(homedir(), '.bun', 'bin')
const RECEIVER = readEnvValue('CRE_TELEMETRY_RECEIVER') || readEnvValue('VITE_CRE_TELEMETRY_RECEIVER') || '0xD05247c2cBE8f38f90ebd85AcECdFF9cce7d16F1'
const RPC_URL = readEnvValue('ARC_TESTNET_RPC_URL') || readEnvValue('BASE_RPC_URL') || 'https://rpc.testnet.arc.network'
const SNAPSHOT_URL =
  'https://hackatriathlon-production.up.railway.app/api/cre/sessions/current/latest-snapshot?bucketMs=5000&staleAfterMs=10000'

const RECEIVER_ABI = [
  {
    inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    name: 'latestSnapshots',
    outputs: [
      { internalType: 'bool', name: 'exists', type: 'bool' },
      { internalType: 'uint64', name: 'bucketStartMs', type: 'uint64' },
      { internalType: 'uint64', name: 'sampleElapsedMs', type: 'uint64' },
      { internalType: 'uint64', name: 'reportedAt', type: 'uint64' },
      { internalType: 'uint32', name: 'sampleSeq', type: 'uint32' },
      { internalType: 'uint32', name: 'bpm', type: 'uint32' },
      { internalType: 'uint32', name: 'rrLatestMs', type: 'uint32' },
      { internalType: 'uint32', name: 'rrCount', type: 'uint32' },
      { internalType: 'uint32', name: 'rmssdCentis', type: 'uint32' },
      { internalType: 'uint32', name: 'sdnnCentis', type: 'uint32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
]

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function readEnvValue(name) {
  if (process.env[name]) return process.env[name]

  const envPath = join(ROOT, '.env.local')
  if (!existsSync(envPath)) return ''
  const content = readFileSync(envPath, 'utf8')
  const line = content
    .split('\n')
    .find((entry) => entry.startsWith(`${name}=`))

  if (!line) return ''
  return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '')
}

function extractTxHash(output) {
  const matches = output.match(/0x[a-fA-F0-9]{64}/g)
  if (!matches || matches.length === 0) return ''
  return matches[matches.length - 1]
}

async function main() {
  const privateKey = readEnvValue('CRE_ETH_PRIVATE_KEY') || readEnvValue('BASE_PRIVATE_KEY')
  if (!privateKey) fail('missing private key')
  if (!existsSync(CRE_BIN)) fail('missing cre cli')

  const snapshotResponse = await fetch(SNAPSHOT_URL)
  if (!snapshotResponse.ok) fail(`snapshot http ${snapshotResponse.status}`)
  const snapshotJson = await snapshotResponse.json()
  if (!snapshotJson?.ok || !snapshotJson?.sessionIdHash || !snapshotJson?.snapshot) {
    fail('snapshot payload invalid')
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'cre-proof-'))
  const envFile = join(tempDir, 'cre.env')
  writeFileSync(envFile, `CRE_ETH_PRIVATE_KEY=${privateKey}\n`, 'utf8')

  const run = spawnSync(
    CRE_BIN,
    [
      'workflow',
      'simulate',
      WORKFLOW_DIR,
      '-R',
      '.',
      '-T',
      'staging-settings',
      '-e',
      envFile,
      '--non-interactive',
      '--trigger-index',
      '0',
      '--broadcast',
    ],
    {
      cwd: CRE_PROJECT_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${BUN_BIN_DIR}:${process.env.PATH ?? ''}`,
      },
    },
  )

  rmSync(tempDir, { recursive: true, force: true })

  const combinedOutput = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
  if (run.status !== 0) {
    const trimmed = combinedOutput.trim().split('\n').slice(-8).join('\n')
    fail(trimmed || 'simulation failed')
  }

  const txHash = extractTxHash(combinedOutput)
  if (!txHash) fail('missing tx hash')

  const client = createPublicClient({
    transport: http(RPC_URL),
  })

  const [exists, bucketStartMs, sampleElapsedMs, reportedAt, sampleSeq, bpm, rrLatestMs, rrCount, rmssdCentis, sdnnCentis] =
    await client.readContract({
      address: RECEIVER,
      abi: RECEIVER_ABI,
      functionName: 'latestSnapshots',
      args: [snapshotJson.sessionIdHash],
    })

  process.stdout.write(`workflow snapshot-publisher\n`)
  process.stdout.write(`receiver ${RECEIVER}\n`)
  process.stdout.write(`tx ${txHash}\n`)
  process.stdout.write(`session ${snapshotJson.sessionId}\n`)
  process.stdout.write(`hash ${snapshotJson.sessionIdHash}\n`)
  process.stdout.write(
    `api bpm=${snapshotJson.snapshot.bpm} rrMs=${snapshotJson.snapshot.rrLatestMs ?? 0} rr=${snapshotJson.snapshot.rrCount ?? 0} rmssd=${snapshotJson.snapshot.rmssd ?? 0} sdnn=${snapshotJson.snapshot.sdnn ?? 0} seq=${snapshotJson.snapshot.sampleSeq} elapsed=${snapshotJson.snapshot.sampleElapsedMs} stale=${snapshotJson.stale}\n`,
  )
  process.stdout.write(
    `chain ok=${exists} bpm=${bpm} rrMs=${rrLatestMs} rr=${rrCount} rmssd=${Number(rmssdCentis) / 100} sdnn=${Number(sdnnCentis) / 100} seq=${sampleSeq} elapsed=${sampleElapsedMs} bucket=${bucketStartMs} reportedAt=${reportedAt}\n`,
  )
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
