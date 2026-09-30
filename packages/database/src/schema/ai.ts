import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, real, smallint, text, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core'
import { createdAt, id, tsvector, tz, updatedAt } from './_columns'
import { users } from './identity'

export const chatThreads = pgTable(
  'chat_threads',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New conversation'),
    lastMessageAt: tz('last_message_at').notNull().defaultNow(),
    archivedAt: tz('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('chat_threads_user_last_idx').on(t.userId, t.lastMessageAt)],
)

export const chatMessages = pgTable(
  'chat_messages',
  {
    /** AI SDK UI message id. */
    id: text('id').primaryKey(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => chatThreads.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    parts: jsonb('parts').$type<unknown[]>().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    modelId: text('model_id'),
    modelTier: text('model_tier'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('chat_messages_thread_seq_uq').on(t.threadId, t.seq)],
)

export const toolAuditLog = pgTable(
  'tool_audit_log',
  {
    id: id(),
    requestId: text('request_id').notNull(),
    correlationId: text('correlation_id'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    tool: text('tool').notNull(),
    riskLevel: smallint('risk_level').notNull(),
    sideEffect: text('side_effect').notNull(),
    /** Parameters with secrets and long free text redacted. */
    parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull().default({}),
    resultStatus: text('result_status').notNull(),
    errorCode: text('error_code'),
    confirmationState: text('confirmation_state').notNull(),
    confirmationId: uuid('confirmation_id'),
    durationMs: integer('duration_ms').notNull(),
    invocationSource: text('invocation_source').notNull(),
    threadId: uuid('thread_id'),
    dataMode: text('data_mode'),
    createdAt: createdAt(),
  },
  (t) => [index('tool_audit_created_idx').on(t.createdAt), index('tool_audit_tool_idx').on(t.tool, t.createdAt)],
)

export const toolConfirmations = pgTable(
  'tool_confirmations',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tool: text('tool').notNull(),
    /** Validated input exactly as it will execute. Server-side only; clients cannot alter it. */
    parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull(),
    paramsHash: text('params_hash').notNull(),
    riskLevel: smallint('risk_level').notNull(),
    policy: text('policy').$type<'confirm' | 'strong'>().notNull(),
    summary: text('summary').notNull(),
    phrase: text('phrase'),
    status: text('status').$type<'pending' | 'approved' | 'rejected' | 'expired' | 'failed'>().notNull().default('pending'),
    result: jsonb('result').$type<Record<string, unknown> | null>(),
    requestId: text('request_id').notNull(),
    threadId: uuid('thread_id'),
    toolCallId: text('tool_call_id'),
    invocationSource: text('invocation_source').notNull(),
    expiresAt: tz('expires_at').notNull(),
    decidedAt: tz('decided_at'),
    createdAt: createdAt(),
  },
  (t) => [index('tool_confirmations_user_status_idx').on(t.userId, t.status)],
)

export const memories = pgTable(
  'memories',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    content: text('content').notNull(),
    source: text('source').notNull(),
    sourceRef: text('source_ref'),
    confidence: real('confidence').notNull().default(1),
    pinned: boolean('pinned').notNull().default(false),
    status: text('status').$type<'active' | 'archived'>().notNull().default('active'),
    lastUsedAt: tz('last_used_at'),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    search: tsvector('search').generatedAlwaysAs(sql`to_tsvector('english', coalesce("content", ''))`),
  },
  (t) => [index('memories_user_idx').on(t.userId, t.status), index('memories_search_idx').using('gin', t.search)],
)

export const EMBEDDING_DIMENSIONS = 1536

export const embeddings = pgTable(
  'embeddings',
  {
    id: id(),
    ownerType: text('owner_type').notNull(),
    ownerId: text('owner_id').notNull(),
    model: text('model').notNull(),
    contentHash: text('content_hash').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('embeddings_owner_model_uq').on(t.ownerType, t.ownerId, t.model),
    index('embeddings_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
)
