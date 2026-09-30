import { sql } from 'drizzle-orm'
import { bigint, boolean, index, integer, jsonb, pgTable, real, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, tsvector, tz } from './_columns'

export const audioAssets = pgTable('audio_assets', {
  id: id(),
  storageKey: text('storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  durationMs: integer('duration_ms'),
  sha256: text('sha256').notNull(),
  expiresAt: tz('expires_at'),
  deletedAt: tz('deleted_at'),
  createdAt: createdAt(),
})

export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    title: text('title').notNull(),
    startedAt: tz('started_at').notNull(),
    endedAt: tz('ended_at'),
    roomKey: text('room_key'),
    roomName: text('room_name'),
    status: text('status').$type<'recording' | 'processing' | 'complete' | 'failed'>().notNull().default('processing'),
    source: text('source').$type<'mock' | 'browser' | 'file_upload' | 'room_microphone'>().notNull(),
    participants: text('participants').array().notNull().default(sql`'{}'::text[]`),
    confidence: real('confidence'),
    audioAssetId: uuid('audio_asset_id').references(() => audioAssets.id, { onDelete: 'set null' }),
    error: text('error'),
    dedupeKey: text('dedupe_key'),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: createdAt(),
    search: tsvector('search').generatedAlwaysAs(sql`to_tsvector('english', coalesce("title", ''))`),
  },
  (t) => [
    index('conversations_started_idx').on(t.startedAt),
    uniqueIndex('conversations_dedupe_uq').on(t.dedupeKey),
    index('conversations_search_idx').using('gin', t.search),
  ],
)

export const conversationSegments = pgTable(
  'conversation_segments',
  {
    id: id(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    speakerLabel: text('speaker_label').notNull(),
    personId: uuid('person_id'),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    text: text('text').notNull(),
    confidence: real('confidence'),
    createdAt: createdAt(),
    search: tsvector('search').generatedAlwaysAs(sql`to_tsvector('english', coalesce("text", ''))`),
  },
  (t) => [
    uniqueIndex('conversation_segments_seq_uq').on(t.conversationId, t.seq),
    index('conversation_segments_search_idx').using('gin', t.search),
  ],
)

export const conversationSummaries = pgTable(
  'conversation_summaries',
  {
    id: id(),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'conversation' | 'daily' | 'range'>().notNull(),
    rangeStart: tz('range_start'),
    rangeEnd: tz('range_end'),
    /** Local date (YYYY-MM-DD) for daily summaries. */
    localDate: text('local_date'),
    summary: text('summary').notNull(),
    topics: text('topics').array().notNull().default(sql`'{}'::text[]`),
    decisions: jsonb('decisions').$type<string[]>().notNull().default([]),
    actionItems: jsonb('action_items').$type<string[]>().notNull().default([]),
    model: text('model'),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: createdAt(),
    search: tsvector('search').generatedAlwaysAs(sql`to_tsvector('english', coalesce("summary", ''))`),
  },
  (t) => [
    index('conversation_summaries_conv_idx').on(t.conversationId),
    uniqueIndex('conversation_summaries_daily_uq').on(t.kind, t.localDate),
    index('conversation_summaries_search_idx').using('gin', t.search),
  ],
)
