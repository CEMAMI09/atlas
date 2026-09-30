import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { EnvSchema, type Env, decodeKey } from './env'
import { SECRET_ENV_NAMES, createSecretScrubber } from './secrets'

export type ServiceName = 'api' | 'worker' | 'cli' | 'test'

export interface FeatureConfigReport {
  feature: string
  configured: boolean
  /** Variable NAMES that are missing. Values are never included. */
  missing: string[]
}

export interface AtlasConfig {
  env: Env
  service: ServiceName
  isProduction: boolean
  isTest: boolean
  repoRoot: string | null
  dataDir: string
  timezone: string
  useMockIntegrations: boolean
  encryptionKey: Buffer
  allowedOrigins: string[]
  features: {
    homeAssistant: FeatureConfigReport
    google: FeatureConfigReport
    vercel: FeatureConfigReport
    stripe: FeatureConfigReport & { keyKind: 'restricted' | 'secret' | 'invalid' | null; livemode: boolean | null; webhookConfigured: boolean }
    ai: FeatureConfigReport
    transcription: FeatureConfigReport
    mqtt: FeatureConfigReport
  }
  /** Replace secret values inside arbitrary strings (logs, provider error messages). */
  scrub: (input: string) => string
  /** Files loaded to populate the environment (paths only). */
  loadedEnvFiles: string[]
}

export class ConfigError extends Error {
  readonly problems: { name: string; problem: string }[]

  constructor(problems: { name: string; problem: string }[]) {
    super(
      `Atlas configuration is invalid:\n${problems.map((p) => `  - ${p.name}: ${p.problem}`).join('\n')}\n` +
        'Set these in the repository root .env.local (development) or the service env_file (production). ' +
        'See .env.example for names and safe defaults.',
    )
    this.name = 'ConfigError'
    this.problems = problems
  }
}

export function findRepoRoot(start = process.cwd()): string | null {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Load `KEY=value` pairs from env files into `target` without overriding variables that are
 * already set (the real environment always wins).
 */
export function loadEnvFiles(files: string[], target: NodeJS.ProcessEnv = process.env): string[] {
  const loaded: string[] = []
  for (const file of files) {
    if (!existsSync(file)) continue
    const parsed = parseEnv(readFileSync(file, 'utf8'))
    for (const [key, value] of Object.entries(parsed)) {
      if (target[key] === undefined && typeof value === 'string') target[key] = value
    }
    loaded.push(file)
  }
  return loaded
}

function defaultDataDir(repoRoot: string | null): string {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
    return join(base, 'AtlasOS')
  }
  if (repoRoot && process.env.NODE_ENV !== 'production') return join(repoRoot, 'data')
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'atlas')
}

function systemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function report(feature: string, required: Record<string, string | undefined | string[]>): FeatureConfigReport {
  const missing = Object.entries(required)
    .filter(([, v]) => v === undefined || (Array.isArray(v) && v.length === 0))
    .map(([k]) => k)
  return { feature, configured: missing.length === 0, missing }
}

export interface LoadConfigOptions {
  service: ServiceName
  /** Override the environment source (tests). */
  source?: NodeJS.ProcessEnv
  /** Skip reading .env files (tests / containers). */
  skipEnvFiles?: boolean
}

