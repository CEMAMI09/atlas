import Stripe from 'stripe'
import { AtlasError, type Payment, type PaymentSummary, type Subscription } from '@atlas/shared'
import { stripeReadPath } from '../readonly'

export interface StripeReadResult {
  summary: PaymentSummary
  payments: Payment[]
  subscriptions: Subscription[]
}

/** Read-only Stripe calls. The client has no refund, payout, or charge methods exposed here. */
export async function readStripe(restrictedKey: string): Promise<StripeReadResult> {
  stripeReadPath('/v1/subscriptions')
  const stripe = new Stripe(restrictedKey, { timeout: 12_000, maxNetworkRetries: 1 })
  const livemode = /_live_/.test(restrictedKey)
  const [subscriptionList, paymentList] = await Promise.all([
    stripe.subscriptions.list({ status: 'all', limit: 100 }).catch((error: unknown) => failStripe(error)),
    stripe.paymentIntents.list({ limit: 20 }).catch((error: unknown) => failStripe(error)),
  ])
  const now = Date.now()
  const day30 = now - 30 * 24 * 3_600_000
  const subscriptions = subscriptionList.data.map(toSubscription)
  const payments = paymentList.data.map(toPayment)
  const billable = subscriptions.filter((item) => item.status === 'active' || item.status === 'past_due')
  const currencies = new Set(billable.map((item) => item.monthlyAmount.currency))
  const currency = currencies.has('usd') || currencies.size === 0 ? 'usd' : ([...currencies][0] ?? 'usd')
  const excluded = [...currencies].filter((item) => item !== currency)
  const mrr = billable.filter((item) => item.monthlyAmount.currency === currency).reduce((sum, item) => sum + item.monthlyAmount.amount, 0)
  const succeeded = payments.filter((item) => item.status === 'succeeded' && Date.parse(item.createdAt) >= day30)
  const failed = payments.filter((item) => item.status === 'failed' && Date.parse(item.createdAt) >= day30)
  const summary: PaymentSummary = {
    mode: livemode ? 'live' : 'test',
    currency,
    mrr: { amount: mrr, currency },
    activeSubscriptions: subscriptions.filter((item) => item.status === 'active').length,
    trialingSubscriptions: subscriptions.filter((item) => item.status === 'trialing').length,
    pastDueSubscriptions: subscriptions.filter((item) => item.status === 'past_due').length,
    canceledLast30Days: subscriptions.filter((item) => item.canceledAt && Date.parse(item.canceledAt) >= day30).length,
    newSubscriptionsLast30Days: subscriptions.filter((item) => Date.parse(item.createdAt) >= day30 && item.status !== 'canceled').length,
    customers: null,
    succeededPayments30d: succeeded.length,
    failedPayments30d: failed.length,
    grossVolume30d: {
      amount: succeeded.filter((item) => item.amount.currency === currency).reduce((sum, item) => sum + item.amount.amount, 0),
      currency,
    },
    excludedCurrencies: excluded,
    computedAt: new Date().toISOString(),
    truncated: subscriptionList.has_more || paymentList.has_more,
  }
  return { summary, payments, subscriptions }
}

function toSubscription(subscription: Stripe.Subscription): Subscription {
  const item = subscription.items.data[0]
  const price = item?.price
  const interval = price?.recurring?.interval ?? null
  const count = price?.recurring?.interval_count ?? 1
  const unit = price?.unit_amount ?? 0
  const currency = price?.currency ?? 'usd'
  return {
    id: subscription.id,
    status: mapSubscriptionStatus(subscription.status),
    customerLabel: typeof subscription.customer === 'string' ? subscription.customer : (subscription.customer?.id ?? null),
    planLabel: price?.nickname ?? price?.id ?? null,
    monthlyAmount: { amount: monthlyAmount(unit, interval, count), currency },
    interval,
    createdAt: unix(subscription.created),
    canceledAt: subscription.canceled_at ? unix(subscription.canceled_at) : null,
    currentPeriodEnd: item?.current_period_end ? unix(item.current_period_end) : null,
  }
}

function toPayment(intent: Stripe.PaymentIntent): Payment {
  const failed = intent.last_payment_error?.message ?? null
  return {
    id: intent.id,
    status: mapPaymentStatus(intent.status),
    amount: { amount: intent.amount, currency: intent.currency },
    customerLabel: typeof intent.customer === 'string' ? intent.customer : null,
    description: intent.description,
    failureReason: failed,
    createdAt: unix(intent.created),
  }
}

function monthlyAmount(unit: number, interval: string | null, count: number): number {
  if (!interval || interval === 'month') return Math.round(unit / Math.max(1, count))
  if (interval === 'year') return Math.round(unit / (12 * Math.max(1, count)))
  if (interval === 'week') return Math.round((unit * 52) / (12 * Math.max(1, count)))
  if (interval === 'day') return Math.round((unit * 365) / (12 * Math.max(1, count)))
  return unit
}

function mapSubscriptionStatus(status: string): Subscription['status'] {
  if (status === 'trialing' || status === 'active' || status === 'past_due' || status === 'canceled' || status === 'unpaid' || status === 'incomplete' || status === 'incomplete_expired' || status === 'paused') {
    return status
  }
  return 'incomplete'
}

function mapPaymentStatus(status: Stripe.PaymentIntent.Status): Payment['status'] {
  if (status === 'succeeded') return 'succeeded'
  if (status === 'canceled') return 'canceled'
  if (status === 'requires_payment_method' || status === 'requires_action') return 'failed'
  return 'pending'
}

function unix(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

function failStripe(error: unknown): never {
  const message = error instanceof Error ? error.message : 'Stripe request failed'
  const safe = message.replace(/sk_[A-Za-z0-9_]+/g, '[redacted]').replace(/rk_[A-Za-z0-9_]+/g, '[redacted]').slice(0, 240)
  throw new AtlasError('PROVIDER_ERROR', `Stripe could not be read. ${safe}`)
}
