import { z } from 'zod'
import { IsoDateTime } from './common'

export const IntegrationId = z.enum([
  'home_assistant',
  'google',
  'vercel',
  'stripe',
  'ai_gateway',
  'audio',
  'mqtt',
  'weather',
  'health',
  'finance',
])
export type IntegrationId = z.infer<typeof IntegrationId>

/** The four user-visible states every optional integration can be in. */
export const IntegrationState = z.enum(['CONNECTED', 'DISCONNECTED', 'ERROR', 'MOCK'])
export type IntegrationState = z.infer<typeof IntegrationState>

/** Per-integration override stored in `integration_connections.mode_override`. */
export const IntegrationModeOverride = z.enum(['auto', 'mock', 'live', 'disabled'])
export type IntegrationModeOverride = z.infer<typeof IntegrationModeOverride>

export const IntegrationCapability = z.object({
  id: z.string(),
  label: z.string(),
  access: z.enum(['read', 'write', 'control']),
  available: z.boolean(),
})
export type IntegrationCapability = z.infer<typeof IntegrationCapability>

export const DiscoveredProvider = z.object({
  id: z.string(),
  name: z.string(),
  entityCount: z.number().int().nonnegative(),
  kinds: z.array(z.string()),
})
export type DiscoveredProvider = z.infer<typeof DiscoveredProvider>

export const IntegrationStatus = z.object({
  id: IntegrationId,
  displayName: z.string(),
  description: z.string(),
  state: IntegrationState,
  modeOverride: IntegrationModeOverride,
  /** Whether the server has the credentials this integration needs (never the credentials themselves). */
  configured: z.boolean(),
  /** Names of missing configuration variables, never their values. */
  missingConfig: z.array(z.string()),
  readOnly: z.boolean(),
  capabilities: z.array(IntegrationCapability),
  grantedScopes: z.array(z.string()),
  accountLabel: z.string().nullable(),
  lastSyncAt: IsoDateTime.nullable(),
  lastSuccessAt: IsoDateTime.nullable(),
  lastError: z.string().nullable(),
  lastErrorAt: IsoDateTime.nullable(),
  health: z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']),
  discovered: z.array(DiscoveredProvider),
  supportsOAuth: z.boolean(),
})
export type IntegrationStatus = z.infer<typeof IntegrationStatus>

export const INTEGRATION_LABELS: Record<IntegrationId, { name: string; description: string }> = {
  home_assistant: {
    name: 'Home Assistant',
    description: 'Smart-home compatibility layer — lights, sensors, locks, Blink, Vivint and ESP32 entities.',
  },
  google: { name: 'Google', description: 'Calendar (read and write) and Gmail (read-only).' },
  vercel: { name: 'Vercel', description: 'Projects and deployments (read-only).' },
  stripe: { name: 'Stripe', description: 'Revenue, subscriptions and payments (read-only, restricted key).' },
  ai_gateway: { name: 'AI Gateway', description: 'Vercel AI Gateway for Atlas language models.' },
  audio: { name: 'Audio', description: 'Microphone capture and transcription providers.' },
  mqtt: { name: 'MQTT', description: 'Future ESP32 sensors, ring receivers and presence beacons.' },
  weather: { name: 'Weather', description: 'Local weather provider.' },
  health: { name: 'Health', description: 'Health data provider (not yet available).' },
  finance: { name: 'Finance', description: 'Personal finance provider (not yet available).' },
}
