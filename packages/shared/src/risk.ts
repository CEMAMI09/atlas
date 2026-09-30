import { z } from 'zod'

/**
 * LEVEL_0 read-only · LEVEL_1 low-risk reversible · LEVEL_2 meaningful modification ·
 * LEVEL_3 security-sensitive · LEVEL_4 financial/destructive/critical (disabled globally).
 */
export const RiskLevel = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
export type RiskLevel = z.infer<typeof RiskLevel>

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  0: 'Read-only',
  1: 'Low risk',
  2: 'Modification',
  3: 'Security-sensitive',
  4: 'Critical',
}

export const SideEffect = z.enum([
  'none',
  'internal_write',
  'external_write',
  'physical_control',
  'security_control',
  'financial',
])
export type SideEffect = z.infer<typeof SideEffect>

/**
 * none         — executes immediately
 * confirm      — requires an explicit approval from the user (single action)
 * strong       — requires typed confirmation; designed for future biometric/physical confirmation
 * disabled     — never executes
 */
export const ConfirmationPolicy = z.enum(['none', 'confirm', 'strong', 'disabled'])
export type ConfirmationPolicy = z.infer<typeof ConfirmationPolicy>

export const Permission = z.enum([
  'calendar:read',
  'calendar:write',
  'email:read',
  'timeline:read',
  'tasks:read',
  'tasks:write',
  'home:read',
  'home:control',
  'security:read',
  'security:arm',
  'security:disarm',
  'cameras:read',
  'deployments:read',
  'payments:read',
  'conversations:read',
  'memory:read',
  'memory:write',
  'system:read',
])
export type Permission = z.infer<typeof Permission>

export const ALL_PERMISSIONS: readonly Permission[] = Permission.options

export const ToolInvocationSource = z.enum(['chat', 'api', 'automation', 'widget'])
export type ToolInvocationSource = z.infer<typeof ToolInvocationSource>

export const ToolResultStatus = z.enum([
  'success',
  'error',
  'denied',
  'disabled',
  'pending_confirmation',
  'rejected',
  'expired',
])
export type ToolResultStatus = z.infer<typeof ToolResultStatus>

export const ConfirmationState = z.enum(['not_required', 'required', 'approved', 'rejected', 'expired'])
export type ConfirmationState = z.infer<typeof ConfirmationState>

/** Public description of a tool, used by settings screens and chat tool cards. */
export const ToolDescriptor = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  riskLevel: RiskLevel,
  sideEffect: SideEffect,
  confirmationPolicy: ConfirmationPolicy,
  requiredPermissions: z.array(Permission),
  enabled: z.boolean(),
  integration: z.string().nullable(),
})
export type ToolDescriptor = z.infer<typeof ToolDescriptor>
