import type { ConfirmationPolicy, Permission, RiskLevel, SideEffect, ToolInvocationSource } from '@atlas/shared'

export interface ToolPolicy {
  id: string
  riskLevel: RiskLevel
  sideEffect: SideEffect
  requiredPermissions: readonly Permission[]
  confirmationPolicy: ConfirmationPolicy
}

/** The minimum confirmation each risk level requires. Tools may be stricter, never looser. */
export const MIN_CONFIRMATION: Record<RiskLevel, ConfirmationPolicy> = {
  0: 'none',
  1: 'none',
  2: 'confirm',
  3: 'strong',
  4: 'disabled',
}

const CONFIRMATION_ORDER: Record<ConfirmationPolicy, number> = { none: 0, confirm: 1, strong: 2, disabled: 3 }

export function stricterConfirmation(a: ConfirmationPolicy, b: ConfirmationPolicy): ConfirmationPolicy {
  return CONFIRMATION_ORDER[a] >= CONFIRMATION_ORDER[b] ? a : b
}

export function effectiveConfirmation(policy: ToolPolicy): ConfirmationPolicy {
  return stricterConfirmation(policy.confirmationPolicy, MIN_CONFIRMATION[policy.riskLevel])
}

export class PolicyDefinitionError extends Error {
  constructor(toolId: string, problem: string) {
    super(`Invalid policy for tool "${toolId}": ${problem}`)
    this.name = 'PolicyDefinitionError'
  }
}

/**
 * Structural rules checked when a tool is registered:
 * - read-only tools (sideEffect none) must be LEVEL_0 and vice versa
 * - financial side effects are always LEVEL_4
 * - security control is at least LEVEL_2
 */
export function validatePolicy(policy: ToolPolicy): void {
  if (policy.sideEffect === 'none' && policy.riskLevel !== 0) {
    throw new PolicyDefinitionError(policy.id, 'read-only tools must be LEVEL_0')
  }
  if (policy.riskLevel === 0 && policy.sideEffect !== 'none') {
    throw new PolicyDefinitionError(policy.id, 'LEVEL_0 tools cannot declare side effects')
  }
  if (policy.sideEffect === 'financial' && policy.riskLevel !== 4) {
    throw new PolicyDefinitionError(policy.id, 'financial side effects must be LEVEL_4')
  }
  if (policy.sideEffect === 'security_control' && policy.riskLevel < 2) {
    throw new PolicyDefinitionError(policy.id, 'security control must be at least LEVEL_2')
  }
  if (!/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/.test(policy.id)) {
    throw new PolicyDefinitionError(policy.id, 'tool ids must be dotted camelCase segments')
  }
}

export interface PermissionContext {
  granted: ReadonlySet<Permission>
  /** User/tool-level enablement from settings (undefined = enabled). */
  toolEnabled: boolean
  source: ToolInvocationSource
  /** Global privacy switch. */
  privacyMode: boolean
  /** Level 4 is disabled globally in V1; this is a hard-coded false in callers. */
  level4Enabled: false
  /** Set when the call carries an approved, matching confirmation. */
  confirmed: boolean
}

export type PermissionDecision =
  | { outcome: 'allow'; confirmation: ConfirmationPolicy }
  | { outcome: 'confirm'; confirmation: 'confirm' | 'strong' }
  | {
      outcome: 'deny'
      code: 'TOOL_DISABLED' | 'PERMISSION_DENIED' | 'PRIVACY_MODE'
      reason: string
      missing?: Permission[]
    }

/** Pure decision function. Every Atlas tool invocation goes through it. */
export function evaluatePermission(policy: ToolPolicy, ctx: PermissionContext): PermissionDecision {
  if (policy.riskLevel === 4 || policy.sideEffect === 'financial') {
    return { outcome: 'deny', code: 'TOOL_DISABLED', reason: 'Level 4 actions are disabled in this version of Atlas.' }
  }
  const confirmation = effectiveConfirmation(policy)
  if (confirmation === 'disabled') {
    return { outcome: 'deny', code: 'TOOL_DISABLED', reason: 'This tool is disabled by policy.' }
  }
  if (!ctx.toolEnabled) {
    return { outcome: 'deny', code: 'TOOL_DISABLED', reason: 'This tool is disabled in Atlas settings.' }
  }
  const missing = policy.requiredPermissions.filter((p) => !ctx.granted.has(p))
  if (missing.length > 0) {
    return { outcome: 'deny', code: 'PERMISSION_DENIED', reason: `Missing permission: ${missing.join(', ')}`, missing }
  }
  if (ctx.source === 'automation' && policy.riskLevel >= 3) {
    return { outcome: 'deny', code: 'PERMISSION_DENIED', reason: 'Automations cannot run security-sensitive actions.' }
  }
  if (confirmation === 'none') return { outcome: 'allow', confirmation }
  if (ctx.confirmed) return { outcome: 'allow', confirmation }
  return { outcome: 'confirm', confirmation }
}
