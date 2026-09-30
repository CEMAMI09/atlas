import { z } from 'zod'
import { IsoDateTime, JsonRecord, SourceLink } from './common'

export const EventCategory = z.enum([
  'calendar',
  'email',
  'deployment',
  'payment',
  'presence',
  'door',
  'camera',
  'security',
  'conversation',
  'device',
  'task',
  'automation',
  'integration',
  'system',
  'atlas',
])
export type EventCategory = z.infer<typeof EventCategory>

export const EventSeverity = z.enum(['debug', 'info', 'notice', 'warning', 'critical'])
export type EventSeverity = z.infer<typeof EventSeverity>

export const SEVERITY_RANK: Record<EventSeverity, number> = {
  debug: 0,
  info: 1,
  notice: 2,
  warning: 3,
  critical: 4,
}

export const EventActor = z.object({
  kind: z.enum(['person', 'system', 'integration', 'device', 'unknown']),
  id: z.string().max(200).nullable().default(null),
  name: z.string().max(200),
})
export type EventActor = z.infer<typeof EventActor>

export const EventLocation = z.object({
  roomId: z.string().max(100).nullable().default(null),
  name: z.string().max(200),
})
export type EventLocation = z.infer<typeof EventLocation>

/** Namespaced event type such as `vercel.deployment.failed`. */
export const EventType = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'Event type must be dotted lowercase segments')

/** The universal, provider-neutral event shape. The UI never depends on provider payloads. */
export const AtlasEvent = z.object({
  id: z.uuid(),
  timestamp: IsoDateTime,
  source: z.string().min(1).max(60),
  category: EventCategory,
  type: EventType,
  title: z.string().min(1).max(240),
  summary: z.string().max(4000).nullable(),
  severity: EventSeverity,
  actor: EventActor.nullable(),
  location: EventLocation.nullable(),
  entityId: z.string().max(300).nullable(),
  metadata: JsonRecord,
  links: z.array(SourceLink).max(10),
  correlationId: z.string().max(200).nullable(),
  isMock: z.boolean(),
})
export type AtlasEvent = z.infer<typeof AtlasEvent>

/** What integrations and services hand to the event pipeline. The pipeline assigns id/defaults. */
export const AtlasEventDraft = z.object({
  timestamp: IsoDateTime,
  source: z.string().min(1).max(60),
  category: EventCategory.optional(),
  type: EventType,
  title: z.string().min(1).max(240),
  summary: z.string().max(4000).nullable().optional(),
  severity: EventSeverity.optional(),
  actor: EventActor.nullable().optional(),
  location: EventLocation.nullable().optional(),
  entityId: z.string().max(300).nullable().optional(),
  metadata: JsonRecord.optional(),
  links: z.array(SourceLink).max(10).optional(),
  correlationId: z.string().max(200).nullable().optional(),
  /** Stable key that makes ingestion idempotent (e.g. `stripe:evt_123`). */
  dedupeKey: z.string().max(300).nullable().optional(),
  isMock: z.boolean().optional(),
})
export type AtlasEventDraft = z.infer<typeof AtlasEventDraft>

interface EventTypeInfo {
  category: EventCategory
  severity: EventSeverity
  label: string
}

