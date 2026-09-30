import { integrationConnections, type Database } from '@atlas/database'
import type { AtlasConfig } from '@atlas/config'
import { INTEGRATION_LABELS, type IntegrationId, type IntegrationModeOverride, type IntegrationState, type IntegrationStatus } from '@atlas/shared'
import type { AtlasSettings } from '@atlas/shared'

const ORDER: IntegrationId[] = ['home_assistant', 'google', 'vercel', 'stripe', 'ai_gateway', 'audio', 'mqtt', 'weather', 'health', 'finance']

export function integrationStatuses(
  config: AtlasConfig,
  settings: AtlasSettings,
  overrides: Partial<Record<IntegrationId, IntegrationModeOverride>>,
  googleLinked = false,
): IntegrationStatus[] {
  const globalMock = settings.developer.useMockIntegrations
  return ORDER.map((id) => {
    const label = INTEGRATION_LABELS[id]
    const override = overrides[id] ?? 'auto'
    const feature = featureFor(config, id)
    const state = resolveState(id, override, globalMock, feature.configured, id === 'google' ? googleLinked : true)
    const lastError = state === 'ERROR' ? 'The provider could not be reached.' : id === 'google' && feature.configured && !googleLinked ? 'Connect Google to read Calendar and Gmail.' : null
    return {
      id,
      displayName: label.name,
      description: label.description,
      state,
      modeOverride: override,
      configured: feature.configured,
      missingConfig: feature.missing,
      readOnly: id === 'vercel' || id === 'stripe' || id === 'google' ? id !== 'google' : true,
      capabilities: capabilities(id, state),
      grantedScopes: id === 'google' && state === 'MOCK' ? ['calendar.events', 'gmail.readonly'] : [],
      accountLabel: state === 'MOCK' ? 'Mock data' : null,
      lastSyncAt: state === 'MOCK' ? new Date().toISOString() : null,
      lastSuccessAt: state === 'MOCK' ? new Date().toISOString() : null,
      lastError,
      lastErrorAt: lastError ? new Date().toISOString() : null,
      health: state === 'MOCK' || state === 'CONNECTED' ? 'healthy' : state === 'ERROR' ? 'unhealthy' : 'unknown',
      discovered:
        id === 'home_assistant' && state === 'MOCK'
          ? [
              { id: 'blink', name: 'Blink', entityCount: 1, kinds: ['camera'] },
              { id: 'vivint', name: 'Vivint', entityCount: 2, kinds: ['camera', 'alarm_panel'] },
            ]
          : [],
      supportsOAuth: id === 'google',
    }
  })
}

export function modeFor(
  statuses: IntegrationStatus[],
  id: IntegrationId,
): 'mock' | 'live' | 'off' {
  const status = statuses.find((item) => item.id === id)
  if (!status || status.state === 'DISCONNECTED' || status.state === 'ERROR') return 'off'
  if (status.state === 'MOCK') return 'mock'
  return 'live'
}

function resolveState(id: IntegrationId, override: IntegrationModeOverride, globalMock: boolean, configured: boolean, linked = true): IntegrationState {
  if (id === 'health' || id === 'finance' || id === 'weather' || id === 'mqtt' || id === 'audio') {
    if (override === 'disabled') return 'DISCONNECTED'
    if (override === 'mock' || (override === 'auto' && globalMock)) return 'MOCK'
    return 'DISCONNECTED'
  }
  if (override === 'disabled') return 'DISCONNECTED'
  if (override === 'mock' || (override === 'auto' && globalMock && id !== 'ai_gateway')) return 'MOCK'
  if (id === 'ai_gateway') return configured ? 'CONNECTED' : 'DISCONNECTED'
  if (!configured) return 'DISCONNECTED'
  if (id === 'google' && !linked) return 'DISCONNECTED'
  return 'CONNECTED'
}

export async function setIntegrationMode(db: Database, id: IntegrationId, mode: IntegrationModeOverride): Promise<void> {
  await db
    .insert(integrationConnections)
    .values({ provider: id, modeOverride: mode, status: 'DISCONNECTED' })
    .onConflictDoUpdate({ target: integrationConnections.provider, set: { modeOverride: mode, updatedAt: new Date() } })
}

function featureFor(config: AtlasConfig, id: IntegrationId): { configured: boolean; missing: string[] } {
  switch (id) {
    case 'home_assistant':
      return config.features.homeAssistant
    case 'google':
      return config.features.google
    case 'vercel':
      return config.features.vercel
    case 'stripe':
      return { configured: config.features.stripe.configured && config.features.stripe.keyKind === 'restricted', missing: config.features.stripe.missing }
    case 'ai_gateway':
      return config.features.ai
    case 'audio':
      return config.features.transcription
    case 'mqtt':
      return config.features.mqtt
    default:
      return { configured: false, missing: [] }
  }
}

function capabilities(id: IntegrationId, state: IntegrationState) {
  const available = state === 'MOCK' || state === 'CONNECTED'
  if (id === 'google') {
    return [
      { id: 'calendar.read', label: 'Read calendar', access: 'read' as const, available },
      { id: 'calendar.write', label: 'Create and update events', access: 'write' as const, available },
      { id: 'gmail.read', label: 'Read mail', access: 'read' as const, available },
    ]
  }
  if (id === 'stripe' || id === 'vercel') return [{ id: 'read', label: 'Read only', access: 'read' as const, available }]
  if (id === 'home_assistant') return [{ id: 'entities', label: 'Entities and cameras', access: 'read' as const, available }]
  return []
}
