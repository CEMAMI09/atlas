import { hostname, loadavg, platform, totalmem, freemem, uptime, cpus } from 'node:os'
import { sql } from 'drizzle-orm'
import { serviceHeartbeats, type Database } from '@atlas/database'
import type { HealthState, HostMetrics, IntegrationStatus, ProcessMetrics, SystemStatus } from '@atlas/shared'

export async function systemStatus(options: {
  db: Database
  version: string
  environment: 'development' | 'production' | 'test'
  mockMode: boolean
  startedAt: Date
  integrations: IntegrationStatus[]
  service: 'api' | 'worker'
  realtimeClients: number
}): Promise<SystemStatus> {
  const started = Date.now()
  let dbState: HealthState = 'healthy'
  let versionText: string | null = null
  let size: number | null = null
  let pgvector = false
  try {
    const rows = await options.db.execute<{ version: string; size: number; vector: boolean }>(sql`
      select version() as version,
             pg_database_size(current_database())::float8 as size,
             exists(select 1 from pg_extension where extname = 'vector') as vector
    `)
    const row = rows[0]
    versionText = row?.version ?? null
    size = row?.size ?? null
    pgvector = Boolean(row?.vector)
  } catch {
    dbState = 'unhealthy'
  }
  const latency = Date.now() - started
  const beats = await options.db.select().from(serviceHeartbeats)
  const processes: ProcessMetrics[] = beats.map((beat) => ({
    service: beat.service,
    pid: 0,
    uptimeSeconds: Math.max(0, (Date.now() - beat.startedAt.getTime()) / 1000),
    rssBytes: 0,
    heapUsedBytes: 0,
    version: beat.version,
    heartbeatAt: beat.lastBeatAt.toISOString(),
    stale: Date.now() - beat.lastBeatAt.getTime() > 60_000,
  }))
  const memory = process.memoryUsage()
  processes.push({
    service: options.service,
    pid: process.pid,
    uptimeSeconds: process.uptime(),
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    version: options.version,
    heartbeatAt: new Date().toISOString(),
    stale: false,
  })
  const host: HostMetrics = {
    hostname: hostname(),
    platform: platform(),
    cpuCount: cpus().length,
    loadAverage: loadavg(),
    cpuPercent: null,
    memoryTotalBytes: totalmem(),
    memoryUsedBytes: totalmem() - freemem(),
    uptimeSeconds: uptime(),
    disk: null,
  }
  const services = [
    { id: 'database', name: 'PostgreSQL', state: dbState, detail: versionText, latencyMs: latency, checkedAt: new Date().toISOString() },
    ...options.integrations.map((item) => ({
      id: item.id,
      name: item.displayName,
      state: item.health === 'healthy' ? 'healthy' : item.state === 'DISCONNECTED' ? 'disabled' : item.health,
      detail: item.lastError,
      latencyMs: null,
      checkedAt: item.lastSuccessAt,
    })),
  ] as SystemStatus['services']
  const overall: HealthState = dbState === 'unhealthy' ? 'unhealthy' : 'healthy'
  return {
    overall,
    version: options.version,
    environment: options.environment,
    mockMode: options.mockMode,
    database: { state: dbState, engine: 'postgres', version: versionText, sizeBytes: size, pgvector, latencyMs: latency },
    services,
    processes,
    host,
    realtime: { clients: options.realtimeClients, transport: 'poll' },
    integrations: options.integrations.map((item) => ({ id: item.id, name: item.displayName, state: item.state })),
    lastBackupAt: null,
    startedAt: options.startedAt.toISOString(),
    generatedAt: new Date().toISOString(),
  }
}
