import { describe, expect, it } from 'vitest'
import { evaluatePermission, LEVEL_4_ENABLED } from './index'
import type { ToolPolicy } from './policy'

const read: ToolPolicy = {
  id: 'calendar.getEvents',
  riskLevel: 0,
  sideEffect: 'none',
  requiredPermissions: ['calendar:read'],
  confirmationPolicy: 'none',
}

const disarm: ToolPolicy = {
  id: 'security.disarm',
  riskLevel: 3,
  sideEffect: 'security_control',
  requiredPermissions: ['security:disarm'],
  confirmationPolicy: 'strong',
}

const base = {
  granted: new Set(['calendar:read', 'security:disarm'] as const),
  toolEnabled: true,
  source: 'chat' as const,
  privacyMode: false,
  level4Enabled: LEVEL_4_ENABLED,
  confirmed: false,
}

describe('permission engine', () => {
  it('allows read-only tools without confirmation', () => {
    expect(evaluatePermission(read, base)).toEqual({ outcome: 'allow', confirmation: 'none' })
  })

  it('rejects a disabled tool before it can run', () => {
    const decision = evaluatePermission(read, { ...base, toolEnabled: false })
    expect(decision.outcome).toBe('deny')
  })

  it('requires confirmation for level 3 actions', () => {
    const decision = evaluatePermission(disarm, base)
    expect(decision).toEqual({ outcome: 'confirm', confirmation: 'strong' })
  })

  it('allows a level 3 action only after confirmation', () => {
    expect(evaluatePermission(disarm, { ...base, confirmed: true }).outcome).toBe('allow')
  })

  it('keeps level 4 disabled', () => {
    const refund: ToolPolicy = {
      id: 'stripe.refund',
      riskLevel: 4,
      sideEffect: 'financial',
      requiredPermissions: ['payments:read'],
      confirmationPolicy: 'disabled',
    }
    expect(evaluatePermission(refund, base).outcome).toBe('deny')
  })
})
