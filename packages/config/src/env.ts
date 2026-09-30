import { z } from 'zod'

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

const optionalString = z.preprocess(emptyToUndefined, z.string().trim().optional())
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional())

const booleanFlag = (def: boolean) =>
  z.preprocess((v) => {
    const e = emptyToUndefined(v)
    if (e === undefined) return def
    if (typeof e === 'boolean') return e
    return ['1', 'true', 'yes', 'on'].includes(String(e).toLowerCase())
  }, z.boolean())

const intWithDefault = (def: number, min: number, max: number) =>
  z.preprocess((v) => {
    const e = emptyToUndefined(v)
    return e === undefined ? def : Number(e)
  }, z.number().int().min(min).max(max))

const commaList = z.preprocess((v) => {
  const e = emptyToUndefined(v)
  if (e === undefined) return []
  return String(e)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}, z.array(z.string().max(200)).max(50))

export function decodeKey(value: string): Buffer | null {
  const trimmed = value.trim()
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex')
  const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null
  const buf = Buffer.from(normalized, 'base64')
  return buf.length === 32 ? buf : null
}

/** Server-side environment schema. Nothing in here is ever sent to the browser. */
export const EnvSchema = z.object({
  NODE_ENV: z.preprocess(emptyToUndefined, z.enum(['development', 'production', 'test']).default('development')),
  ATLAS_BASE_URL: z.preprocess(emptyToUndefined, z.url().default('http://localhost:5173')),
  ATLAS_API_URL: z.preprocess(emptyToUndefined, z.url().default('http://localhost:4000')),
  ATLAS_API_HOST: z.preprocess(emptyToUndefined, z.string().default('127.0.0.1')),
  ATLAS_API_PORT: intWithDefault(4000, 1, 65535),
  /** Extra browser origins allowed for cookies/WebSocket (comma-separated), e.g. a Tailscale name. */
  ATLAS_ALLOWED_ORIGINS: commaList,
  ATLAS_TRUST_PROXY: booleanFlag(false),
  ATLAS_SERVE_WEB: booleanFlag(false),
  ATLAS_WEB_DIST: optionalString,
  ATLAS_DATA_DIR: optionalString,
  ATLAS_TIMEZONE: optionalString,
  ATLAS_USE_MOCK_INTEGRATIONS: z.preprocess(emptyToUndefined, z.enum(['true', 'false', '1', '0']).optional()),
  ATLAS_REALTIME_POLL_MS: intWithDefault(1000, 250, 60_000),
  LOG_LEVEL: z.preprocess(emptyToUndefined, z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')),

  ATLAS_ENCRYPTION_KEY: z
    .string({ error: 'is required' })
    .refine((v) => decodeKey(v) !== null, 'must decode to 32 bytes (base64, base64url or 64 hex characters)'),
  SESSION_SECRET: z.string({ error: 'is required' }).min(32, 'must be at least 32 characters'),

  DATABASE_URL: z
    .string({ error: 'is required' })
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgres:// or postgresql:// URL'),
  ATLAS_DB_POOL_MAX: intWithDefault(10, 1, 100),

  HOME_ASSISTANT_URL: optionalUrl,
  HOME_ASSISTANT_ACCESS_TOKEN: optionalString,

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalUrl,

  VERCEL_ACCESS_TOKEN: optionalString,
  VERCEL_TEAM_ID: optionalString,
  VERCEL_PROJECT_IDS: commaList,

  AI_GATEWAY_API_KEY: optionalString,
  ATLAS_AI_FAST_MODEL: optionalString,
  ATLAS_AI_REASONING_MODEL: optionalString,
  ATLAS_AI_EMBEDDING_MODEL: optionalString,
  TRANSCRIPTION_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['vercel-ai-gateway', 'mock', 'none']).default('none')),
  ATLAS_TRANSCRIPTION_MODEL: optionalString,

  STRIPE_RESTRICTED_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  /** Escape hatch for when a restricted key is truly unavailable. Strongly discouraged. */
  ATLAS_STRIPE_ALLOW_SECRET_KEY: booleanFlag(false),

  MQTT_URL: optionalUrl,
  MQTT_USERNAME: optionalString,
  MQTT_PASSWORD: optionalString,

  WEATHER_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['none', 'mock']).default('none')),
})

export type Env = z.infer<typeof EnvSchema>
