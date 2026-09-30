import { eq, sql } from 'drizzle-orm'
import { hash, verify } from '@node-rs/argon2'
import { sessions, users, type Database } from '@atlas/database'
import { AtlasError, PublicUser, type PublicUser as User, type SetupInput } from '@atlas/shared'
import { decryptString, encryptString, randomToken, sha256 } from './crypto'

const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 }

export interface SessionRecord {
  sessionId: string
  user: User
  csrfToken: string
  expiresAt: Date
}

export async function userCount(db: Database): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(users)
  return rows[0]?.count ?? 0
}

export async function createOwner(db: Database, input: SetupInput, encryptionKey: Buffer, idleMinutes: number): Promise<{ user: User; token: string; csrfToken: string; expiresAt: Date }> {
  if ((await userCount(db)) > 0) throw new AtlasError('CONFLICT', 'Atlas already has an account.')
  const passwordHash = await hash(input.password, ARGON)
  const inserted = await db
    .insert(users)
    .values({
      email: input.email.trim().toLowerCase(),
      displayName: input.name.trim(),
      passwordHash,
      timezone: input.timezone,
      role: 'owner',
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new AtlasError('INTERNAL', 'Account was not created.')
  const session = await openSession(db, row.id, encryptionKey, idleMinutes, 'web', null)
  return { user: toPublicUser(row), ...session }
}

export async function login(
  db: Database,
  email: string,
  password: string,
  encryptionKey: Buffer,
  idleMinutes: number,
): Promise<{ user: User; token: string; csrfToken: string; expiresAt: Date }> {
  const rows = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1)
  const row = rows[0]
  if (!row?.passwordHash || !(await verify(row.passwordHash, password))) {
    throw new AtlasError('UNAUTHENTICATED', 'Email or password is incorrect.')
  }
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id))
  const session = await openSession(db, row.id, encryptionKey, idleMinutes, 'web', null)
  return { user: toPublicUser(row), ...session }
}

export async function readSession(db: Database, token: string, encryptionKey: Buffer): Promise<SessionRecord | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.tokenHash, sha256(token))).limit(1)
  const session = rows[0]
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null
  const userRows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
  const user = userRows[0]
  if (!user) return null
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id))
  try {
    const csrfToken = decryptString(encryptionKey, session.csrfTokenEnc)
    return { sessionId: session.id, user: toPublicUser(user), csrfToken, expiresAt: session.expiresAt }
  } catch {
    return null
  }
}

export async function revokeSession(db: Database, token: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)))
}

export async function updateProfile(db: Database, userId: string, patch: { name?: string; timezone?: string }): Promise<User> {
  const updated = await db
    .update(users)
    .set({
      ...(patch.name ? { displayName: patch.name } : {}),
      ...(patch.timezone ? { timezone: patch.timezone } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning()
  const row = updated[0]
  if (!row) throw new AtlasError('NOT_FOUND', 'Account was not found.')
  return toPublicUser(row)
}

export async function changePassword(db: Database, userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  const row = rows[0]
  if (!row?.passwordHash || !(await verify(row.passwordHash, currentPassword))) {
    throw new AtlasError('UNAUTHENTICATED', 'Current password is incorrect.')
  }
  await db.update(users).set({ passwordHash: await hash(newPassword, ARGON), updatedAt: new Date() }).where(eq(users.id, userId))
}

export async function completeOnboarding(db: Database, userId: string): Promise<void> {
  await db.update(users).set({ onboardingCompletedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId))
}

export function toPublicUser(row: typeof users.$inferSelect): User {
  const user = {
    id: row.id,
    name: row.displayName,
    email: row.email,
    timezone: row.timezone,
    initials: initials(row.displayName),
    onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
  return PublicUser.parse(user)
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'A'
}

async function openSession(db: Database, userId: string, encryptionKey: Buffer, idleMinutes: number, clientType: 'web' | 'native', userAgent: string | null) {
  const token = randomToken(32)
  const csrfToken = randomToken(24)
  const expiresAt = new Date(Date.now() + idleMinutes * 60_000)
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    csrfTokenEnc: encryptString(encryptionKey, csrfToken),
    clientType,
    userAgent,
    expiresAt,
  })
  return { token, csrfToken, expiresAt }
}
