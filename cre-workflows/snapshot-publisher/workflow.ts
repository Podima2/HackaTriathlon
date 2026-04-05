import {
  bytesToHex,
  ConsensusAggregationByFields,
  type CronPayload,
  cre,
  getNetwork,
  hexToBase64,
  type HTTPSendRequester,
  median,
  type Runtime,
  TxStatus,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters, parseAbiParameters, toHex, type Hex } from 'viem'
import { z } from 'zod'

export const configSchema = z.object({
  schedule: z.string(),
  snapshotUrl: z.string().min(1),
  chainSelectorName: z.string(),
  consumerAddress: z.string(),
  gasLimit: z.string(),
  allowStale: z.boolean().default(false),
})

type Config = z.infer<typeof configSchema>

const SnapshotApiResponseSchema = z.object({
  ok: z.literal(true),
  sessionId: z.string().uuid(),
  sessionIdHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  bucketMs: z.number().int().positive(),
  staleAfterMs: z.number().int().positive(),
  stale: z.boolean(),
  dataAgeMs: z.number().int().nonnegative(),
  snapshot: z.object({
    bucketStartMs: z.number().int().nonnegative(),
    bpm: z.number().int().positive(),
    rrLatestMs: z.number().int().nonnegative().nullable().optional(),
    rrCount: z.number().int().nonnegative().optional(),
    rrIntervalsMs: z.array(z.number()).nullable().optional(),
    rmssd: z.number().nullable().optional(),
    sdnn: z.number().nullable().optional(),
    sampleSeq: z.number().int().nonnegative(),
    sampleElapsedMs: z.number().int().nonnegative(),
    phoneObservedAt: z.string(),
    serverReceivedAt: z.string(),
  }),
})

type SnapshotApiResponse = z.infer<typeof SnapshotApiResponseSchema>

type SnapshotConsensus = {
  sessionIdHashWord: bigint
  bucketStartMs: bigint
  sampleElapsedMs: bigint
  sampleSeq: bigint
  bpm: bigint
  rrLatestMs: bigint
  reportedAtMs: bigint
  rrCount: bigint
  rmssdCentis: bigint
  sdnnCentis: bigint
  staleMarker: bigint
}

const SnapshotReportParams = parseAbiParameters(
  'bytes32 sessionIdHash, uint64 bucketStartMs, uint64 sampleElapsedMs, uint32 sampleSeq, uint32 bpm, uint32 rrLatestMs, uint64 reportedAtMs, uint32 rrCount, uint32 rmssdCentis, uint32 sdnnCentis',
)

const safeJsonStringify = (obj: unknown): string =>
  JSON.stringify(obj, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2)

const fetchSnapshot = (sendRequester: HTTPSendRequester, config: Config): SnapshotConsensus => {
  const response = sendRequester.sendRequest({ method: 'GET', url: config.snapshotUrl }).result()

  if (response.statusCode !== 200) {
    throw new Error(`HTTP request failed with status: ${response.statusCode}`)
  }

  const responseText = Buffer.from(response.body).toString('utf-8')
  const parsed = SnapshotApiResponseSchema.parse(JSON.parse(responseText)) as SnapshotApiResponse

  if (!config.allowStale && parsed.stale) {
    throw new Error(`Snapshot is stale: age=${parsed.dataAgeMs}ms`)
  }

  const reportedAtMs = Date.parse(parsed.snapshot.serverReceivedAt)
  if (!Number.isFinite(reportedAtMs) || reportedAtMs <= 0) {
    throw new Error('Snapshot serverReceivedAt is invalid')
  }

  return {
    sessionIdHashWord: BigInt(parsed.sessionIdHash),
    bucketStartMs: BigInt(parsed.snapshot.bucketStartMs),
    sampleElapsedMs: BigInt(parsed.snapshot.sampleElapsedMs),
    sampleSeq: BigInt(parsed.snapshot.sampleSeq),
    bpm: BigInt(parsed.snapshot.bpm),
    rrLatestMs: BigInt(Math.max(0, Math.round(parsed.snapshot.rrLatestMs ?? parsed.snapshot.rrIntervalsMs?.at(-1) ?? 0))),
    reportedAtMs: BigInt(reportedAtMs),
    rrCount: BigInt(parsed.snapshot.rrCount ?? parsed.snapshot.rrIntervalsMs?.length ?? 0),
    rmssdCentis: BigInt(Math.max(0, Math.round((parsed.snapshot.rmssd ?? 0) * 100))),
    sdnnCentis: BigInt(Math.max(0, Math.round((parsed.snapshot.sdnn ?? 0) * 100))),
    staleMarker: parsed.stale ? 1n : 0n,
  }
}

const readSnapshotFromApi = (runtime: Runtime<Config>): SnapshotConsensus => {
  const httpCapability = new cre.capabilities.HTTPClient()

  return httpCapability
    .sendRequest(
      runtime,
      fetchSnapshot,
      ConsensusAggregationByFields<SnapshotConsensus>({
        sessionIdHashWord: median,
        bucketStartMs: median,
        sampleElapsedMs: median,
        sampleSeq: median,
        bpm: median,
        rrLatestMs: median,
        reportedAtMs: median,
        rrCount: median,
        rmssdCentis: median,
        sdnnCentis: median,
        staleMarker: median,
      }),
    )(runtime.config)
    .result()
}

const publishSnapshot = (runtime: Runtime<Config>): string => {
  const network = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  })

  if (!network) {
    throw new Error(`Network not found for chain selector name: ${runtime.config.chainSelectorName}`)
  }

  const snapshot = readSnapshotFromApi(runtime)
  runtime.log(`Aggregated snapshot: ${safeJsonStringify(snapshot)}`)

  if (!runtime.config.allowStale && snapshot.staleMarker !== 0n) {
    throw new Error('Aggregated snapshot is stale')
  }

  const sessionIdHash = toHex(snapshot.sessionIdHashWord, { size: 32 }) as Hex
  const reportData = encodeAbiParameters(SnapshotReportParams, [
    sessionIdHash,
    snapshot.bucketStartMs,
    snapshot.sampleElapsedMs,
    Number(snapshot.sampleSeq),
    Number(snapshot.bpm),
    Number(snapshot.rrLatestMs),
    snapshot.reportedAtMs,
    Number(snapshot.rrCount),
    Number(snapshot.rmssdCentis),
    Number(snapshot.sdnnCentis),
  ])

  runtime.log(`Encoded snapshot payload for ${sessionIdHash}`)

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    })
    .result()

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.consumerAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result()

  if (writeResult.txStatus === TxStatus.SUCCESS) {
    const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
    runtime.log(`Snapshot publish tx succeeded: ${txHash}`)
    return txHash
  }

  throw new Error(`Snapshot publish failed with status: ${writeResult.txStatus}`)
}

export const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
  if (!payload.scheduledExecutionTime) {
    throw new Error('Scheduled execution time is required')
  }

  runtime.log(`Running snapshot publisher at ${String(payload.scheduledExecutionTime)}`)
  return publishSnapshot(runtime)
}

export function initWorkflow(config: Config) {
  const cronTrigger = new cre.capabilities.CronCapability()

  return [
    cre.handler(
      cronTrigger.trigger({
        schedule: config.schedule,
      }),
      onCronTrigger,
    ),
  ]
}
