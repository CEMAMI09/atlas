import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { loadConfig, describeConfig, type AtlasConfig } from '@atlas/config'
import { createDatabase, integrationConnections, runMigrations, serviceHeartbeats, systemSettings, users, type Database } from '@atlas/database'
import { mockSourcesFor } from '@atlas/events'
import { type IntegrationId, type IntegrationModeOverride, type IntegrationStatus, type RealtimeMessage } from '@atlas/shared'
import { createLogger, type AtlasLogger } from './logger'
import { ensureSettings, patchSettings, readSettings } from './settings'
import { ensureMockWorld } from './seed'
import { integrationStatuses, modeFor } from './integrations'
import type { Domain } from './domain'

export const ATLAS_VERSION = '0.1.0'

export interface AtlasRuntime {
  config: AtlasConfig
  log: AtlasLogger
  db: Database
  startedAt: Date
  instanceId: string
  close: () => Promise<void>
  statuses: (userId?: string) => Promise<IntegrationStatus[]>
  domainFor: (userId: string, timezone: string) => Promise<Domain>
  prepareUser: (userId: string) => Promise<void>
  broadcast: (message: RealtimeMessage) => void
  subscribe: (listener: (message: RealtimeMessage) => void) => () => void
  clientCount: () => number
  heartbeat: () => Promise<void>
}

export async function createRuntime(service: 'api' | 'worker'): Promise<AtlasRuntime> {
  const config = loadConfig({ service })
  const log = createLogger(config)
  log.info(describeConfig(config), 'Atlas configuration loaded')
  const handle = createDatabase(config.env.DATABASE_URL, {
    max: config.env.ATLAS_DB_POOL_MAX,
    applicationName: `atlas-${service}`,
  })
  await runMigrations(handle.db)
  await ensureSettings(handle.db, config.useMockIntegrations)
  const realData = await handle.db.select().from(systemSettings).where(eq(systemSettings.key, 'developer.realData')).limit(1)
  if (realData.length === 0 && config.env.ATLAS_USE_MOCK_INTEGRATIONS !== 'true' && config.env.ATLAS_USE_MOCK_INTEGRATIONS !== '1') {
    await patchSettings(handle.db, { developer: { useMockIntegrations: false } })
    await handle.db.insert(systemSettings).values({ key: 'developer.realData', value: true })
  }
  const listeners = new Set<(message: RealtimeMessage) => void>()
  const runtime: AtlasRuntime = {
    config,
    log,
    db: handle.db,
    startedAt: new Date(),
    instanceId: randomUUID(),
    close: () => handle.close(),
    statuses: (userId?: string) => currentStatuses(handle.db, config, userId),
    domainFor: async (userId, timezone) => domainFor(handle.db, config, userId, timezone),
    prepareUser: async (userId) => {
      const rows = await handle.db.select().from(users).where(eq(users.id, userId)).limit(1)
      const user = rows[0]
      if (!user) return
      const settings = await readSettings(handle.db)
      if (!settings.developer.useMockIntegrations) return
      await ensureMockWorld(handle.db, { id: user.id, displayName: user.displayName, timezone: user.timezone })
    },
    broadcast: (message) => {
      for (const listener of listeners) listener(message)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    clientCount: () => listeners.size,
    heartbeat: async () => {
      await handle.db
        .insert(serviceHeartbeats)
        .values({
          service,
          instanceId: runtime.instanceId,
          version: ATLAS_VERSION,
          startedAt: runtime.startedAt,
          lastBeatAt: new Date(),
          details: {},
        })
        .onConflictDoUpdate({
          target: serviceHeartbeats.service,
          set: { instanceId: runtime.instanceId, lastBeatAt: new Date(), version: ATLAS_VERSION, startedAt: runtime.startedAt },
        })
    },
  }
  await runtime.heartbeat()
  return runtime
}

async function currentStatuses(db: Database, config: AtlasConfig, userId?: string): Promise<IntegrationStatus[]> {
  const settings = await readSettings(db)
  const rows = await db.select().from(integrationConnections)
  const overrides: Partial<Record<IntegrationId, IntegrationModeOverride>> = {}
  for (const row of rows) {
    if (isIntegrationId(row.provider)) overrides[row.provider] = row.modeOverride
  }
  const { googleIsLinked } = await import('./google-auth')
  const linked = userId ? await googleIsLinked(db, userId) : false
  return integrationStatuses(config, settings, overrides, linked)
}

function isIntegrationId(value: string): value is IntegrationId {
  return ['home_assistant', 'google', 'vercel', 'stripe', 'ai_gateway', 'audio', 'mqtt', 'weather', 'health', 'finance'].includes(value)
}

async function domainFor(db: Database, config: AtlasConfig, userId: string, timezone: string): Promise<Domain> {
  const statuses = await currentStatuses(db, config, userId)
  const mockIds = new Set(statuses.filter((status) => status.state === 'MOCK').map((status) => status.id))
  const settings = await readSettings(db)
  return {
    db,
    now: new Date(),
    timeZone: timezone,
    userId,
    config,
    visibility: { mockSources: mockSourcesFor(mockIds, settings.developer.useMockIntegrations) },
    integrationMode: (id) => modeFor(statuses, id),
  }
}

export function publicRuntimeInfo(config: AtlasConfig) {
  return {
    version: ATLAS_VERSION,
    environment: config.env.NODE_ENV,
    mockDefault: config.useMockIntegrations,
    aiConfigured: config.features.ai.configured,
    features: Object.fromEntries(Object.values(config.features).map((feature) => [feature.feature, { configured: feature.configured, missing: feature.missing }])),
  }
}
