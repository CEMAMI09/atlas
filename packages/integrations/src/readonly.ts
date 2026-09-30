import { AtlasError } from '@atlas/shared'

const BLOCKED = /\/(refunds|payouts|transfers|payment_intents|charges)(\/|$)/i

/**
 * Stripe V1 is read-only. The only method the adapter may issue is GET, and write-only resources
 * are rejected even if a caller asks for them.
 */
export function assertStripeReadOnly(method: string, path: string): void {
  const verb = method.toUpperCase()
  if (verb !== 'GET') {
    throw new AtlasError('FORBIDDEN', `Stripe ${verb} ${path} is not allowed. Atlas Stripe access is read-only.`)
  }
  if (BLOCKED.test(path)) {
    throw new AtlasError('FORBIDDEN', `Stripe path ${path} is not available to Atlas.`)
  }
  if (!path.startsWith('/v1/')) {
    throw new AtlasError('BAD_REQUEST', 'Stripe requests must use a /v1/ path.')
  }
}

/** Vercel V1 is read-only and only talks to the documented REST host. */
export function assertVercelReadOnly(method: string, path: string): void {
  const verb = method.toUpperCase()
  if (verb !== 'GET') {
    throw new AtlasError('FORBIDDEN', `Vercel ${verb} ${path} is not allowed. Atlas Vercel access is read-only.`)
  }
  if (!path.startsWith('/v9/') && !path.startsWith('/v6/') && !path.startsWith('/v2/')) {
    throw new AtlasError('BAD_REQUEST', 'Vercel requests must use a documented API path.')
  }
}

export function stripeReadPath(path: string): string {
  assertStripeReadOnly('GET', path)
  return path
}

export function vercelReadPath(path: string): string {
  assertVercelReadOnly('GET', path)
  return path
}
