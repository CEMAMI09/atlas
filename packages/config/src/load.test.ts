import { describe, expect, it } from 'vitest'
import { describeConfig, loadConfig } from './load'

describe('startup configuration', () => {
  it('reports missing variable names and never their values', () => {
    const config = loadConfig({
      service: 'test',
      skipEnvFiles: true,
      source: {
        NODE_ENV: 'test',
        ATLAS_ENCRYPTION_KEY: 'aa'.repeat(32),
        SESSION_SECRET: 'session-secret-value-not-for-logs',
        DATABASE_URL: 'postgresql://atlas:super-secret-db-password@localhost:5432/atlas',
        AI_GATEWAY_API_KEY: 'gateway-secret-value-should-not-leak',
      },
    })
    const text = JSON.stringify(describeConfig(config))
    expect(text).not.toContain('super-secret-db-password')
    expect(text).not.toContain('gateway-secret-value-should-not-leak')
    expect(text).not.toContain('session-secret-value-not-for-logs')
    expect(config.features.vercel.missing).toContain('VERCEL_ACCESS_TOKEN')
  })
})
