import { boolean, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, tz, updatedAt } from './_columns'
import { sessions, users } from './identity'

export const integrationConnections = pgTable(
  'integration_connections',
  {
    id: id(),
    provider: text('provider').notNull(),
    modeOverride: text('mode_override').$type<'auto' | 'mock' | 'live' | 'disabled'>().notNull().default('auto'),
    status: text('status').$type<'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'MOCK'>().notNull().default('DISCONNECTED'),
    /** Non-secret configuration only (e.g. tracked project ids, discovered entity counts). */
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    grantedScopes: text('granted_scopes').array().notNull().default([]),
    accountLabel: text('account_label'),
    lastSyncAt: tz('last_sync_at'),
    lastSuccessAt: tz('last_success_at'),
    lastError: text('last_error'),
    lastErrorAt: tz('last_error_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('integration_connections_provider_uq').on(t.provider)],
)

export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: id(),
    provider: text('provider').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountEmail: text('account_email'),
    accessTokenEnc: text('access_token_enc'),
    refreshTokenEnc: text('refresh_token_enc'),
    scope: text('scope'),
    expiresAt: tz('expires_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('oauth_tokens_provider_user_uq').on(t.provider, t.userId)],
)

export const oauthStates = pgTable(
  'oauth_states',
  {
    id: id(),
    provider: text('provider').notNull(),
    stateHash: text('state_hash').notNull(),
    codeVerifierEnc: text('code_verifier_enc').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    redirectAfter: text('redirect_after'),
    createdAt: createdAt(),
    expiresAt: tz('expires_at').notNull(),
    consumedAt: tz('consumed_at'),
  },
  (t) => [uniqueIndex('oauth_states_state_hash_uq').on(t.stateHash)],
)

export const integrationSyncState = pgTable(
  'integration_sync_state',
  {
    id: id(),
    provider: text('provider').notNull(),
    key: text('key').notNull(),
    cursor: text('cursor'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('integration_sync_state_provider_key_uq').on(t.provider, t.key)],
)

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    type: text('type').notNull(),
    livemode: boolean('livemode'),
    status: text('status').$type<'received' | 'processed' | 'ignored' | 'failed'>().notNull().default('received'),
    receivedAt: tz('received_at').notNull().defaultNow(),
    processedAt: tz('processed_at'),
    error: text('error'),
  },
  (t) => [uniqueIndex('webhook_events_provider_external_uq').on(t.provider, t.externalId)],
)

/**
 * Normalised cache of provider objects (calendar events, emails, deployments, Stripe objects...).
 * Mock providers read seeded rows (`is_mock = true`); live providers may cache synced snapshots.
 * `data` always holds the Atlas-neutral shape from `@atlas/shared`, never raw provider payloads.
 */
export const providerRecords = pgTable(
  'provider_records',
  {
    id: id(),
    provider: text('provider').notNull(),
    kind: text('kind').notNull(),
    externalId: text('external_id').notNull(),
    occurredAt: tz('occurred_at'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('provider_records_uq').on(t.provider, t.kind, t.externalId, t.isMock),
    index('provider_records_kind_time_idx').on(t.provider, t.kind, t.occurredAt),
  ],
)
