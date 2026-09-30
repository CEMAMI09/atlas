import { createHash } from 'node:crypto'

/** Deterministic JSON (sorted keys) so equal parameters always hash identically. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = sortValue(v)
    }
    return out
  }
  return value
}

export function hashParameters(toolId: string, params: unknown): string {
  return createHash('sha256').update(toolId).update('\n').update(stableStringify(params)).digest('hex')
}

const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|signature/i
const SENSITIVE_EXACT = new Set(['pin', 'code', 'otp', 'passcode', 'phrase'])

export interface RedactOptions {
  /** Additional keys whose values should be replaced (e.g. `body`). */
  keys?: readonly string[]
  maxStringLength?: number
}

/** Redact parameters for audit logs: sensitive keys removed, long text truncated. */
export function redactParameters(params: unknown, options: RedactOptions = {}): Record<string, unknown> {
  const extra = new Set(options.keys ?? [])
  const max = options.maxStringLength ?? 300
  const walk = (value: unknown, key: string | null, depth: number): unknown => {
    if (key && (SENSITIVE_KEY.test(key) || SENSITIVE_EXACT.has(key.toLowerCase()) || extra.has(key))) return '[REDACTED]'
    if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}… [${value.length} chars]` : value
    if (depth > 6) return '[depth limit]'
    if (Array.isArray(value)) return value.slice(0, 50).map((v) => walk(v, null, depth + 1))
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v, k, depth + 1)
      return out
    }
    return value
  }
  const result = walk(params, null, 0)
  return result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>) : { value: result }
}
