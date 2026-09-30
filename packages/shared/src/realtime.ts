import { z } from 'zod'
import { IsoDateTime } from './common'
import { PrivacyStatus } from './conversations'
import { AtlasEvent } from './events'
import { Device } from './home'
import { IntegrationStatus } from './integrations'
import { MetricSample } from './system'
import { Task } from './tasks'
import { Breakpoint } from './widgets'

/**
 * Data keys clients cache by. `invalidate` messages name the keys whose server data changed so
 * widgets refetch once — instead of every component polling.
 */
export const DataKey = z.enum([
  'overview',
  'events',
  'tasks',
  'calendar',
  'email',
  'room',
  'security',
  'devices',
  'cameras',
  'presence',
  'deployments',
  'payments',
  'projects',
  'conversations',
  'integrations',
  'system',
  'settings',
  'weather',
  'automations',
  'memories',
  'privacy',
])
export type DataKey = z.infer<typeof DataKey>

export const RealtimeMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), serverTime: IsoDateTime, transport: z.enum(['notify', 'poll', 'hybrid']) }),
  z.object({ type: z.literal('event.created'), event: AtlasEvent }),
  z.object({ type: z.literal('device.updated'), device: Device }),
  z.object({ type: z.literal('integration.status'), integration: IntegrationStatus }),
  z.object({
    type: z.literal('task.changed'),
    action: z.enum(['created', 'updated', 'completed', 'deleted']),
    taskId: z.uuid(),
    task: Task.nullable(),
  }),
  z.object({
    type: z.literal('camera.motion'),
    cameraId: z.string(),
    cameraName: z.string(),
    occurredAt: IsoDateTime,
    eventId: z.uuid().nullable(),
  }),
  z.object({ type: z.literal('system.metrics'), sample: MetricSample }),
  z.object({ type: z.literal('privacy.changed'), privacy: PrivacyStatus }),
  z.object({ type: z.literal('layout.saved'), breakpoint: Breakpoint, version: z.number().int() }),
  z.object({ type: z.literal('invalidate'), keys: z.array(DataKey).min(1) }),
  z.object({ type: z.literal('pong'), serverTime: IsoDateTime }),
])
export type RealtimeMessage = z.infer<typeof RealtimeMessage>

export const RealtimeClientMessage = z.discriminatedUnion('type', [z.object({ type: z.literal('ping') })])
export type RealtimeClientMessage = z.infer<typeof RealtimeClientMessage>