/** Known event types. Unknown namespaced types are allowed but must provide a category. */
export const EVENT_TYPES = {
  'calendar.event.created': { category: 'calendar', severity: 'info', label: 'Calendar event created' },
  'calendar.event.updated': { category: 'calendar', severity: 'info', label: 'Calendar event updated' },
  'calendar.event.started': { category: 'calendar', severity: 'info', label: 'Calendar event started' },
  'email.received': { category: 'email', severity: 'debug', label: 'Email received' },
  'email.important': { category: 'email', severity: 'notice', label: 'Important email' },
  'vercel.deployment.created': { category: 'deployment', severity: 'debug', label: 'Deployment started' },
  'vercel.deployment.ready': { category: 'deployment', severity: 'info', label: 'Deployment ready' },
  'vercel.deployment.failed': { category: 'deployment', severity: 'warning', label: 'Deployment failed' },
  'vercel.deployment.canceled': { category: 'deployment', severity: 'info', label: 'Deployment canceled' },
  'stripe.payment.succeeded': { category: 'payment', severity: 'info', label: 'Payment succeeded' },
  'stripe.payment.failed': { category: 'payment', severity: 'warning', label: 'Payment failed' },
  'stripe.subscription.created': { category: 'payment', severity: 'notice', label: 'New subscription' },
  'stripe.subscription.updated': { category: 'payment', severity: 'info', label: 'Subscription updated' },
  'stripe.subscription.canceled': { category: 'payment', severity: 'notice', label: 'Subscription canceled' },
  'stripe.customer.created': { category: 'payment', severity: 'info', label: 'New customer' },
  'room.presence.entered': { category: 'presence', severity: 'info', label: 'Entered room' },
  'room.presence.exited': { category: 'presence', severity: 'info', label: 'Left room' },
  'room.presence.uncertain': { category: 'presence', severity: 'debug', label: 'Presence uncertain' },
  'door.opened': { category: 'door', severity: 'info', label: 'Door opened' },
  'door.closed': { category: 'door', severity: 'debug', label: 'Door closed' },
  'door.locked': { category: 'door', severity: 'info', label: 'Door locked' },
  'door.unlocked': { category: 'door', severity: 'notice', label: 'Door unlocked' },
  'camera.motion.detected': { category: 'camera', severity: 'notice', label: 'Motion detected' },
  'camera.clip.recorded': { category: 'camera', severity: 'info', label: 'Clip recorded' },
  'camera.offline': { category: 'camera', severity: 'warning', label: 'Camera offline' },
  'security.armed': { category: 'security', severity: 'notice', label: 'Security armed' },
  'security.disarmed': { category: 'security', severity: 'notice', label: 'Security disarmed' },
  'security.alarm.triggered': { category: 'security', severity: 'critical', label: 'Alarm triggered' },
  'conversation.started': { category: 'conversation', severity: 'debug', label: 'Conversation started' },
  'conversation.ended': { category: 'conversation', severity: 'info', label: 'Conversation ended' },
  'conversation.summarized': { category: 'conversation', severity: 'info', label: 'Conversation summary' },
  'device.online': { category: 'device', severity: 'info', label: 'Device online' },
  'device.offline': { category: 'device', severity: 'warning', label: 'Device offline' },
  'device.state_changed': { category: 'device', severity: 'debug', label: 'Device state changed' },
  'device.battery_low': { category: 'device', severity: 'warning', label: 'Battery low' },
  'task.created': { category: 'task', severity: 'info', label: 'Task created' },
  'task.completed': { category: 'task', severity: 'info', label: 'Task completed' },
  'task.suggested': { category: 'task', severity: 'info', label: 'Task suggested' },
  'automation.triggered': { category: 'automation', severity: 'info', label: 'Automation ran' },
  'automation.failed': { category: 'automation', severity: 'warning', label: 'Automation failed' },
  'integration.connected': { category: 'integration', severity: 'info', label: 'Integration connected' },
  'integration.disconnected': { category: 'integration', severity: 'notice', label: 'Integration disconnected' },
  'integration.error': { category: 'integration', severity: 'warning', label: 'Integration error' },
  'system.started': { category: 'system', severity: 'info', label: 'Atlas started' },
  'system.warning': { category: 'system', severity: 'warning', label: 'System warning' },
  'atlas.action.executed': { category: 'atlas', severity: 'info', label: 'Atlas action' },
  'atlas.action.denied': { category: 'atlas', severity: 'notice', label: 'Atlas action denied' },
} as const satisfies Record<string, EventTypeInfo>

export type KnownEventType = keyof typeof EVENT_TYPES

export function getEventTypeInfo(type: string): EventTypeInfo | undefined {
  return (EVENT_TYPES as Record<string, EventTypeInfo>)[type]
}

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  calendar: 'Calendar',
  email: 'Email',
  deployment: 'Deployments',
  payment: 'Payments',
  presence: 'Presence',
  door: 'Doors',
  camera: 'Cameras',
  security: 'Security',
  conversation: 'Conversations',
  device: 'Devices',
  task: 'Tasks',
  automation: 'Automations',
  integration: 'Integrations',
  system: 'System',
  atlas: 'Atlas',
}

export const TimelineQuery = z.object({
  start: IsoDateTime.optional(),
  end: IsoDateTime.optional(),
  sources: z.array(z.string().max(60)).max(20).optional(),
  categories: z.array(EventCategory).max(20).optional(),
  minSeverity: EventSeverity.optional(),
  severities: z.array(EventSeverity).max(5).optional(),
  actor: z.string().max(200).optional(),
  roomId: z.string().max(100).optional(),
  q: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  /** Opaque cursor for older pages: `<iso timestamp>|<id>`. */
  before: z.string().max(200).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
})
export type TimelineQuery = z.infer<typeof TimelineQuery>

export const TimelinePage = z.object({
  events: z.array(AtlasEvent),
  nextCursor: z.string().nullable(),
})
export type TimelinePage = z.infer<typeof TimelinePage>
