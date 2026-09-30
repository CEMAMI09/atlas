import { jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, id, tz, updatedAt } from './_columns'

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: updatedAt(),
})

export const serviceHeartbeats = pgTable(
  'service_heartbeats',
  {
    id: id(),
    service: text('service').$type<'api' | 'worker'>().notNull(),
    instanceId: text('instance_id').notNull(),
    version: text('version').notNull(),
    startedAt: tz('started_at').notNull(),
    lastBeatAt: tz('last_beat_at').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('service_heartbeats_service_uq').on(t.service)],
)
