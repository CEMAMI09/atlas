import { z } from 'zod'
import { IsoDateTime } from './common'

export const DeploymentState = z.enum(['queued', 'building', 'ready', 'error', 'canceled', 'unknown'])
export type DeploymentState = z.infer<typeof DeploymentState>

export const Deployment = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  url: z.string().nullable(),
  state: DeploymentState,
  target: z.enum(['production', 'preview', 'unknown']),
  branch: z.string().nullable(),
  commitMessage: z.string().nullable(),
  commitSha: z.string().nullable(),
  creator: z.string().nullable(),
  createdAt: IsoDateTime,
  readyAt: IsoDateTime.nullable(),
  buildDurationMs: z.number().nullable(),
  errorMessage: z.string().nullable(),
  inspectorUrl: z.string().nullable(),
})
export type Deployment = z.infer<typeof Deployment>

export const DeploymentProject = z.object({
  id: z.string(),
  name: z.string(),
  framework: z.string().nullable(),
  productionUrl: z.string().nullable(),
  latestDeployment: Deployment.nullable(),
  latestProductionDeployment: Deployment.nullable(),
  updatedAt: IsoDateTime.nullable(),
})
export type DeploymentProject = z.infer<typeof DeploymentProject>

export const StripeMode = z.enum(['test', 'live', 'mock'])
export type StripeMode = z.infer<typeof StripeMode>

export const Money = z.object({
  /** Integer amount in the currency's minor unit (cents). */
  amount: z.number().int(),
  currency: z.string().length(3),
})
export type Money = z.infer<typeof Money>

export const PaymentSummary = z.object({
  mode: StripeMode,
  currency: z.string().length(3),
  /**
   * Monthly recurring revenue: active + past_due subscriptions, each item normalized to a month
   * (annual ÷ 12, weekly × 52/12, daily × 365/12), after percent/amount coupons, excluding trials.
   */
  mrr: Money,
  activeSubscriptions: z.number().int(),
  trialingSubscriptions: z.number().int(),
  pastDueSubscriptions: z.number().int(),
  canceledLast30Days: z.number().int(),
  newSubscriptionsLast30Days: z.number().int(),
  customers: z.number().int().nullable(),
  succeededPayments30d: z.number().int(),
  failedPayments30d: z.number().int(),
  grossVolume30d: Money,
  /** Other currencies are excluded from MRR totals and listed here instead of being mixed in. */
  excludedCurrencies: z.array(z.string()),
  computedAt: IsoDateTime,
  truncated: z.boolean(),
})
export type PaymentSummary = z.infer<typeof PaymentSummary>

export const Payment = z.object({
  id: z.string(),
  status: z.enum(['succeeded', 'failed', 'pending', 'refunded', 'canceled']),
  amount: Money,
  customerLabel: z.string().nullable(),
  description: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdAt: IsoDateTime,
})
export type Payment = z.infer<typeof Payment>

export const Subscription = z.object({
  id: z.string(),
  status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']),
  customerLabel: z.string().nullable(),
  planLabel: z.string().nullable(),
  monthlyAmount: Money,
  interval: z.string().nullable(),
  createdAt: IsoDateTime,
  canceledAt: IsoDateTime.nullable(),
  currentPeriodEnd: IsoDateTime.nullable(),
})
export type Subscription = z.infer<typeof Subscription>

export const ProjectHealth = z.enum(['healthy', 'degraded', 'failing', 'unknown'])
export type ProjectHealth = z.infer<typeof ProjectHealth>

/** Generic project view (e.g. Struct) assembled from deployments, payments and health checks. */
export const ProjectStatus = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  health: ProjectHealth,
  healthReasons: z.array(z.string()),
  deployments: z.object({
    available: z.boolean(),
    latest: Deployment.nullable(),
    latestProduction: Deployment.nullable(),
    failedLast7Days: z.number().int(),
    recent: z.array(Deployment),
  }),
  payments: z.object({
    available: z.boolean(),
    summary: PaymentSummary.nullable(),
    recentFailures: z.array(Payment),
  }),
  healthChecks: z.array(
    z.object({ name: z.string(), ok: z.boolean().nullable(), checkedAt: IsoDateTime.nullable(), detail: z.string().nullable() }),
  ),
  isMock: z.boolean(),
  updatedAt: IsoDateTime,
})
export type ProjectStatus = z.infer<typeof ProjectStatus>
