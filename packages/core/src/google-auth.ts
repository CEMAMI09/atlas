import { and, eq } from 'drizzle-orm'
import { oauthStates, oauthTokens, type Database } from '@atlas/database'
import {
  exchangeGoogleCode,
  googleAccountEmail,
  googleAuthUrl,
  refreshGoogleAccessToken,
} from '@atlas/integrations'
import { AtlasError } from '@atlas/shared'
import type { AtlasConfig } from '@atlas/config'
import { createHash, randomBytes } from 'node:crypto'
import { decryptString, encryptString, sha256 } from './crypto'

export async function startGoogleOAuth(db: Database, config: AtlasConfig, userId: string, sessionId: string | null): Promise<string> {
  const clientId = config.env.GOOGLE_CLIENT_ID
  const redirectUri = config.env.GOOGLE_REDIRECT_URI
  if (!clientId || !redirectUri || !config.env.GOOGLE_CLIENT_SECRET) {
    throw new AtlasError('NOT_CONFIGURED', 'Google OAuth is not configured.')
  }
  const state = randomBytes(24).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  await db.insert(oauthStates).values({
    provider: 'google',
    stateHash: sha256(state),
    codeVerifierEnc: encryptString(config.encryptionKey, verifier),
    userId,
    sessionId,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  })
  return googleAuthUrl({ clientId, redirectUri, state, codeChallenge: challenge })
}

export async function finishGoogleOAuth(db: Database, config: AtlasConfig, state: string, code: string): Promise<void> {
  const rows = await db.select().from(oauthStates).where(eq(oauthStates.stateHash, sha256(state))).limit(1)
  const saved = rows[0]
  if (!saved || saved.consumedAt || saved.expiresAt.getTime() < Date.now()) {
    throw new AtlasError('CSRF_FAILED', 'Google sign-in expired. Start it again from Integrations.')
  }
  await db.update(oauthStates).set({ consumedAt: new Date() }).where(eq(oauthStates.id, saved.id))
  const clientId = config.env.GOOGLE_CLIENT_ID
  const clientSecret = config.env.GOOGLE_CLIENT_SECRET
  const redirectUri = config.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) throw new AtlasError('NOT_CONFIGURED', 'Google OAuth is not configured.')
  const token = await exchangeGoogleCode({
    clientId,
    clientSecret,
    redirectUri,
    code,
    codeVerifier: decryptString(config.encryptionKey, saved.codeVerifierEnc),
  })
  if (!token.refreshToken) throw new AtlasError('AUTH_FAILED', 'Google did not return a refresh token. Reconnect and approve access.')
  const email = await googleAccountEmail(token.accessToken)
  await db
    .insert(oauthTokens)
    .values({
      provider: 'google',
      userId: saved.userId,
      accountEmail: email,
      accessTokenEnc: encryptString(config.encryptionKey, token.accessToken),
      refreshTokenEnc: encryptString(config.encryptionKey, token.refreshToken),
      scope: token.scope,
      expiresAt: new Date(token.expiresAt),
    })
    .onConflictDoUpdate({
      target: [oauthTokens.provider, oauthTokens.userId],
      set: {
        accountEmail: email,
        accessTokenEnc: encryptString(config.encryptionKey, token.accessToken),
        refreshTokenEnc: encryptString(config.encryptionKey, token.refreshToken),
        scope: token.scope,
        expiresAt: new Date(token.expiresAt),
        updatedAt: new Date(),
      },
    })
}

export async function googleAccessToken(db: Database, config: AtlasConfig, userId: string): Promise<string> {
  const rows = await db.select().from(oauthTokens).where(and(eq(oauthTokens.provider, 'google'), eq(oauthTokens.userId, userId))).limit(1)
  const saved = rows[0]
  if (!saved?.refreshTokenEnc) throw new AtlasError('NOT_CONFIGURED', 'Connect Google in Integrations to read Calendar and Gmail.')
  const clientId = config.env.GOOGLE_CLIENT_ID
  const clientSecret = config.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new AtlasError('NOT_CONFIGURED', 'Google OAuth is not configured.')
  if (saved.accessTokenEnc && saved.expiresAt && saved.expiresAt.getTime() > Date.now() + 60_000) {
    return decryptString(config.encryptionKey, saved.accessTokenEnc)
  }
  const refreshed = await refreshGoogleAccessToken({
    clientId,
    clientSecret,
    refreshToken: decryptString(config.encryptionKey, saved.refreshTokenEnc),
  })
  await db
    .update(oauthTokens)
    .set({
      accessTokenEnc: encryptString(config.encryptionKey, refreshed.accessToken),
      expiresAt: new Date(refreshed.expiresAt),
      updatedAt: new Date(),
    })
    .where(eq(oauthTokens.id, saved.id))
  return refreshed.accessToken
}

export async function googleIsLinked(db: Database, userId: string): Promise<boolean> {
  const rows = await db.select({ id: oauthTokens.id }).from(oauthTokens).where(and(eq(oauthTokens.provider, 'google'), eq(oauthTokens.userId, userId))).limit(1)
  return rows.length > 0
}
