/**
 * Environment variables whose values must never reach logs, API responses, error messages or the
 * browser. The bundle scanner and the log redactor both use this list.
 */
export const SECRET_ENV_NAMES = [
  'HOME_ASSISTANT_ACCESS_TOKEN',
  'GOOGLE_CLIENT_SECRET',
  'VERCEL_ACCESS_TOKEN',
  'AI_GATEWAY_API_KEY',
  'STRIPE_RESTRICTED_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'DATABASE_URL',
  'POSTGRES_PASSWORD',
  'ATLAS_ENCRYPTION_KEY',
  'SESSION_SECRET',
  'MQTT_PASSWORD',
] as const

export type SecretEnvName = (typeof SECRET_ENV_NAMES)[number]

/** Object keys that are redacted wherever they appear in structured logs. */
export const REDACTED_LOG_PATHS = [
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'id_token',
  'apiKey',
  'api_key',
  'secret',
  'clientSecret',
  'client_secret',
  'authorization',
  'cookie',
  'set-cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
  '*.authorization',
  '*.cookie',
] as const

export const REDACTED = '[REDACTED]'

/**
 * Build a function that replaces any occurrence of a known secret value inside a string. Values
 * shorter than 8 characters are ignored to avoid mangling ordinary text.
 */
export function createSecretScrubber(values: Iterable<string | undefined | null>): (input: string) => string {
  const secrets = [...new Set([...values].filter((v): v is string => typeof v === 'string' && v.length >= 8))]
  // Also scrub URL-encoded forms (e.g. credentials embedded in connection strings).
  for (const s of [...secrets]) {
    const encoded = encodeURIComponent(s)
    if (encoded !== s) secrets.push(encoded)
  }
  secrets.sort((a, b) => b.length - a.length)
  if (secrets.length === 0) return (input) => input
  return (input: string) => {
    let out = input
    for (const secret of secrets) {
      if (out.includes(secret)) out = out.split(secret).join(REDACTED)
    }
    return out
  }
}

/** Remove credentials from a URL so it can be displayed (e.g. `postgres://atlas:***@host/db`). */
export function redactUrlCredentials(value: string): string {
  try {
    const url = new URL(value)
    if (url.password) url.password = '***'
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password|signature|sig/i.test(key)) url.searchParams.set(key, '***')
    }
    return url.toString()
  } catch {
    return '[unparseable url]'
  }
}
