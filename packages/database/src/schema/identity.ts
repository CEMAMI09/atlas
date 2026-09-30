import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, tz, updatedAt } from './_columns'

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    /** argon2id PHC string; nullable for future passkey-only accounts. */
    passwordHash: text('password_hash'),
    role: text('role').$type<'owner' | 'member'>().notNull().default('owner'),
    timezone: text('timezone').notNull().default('UTC'),
    onboarding: jsonb('onboarding').$type<Record<string, 'pending' | 'done' | 'skipped'>>().notNull().default({}),
    onboardingCompletedAt: tz('onboarding_completed_at'),
    lastLoginAt: tz('last_login_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the opaque session token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    /** Per-session CSRF token, AES-GCM encrypted. */
    csrfTokenEnc: text('csrf_token_enc').notNull(),
    clientType: text('client_type').$type<'web' | 'native'>().notNull().default('web'),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    createdAt: createdAt(),
    lastSeenAt: tz('last_seen_at').notNull().defaultNow(),
    expiresAt: tz('expires_at').notNull(),
    revokedAt: tz('revoked_at'),
  },
  (t) => [uniqueIndex('sessions_token_hash_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
)

export const webauthnCredentials = pgTable(
  'webauthn_credentials',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull(),
    publicKey: text('public_key').notNull(),
    signCount: integer('sign_count').notNull().default(0),
    transports: text('transports').array().notNull().default(sql`'{}'::text[]`),
    label: text('label'),
    createdAt: createdAt(),
    lastUsedAt: tz('last_used_at'),
  },
  (t) => [uniqueIndex('webauthn_credential_id_uq').on(t.credentialId)],
)

export const people = pgTable('people', {
  id: id(),
  name: text('name').notNull(),
  kind: text('kind').$type<'owner' | 'household' | 'guest' | 'unknown'>().notNull().default('unknown'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  isMock: boolean('is_mock').notNull().default(false),
  createdAt: createdAt(),
})
