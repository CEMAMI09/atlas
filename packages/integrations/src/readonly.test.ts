import { describe, expect, it } from 'vitest'
import { AtlasError } from '@atlas/shared'
import { assertStripeReadOnly } from './readonly'

describe('stripe read-only adapter', () => {
  it('rejects write methods and refund endpoints', () => {
    expect(() => assertStripeReadOnly('POST', '/v1/refunds')).toThrow(AtlasError)
    expect(() => assertStripeReadOnly('DELETE', '/v1/customers/cus_123')).toThrow(AtlasError)
    expect(() => assertStripeReadOnly('GET', '/v1/refunds')).toThrow(AtlasError)
  })

  it('allows a subscription read', () => {
    expect(() => assertStripeReadOnly('GET', '/v1/subscriptions')).not.toThrow()
  })
})
