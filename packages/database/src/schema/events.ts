import { sql } from 'drizzle-orm'
import { bigserial, boolean, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, tsvector, tz } from './_columns'

export const eventSources = pgTable(
  'event_sources',
  {
    id: id(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<'integration' | 'atlas' | 'device' | 'system'>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('event_sources_key_uq').on(t.key)],
)

export const events = pgTable(
  'events',
  {
    id: id(),
    occurredAt: tz('occurred_at').notNull(),
    ingestedAt: tz('ingested_at').notNull().defaultNow(),
    source: text('source').notNull(),
    category: text('category').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    severity: text('severity').notNull(),
    actor: jsonb('actor').$type<{ kind: string; id: string | null; name: string } | null>(),
    location: jsonb('location').$type<{ roomId: string | null; name: string } | null>(),
    roomKey: text('room_key'),
    entityId: text('entity_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    links: jsonb('links').$type<{ label: string; url: string }[]>().notNull().default([]),
    correlationId: text('correlation_id'),
    dedupeKey: text('dedupe_key'),
    isMock: boolean('is_mock').notNull().default(false),
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("summary", '')), 'B')`,
    ),
  },
  (t) => [
    index('events_occurred_idx').on(t.occurredAt.desc(), t.id.desc()),
    index('events_category_occurred_idx').on(t.category, t.occurredAt),
    index('events_source_occurred_idx').on(t.source, t.occurredAt),
    uniqueIndex('events_dedupe_uq').on(t.dedupeKey),
    index('events_search_idx').using('gin', t.search),
  ],
)

export const cameraEvents = pgTable(
  'camera_events',
  {
    id: id(),
    cameraId: text('camera_id').notNull(),
    cameraName: text('camera_name').notNull(),
    kind: text('kind').$type<'motion' | 'person' | 'clip' | 'offline' | 'online'>().notNull(),
    occurredAt: tz('occurred_at').notNull(),
    /** Opaque reference to media held by the provider (never a signed URL). */
    mediaRef: text('media_ref'),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('camera_events_camera_time_idx').on(t.cameraId, t.occurredAt)],
)

export const securityEvents = pgTable(
  'security_events',
  {
    id: id(),
    kind: text('kind').$type<'armed' | 'disarmed' | 'triggered' | 'door' | 'lock'>().notNull(),
    mode: text('mode'),
    occurredAt: tz('occurred_at').notNull(),
    actor: text('actor'),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('security_events_time_idx').on(t.occurredAt)],
)

/**
 * Cross-process realtime delivery. Publishers insert here (and NOTIFY when available); API
 * processes tail by id. Rows are pruned after a short window.
 */
export const realtimeOutbox = pgTable(
  'realtime_outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    origin: text('origin').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('realtime_outbox_created_idx').on(t.createdAt)],
)
