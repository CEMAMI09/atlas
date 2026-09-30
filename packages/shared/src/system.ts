import { z } from 'zod'
import { IsoDateTime } from './common'
import { IntegrationState } from './integrations'

export const HealthState = z.enum(['healthy', 'degraded', 'unhealthy', 'unknown', 'disabled'])
export type HealthState = z.infer<typeof HealthState>

export const ServiceHealth = z.object({
  id: z.string(),
  name: z.string(),
  state: HealthState,
  detail: z.string().nullable(),
  latencyMs: z.number().nullable(),
  checkedAt: IsoDateTime.nullable(),
})
export type ServiceHealth = z.infer<typeof ServiceHealth>

export const ProcessMetrics = z.object({
  service: z.enum(['api', 'worker']),
  pid: z.number().int(),
  uptimeSeconds: z.number(),
  rssBytes: z.number(),
  heapUsedBytes: z.number(),
  version: z.string(),
  heartbeatAt: IsoDateTime,
  stale: z.boolean(),
})
export type ProcessMetrics = z.infer<typeof ProcessMetrics>

export const HostMetrics = z.object({
  hostname: z.string(),
  platform: z.string(),
  cpuCount: z.number().int(),
  loadAverage: z.array(z.number()).length(3),
  cpuPercent: z.number().nullable(),
  memoryTotalBytes: z.number(),
  memoryUsedBytes: z.number(),
  uptimeSeconds: z.number(),
  disk: z
    .object({
      path: z.string(),
      totalBytes: z.number(),
      freeBytes: z.number(),
    })
    .nullable(),
})
export type HostMetrics = z.infer<typeof HostMetrics>

export const MetricSample = z.object({
  t: z.number(),
  cpu: z.number().nullable(),
  mem: z.number().nullable(),
})
export type MetricSample = z.infer<typeof MetricSample>

export const SystemStatus = z.object({
  overall: HealthState,
  version: z.string(),
  environment: z.enum(['development', 'production', 'test']),
  mockMode: z.boolean(),
  database: z.object({
    state: HealthState,
    engine: z.enum(['postgres', 'pglite', 'unknown']),
    version: z.string().nullable(),
    sizeBytes: z.number().nullable(),
    pgvector: z.boolean(),
    latencyMs: z.number().nullable(),
  }),
  services: z.array(ServiceHealth),
  processes: z.array(ProcessMetrics),
  host: HostMetrics,
  realtime: z.object({ clients: z.number().int(), transport: z.enum(['notify', 'poll', 'hybrid']) }),
  integrations: z.array(z.object({ id: z.string(), name: z.string(), state: IntegrationState })),
  lastBackupAt: IsoDateTime.nullable(),
  startedAt: IsoDateTime,
  generatedAt: IsoDateTime,
})
export type SystemStatus = z.infer<typeof SystemStatus>