export function loadConfig(options: LoadConfigOptions): AtlasConfig {
  const source = options.source ?? process.env
  const repoRoot = findRepoRoot()
  let loadedEnvFiles: string[] = []
  if (!options.skipEnvFiles && source === process.env) {
    const explicit = process.env.ATLAS_ENV_FILE
    const candidates = explicit ? [resolve(explicit)] : repoRoot ? [join(repoRoot, '.env.local'), join(repoRoot, '.env')] : []
    loadedEnvFiles = loadEnvFiles(candidates, source)
  }

  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => ({
      name: String(issue.path[0] ?? '(root)'),
      // Zod issue messages describe the rule, never the received value.
      problem: issue.code === 'invalid_type' ? 'is required' : issue.message,
    }))
    throw new ConfigError(problems)
  }
  const env = parsed.data
  const isProduction = env.NODE_ENV === 'production'

  const mockRaw = env.ATLAS_USE_MOCK_INTEGRATIONS
  const useMockIntegrations = mockRaw === 'true' || mockRaw === '1'

  const stripeKey = env.STRIPE_RESTRICTED_KEY
  let keyKind: 'restricted' | 'secret' | 'invalid' | null = null
  let livemode: boolean | null = null
  if (stripeKey) {
    if (/^rk_(test|live)_/.test(stripeKey)) keyKind = 'restricted'
    else if (/^sk_(test|live)_/.test(stripeKey)) keyKind = 'secret'
    else keyKind = 'invalid'
    livemode = /_live_/.test(stripeKey)
  }

  const timezone = env.ATLAS_TIMEZONE && isTimeZone(env.ATLAS_TIMEZONE) ? env.ATLAS_TIMEZONE : systemTimeZone()

  const secrets = SECRET_ENV_NAMES.map((name) => source[name])
  // Credentials embedded in DATABASE_URL / MQTT_URL are scrubbed individually as well.
  for (const urlName of ['DATABASE_URL', 'MQTT_URL'] as const) {
    const raw = source[urlName]
    if (!raw) continue
    try {
      const u = new URL(raw)
      if (u.password) secrets.push(decodeURIComponent(u.password))
    } catch {
      /* invalid URLs are reported by schema validation */
    }
  }

  const config: AtlasConfig = {
    env,
    service: options.service,
    isProduction,
    isTest: env.NODE_ENV === 'test',
    repoRoot,
    dataDir: env.ATLAS_DATA_DIR ? resolve(env.ATLAS_DATA_DIR) : defaultDataDir(repoRoot),
    timezone,
    useMockIntegrations,
    encryptionKey: decodeKey(env.ATLAS_ENCRYPTION_KEY)!,
    allowedOrigins: [...new Set([new URL(env.ATLAS_BASE_URL).origin, ...env.ATLAS_ALLOWED_ORIGINS.map(safeOrigin).filter(isString)])],
    features: {
      homeAssistant: report('Home Assistant', {
        HOME_ASSISTANT_URL: env.HOME_ASSISTANT_URL,
        HOME_ASSISTANT_ACCESS_TOKEN: env.HOME_ASSISTANT_ACCESS_TOKEN,
      }),
      google: report('Google', {
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI: env.GOOGLE_REDIRECT_URI,
      }),
      vercel: report('Vercel', { VERCEL_ACCESS_TOKEN: env.VERCEL_ACCESS_TOKEN }),
      stripe: {
        ...report('Stripe', { STRIPE_RESTRICTED_KEY: env.STRIPE_RESTRICTED_KEY }),
        keyKind,
        livemode,
        webhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
      },
      ai: report('AI Gateway', {
        AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
        ATLAS_AI_FAST_MODEL: env.ATLAS_AI_FAST_MODEL,
        ATLAS_AI_REASONING_MODEL: env.ATLAS_AI_REASONING_MODEL,
      }),
      transcription: report('Transcription', {
        AI_GATEWAY_API_KEY: env.TRANSCRIPTION_PROVIDER === 'vercel-ai-gateway' ? env.AI_GATEWAY_API_KEY : 'n/a',
        ATLAS_TRANSCRIPTION_MODEL: env.TRANSCRIPTION_PROVIDER === 'vercel-ai-gateway' ? env.ATLAS_TRANSCRIPTION_MODEL : 'n/a',
      }),
      mqtt: report('MQTT', { MQTT_URL: env.MQTT_URL }),
    },
    scrub: createSecretScrubber(secrets),
    loadedEnvFiles,
  }
  return Object.freeze(config)
}

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function isString(v: string | null): v is string {
  return typeof v === 'string'
}

/**
 * A startup summary that is safe to log: which features are configured and the NAMES of anything
 * missing. Never includes values.
 */
export function describeConfig(config: AtlasConfig): Record<string, unknown> {
  return {
    service: config.service,
    nodeEnv: config.env.NODE_ENV,
    mockIntegrations: config.useMockIntegrations,
    timezone: config.timezone,
    dataDir: config.dataDir,
    envFiles: config.loadedEnvFiles.map((f) => f.replace(config.repoRoot ?? '', '.')),
    features: Object.fromEntries(
      Object.values(config.features).map((f) => [f.feature, f.configured ? 'configured' : `missing: ${f.missing.join(', ') || '-'}`]),
    ),
  }
}
