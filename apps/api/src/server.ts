import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  ATLAS_VERSION,
  acceptSuggestion,
  buildSnapshot,
  changePassword,
  completeOnboarding,
  createOwner,
  createTask,
  decideConfirmation,
  dismissSuggestion,
  ensureThread,
  finishGoogleOAuth,
  getConversation,
  getPrivacy,
  listCameras,
  listConversations,
  liveCameraBytes,
  liveCameraStream,
  listSuggestions,
  listTasks,
  listThreads,
  login,
  openChatStream,
  patchSettings,
  publicRuntimeInfo,
  readLayout,
  readSession,
  readSettings,
  resetLayout,
  revokeSession,
  saveLayout,
  saveUserMessage,
  searchAll,
  setDeviceState,
  setIntegrationMode,
  setPrivacy,
  startGoogleOAuth,
  systemStatus,
  threadMessages,
  timeline,
  updateProfile,
  updateTask,
  userCount,
  writeChatStream,
  type AtlasRuntime,
} from '@atlas/core'
import {
  AtlasError,
  Breakpoint,
  ChangePasswordInput,
  ConfirmationDecisionInput,
  CreateTaskInput,
  IntegrationId,
  IntegrationModeOverride,
  LoginInput,
  OnboardingStep,
  SaveLayoutInput,
  SettingsPatch,
  SetupInput,
  TimelineQuery,
  UpdateProfileInput,
  UpdateTaskInput,
  isAtlasError,
  type RealtimeMessage,
  type SessionInfo,
} from '@atlas/shared'

declare module 'fastify' {
  interface FastifyRequest {
    atlasUser: SessionInfo['user'] | null
    sessionToken: string | null
    csrfToken: string | null
  }
}

const COOKIE = 'atlas_session'

export async function buildServer(runtime: AtlasRuntime) {
  const app = Fastify({
    loggerInstance: runtime.log,
    trustProxy: runtime.config.env.ATLAS_TRUST_PROXY,
    genReqId: () => randomUUID(),
    bodyLimit: 2_000_000,
  })
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cookie, { secret: runtime.config.env.SESSION_SECRET, hook: 'onRequest' })
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' })
  await app.register(websocket)

  app.decorateRequest('atlasUser', null)
  app.decorateRequest('sessionToken', null)
  app.decorateRequest('csrfToken', null)

  app.addHook('onRequest', async (request) => {
    const raw = request.cookies[COOKIE]
    if (!raw) return
    const unsigned = request.unsignCookie(raw)
    if (!unsigned.valid || !unsigned.value) return
    const session = await readSession(runtime.db, unsigned.value, runtime.config.encryptionKey)
    if (!session) return
    request.atlasUser = session.user
    request.sessionToken = unsigned.value
    request.csrfToken = session.csrfToken
  })

  app.addHook('preHandler', async (request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return
    const url = request.url.split('?')[0] ?? ''
    if (url === '/api/auth/login' || url === '/api/auth/setup') return
    if (!request.atlasUser) return
    const header = request.headers['x-csrf-token']
    const token = Array.isArray(header) ? header[0] : header
    if (!token || token !== request.csrfToken) {
      throw new AtlasError('CSRF_FAILED', 'Refresh Atlas and try again.')
    }
    void reply
  })

  app.setErrorHandler((error, request, reply) => {
    if (isAtlasError(error)) {
      return reply.status(error.status).send({ error: { code: error.code, message: error.message, requestId: request.id } })
    }
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: { code: 'VALIDATION_FAILED', message: 'That request is not valid.', requestId: request.id } })
    }
    const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500
    if (statusCode === 429) {
      return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Wait a moment.', requestId: request.id } })
    }
    const message = error instanceof Error ? runtime.config.scrub(error.message) : 'request failed'
    const cause = error instanceof Error && error.cause instanceof Error ? runtime.config.scrub(error.cause.message) : undefined
    request.log.error({ err: { name: error instanceof Error ? error.name : 'Error', message, cause } }, 'request failed')
    return reply.status(statusCode >= 400 ? statusCode : 500).send({ error: { code: 'INTERNAL', message: 'Atlas could not complete that request.', requestId: request.id } })
  })

  app.get('/api/health', async () => ({ ok: true, version: ATLAS_VERSION }))
  app.get('/api/bootstrap', async () => ({ needsSetup: (await userCount(runtime.db)) === 0, version: ATLAS_VERSION, public: publicRuntimeInfo(runtime.config) }))

  app.post('/api/auth/setup', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const input = SetupInput.parse(request.body)
    const settings = await readSettings(runtime.db)
    const created = await createOwner(runtime.db, input, runtime.config.encryptionKey, settings.security.sessionIdleMinutes)
    await runtime.prepareUser(created.user.id)
    setSessionCookie(reply, created.token, created.expiresAt, runtime.config.isProduction)
    return { user: created.user, csrfToken: created.csrfToken, expiresAt: created.expiresAt.toISOString() }
  })

  app.post('/api/auth/login', { config: { rateLimit: { max: 8, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const input = LoginInput.parse(request.body)
    const settings = await readSettings(runtime.db)
    const result = await login(runtime.db, input.email, input.password, runtime.config.encryptionKey, settings.security.sessionIdleMinutes)
    setSessionCookie(reply, result.token, result.expiresAt, runtime.config.isProduction)
    return { user: result.user, csrfToken: result.csrfToken, expiresAt: result.expiresAt.toISOString() }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.sessionToken) await revokeSession(runtime.db, request.sessionToken)
    reply.clearCookie(COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/api/auth/session', async (request) => {
    if (!request.atlasUser || !request.csrfToken) return { user: null }
    return { user: request.atlasUser, csrfToken: request.csrfToken }
  })

  app.patch('/api/account', async (request) => {
    const user = requireUser(request)
    const patch = UpdateProfileInput.parse(request.body)
    return updateProfile(runtime.db, user.id, patch)
  })

  app.post('/api/account/password', async (request) => {
    const user = requireUser(request)
    const input = ChangePasswordInput.parse(request.body)
    await changePassword(runtime.db, user.id, input.currentPassword, input.newPassword)
    return { ok: true }
  })

  app.get('/api/snapshot', async (request) => {
    const user = requireUser(request)
    await runtime.prepareUser(user.id)
    const domain = await runtime.domainFor(user.id, user.timezone)
    const settings = await readSettings(runtime.db)
    const privacy = await getPrivacy(runtime.db, domain.now)
    return buildSnapshot(domain, user.name, await runtime.statuses(user.id), runtime.config.features.ai.configured, privacy.privacyMode || settings.audio.transcriptionEnabled === false && privacy.privacyMode)
  })

  app.get('/api/dashboard', async (request) => {
    const user = requireUser(request)
    const breakpoint = Breakpoint.parse((request.query as { breakpoint?: string }).breakpoint ?? 'desktop')
    return readLayout(runtime.db, user.id, breakpoint)
  })

  app.put('/api/dashboard', async (request) => {
    const user = requireUser(request)
    const breakpoint = Breakpoint.parse((request.query as { breakpoint?: string }).breakpoint ?? 'desktop')
    const input = SaveLayoutInput.parse(request.body)
    const saved = await saveLayout(runtime.db, user.id, breakpoint, input)
    runtime.broadcast({ type: 'layout.saved', breakpoint, version: saved.version })
    return saved
  })

  app.delete('/api/dashboard', async (request) => {
    const user = requireUser(request)
    const breakpoint = Breakpoint.parse((request.query as { breakpoint?: string }).breakpoint ?? 'desktop')
    return resetLayout(runtime.db, user.id, breakpoint)
  })

  app.get('/api/timeline', async (request) => {
    const user = requireUser(request)
    await runtime.prepareUser(user.id)
    const raw = request.query as Record<string, unknown>
    const query = TimelineQuery.parse({
      ...raw,
      limit: raw.limit === undefined ? undefined : Number(raw.limit),
      categories: typeof raw.categories === 'string' ? [raw.categories] : raw.categories,
    })
    const domain = await runtime.domainFor(user.id, user.timezone)
    return timeline(domain, query)
  })

  app.get('/api/tasks', async (request) => {
    const user = requireUser(request)
    await runtime.prepareUser(user.id)
    const domain = await runtime.domainFor(user.id, user.timezone)
    const includeDone = (request.query as { includeDone?: string }).includeDone === 'true'
    return { tasks: await listTasks(domain, includeDone, undefined, 100), suggestions: await listSuggestions(domain) }
  })

  app.post('/api/tasks', async (request) => {
    const user = requireUser(request)
    const input = CreateTaskInput.parse(request.body)
    const domain = await runtime.domainFor(user.id, user.timezone)
    const task = await createTask(domain, { title: input.title, description: input.description ?? undefined, priority: input.priority, project: input.project ?? undefined })
    runtime.broadcast({ type: 'invalidate', keys: ['tasks'] })
    return task
  })

  app.patch('/api/tasks/:id', async (request) => {
    const user = requireUser(request)
    const id = (request.params as { id: string }).id
    const patch = UpdateTaskInput.parse(request.body)
    const domain = await runtime.domainFor(user.id, user.timezone)
    const task = await updateTask(domain, id, patch)
    runtime.broadcast({ type: 'invalidate', keys: ['tasks'] })
    return task
  })

  app.post('/api/suggestions/:id/accept', async (request) => {
    const user = requireUser(request)
    const domain = await runtime.domainFor(user.id, user.timezone)
    const task = await acceptSuggestion(domain, (request.params as { id: string }).id)
    runtime.broadcast({ type: 'invalidate', keys: ['tasks'] })
    return task
  })

  app.post('/api/suggestions/:id/dismiss', async (request) => {
    const user = requireUser(request)
    const domain = await runtime.domainFor(user.id, user.timezone)
    await dismissSuggestion(domain, (request.params as { id: string }).id)
    return { ok: true }
  })

  app.get('/api/conversations', async (request) => {
    const user = requireUser(request)
    await runtime.prepareUser(user.id)
    const domain = await runtime.domainFor(user.id, user.timezone)
    const q = (request.query as { q?: string }).q
    return { conversations: await listConversations(domain, q, 30) }
  })

  app.get('/api/conversations/:id', async (request) => {
    const user = requireUser(request)
    const domain = await runtime.domainFor(user.id, user.timezone)
    return getConversation(domain, (request.params as { id: string }).id)
  })

  app.get('/api/integrations', async (request) => {
    requireUser(request)
    return { integrations: await runtime.statuses(request.atlasUser?.id) }
  })

  app.post('/api/integrations/:id/mode', async (request) => {
    requireUser(request)
    const id = IntegrationId.parse((request.params as { id: string }).id)
    const mode = IntegrationModeOverride.parse((request.body as { mode?: string }).mode)
    await setIntegrationMode(runtime.db, id, mode)
    const integrations = await runtime.statuses(request.atlasUser?.id)
    const status = integrations.find((item) => item.id === id)
    if (status) runtime.broadcast({ type: 'integration.status', integration: status })
    return { integrations }
  })

  app.get('/api/system', async (request) => {
    requireUser(request)
    const settings = await readSettings(runtime.db)
    return systemStatus({
      db: runtime.db,
      version: ATLAS_VERSION,
      environment: runtime.config.env.NODE_ENV,
      mockMode: settings.developer.useMockIntegrations,
      startedAt: runtime.startedAt,
      integrations: await runtime.statuses(request.atlasUser?.id),
      service: 'api',
      realtimeClients: runtime.clientCount(),
    })
  })

  app.get('/api/settings', async (request) => {
    requireUser(request)
    return readSettings(runtime.db)
  })

  app.patch('/api/settings', async (request) => {
    requireUser(request)
    const patch = SettingsPatch.parse(request.body)
    const settings = await patchSettings(runtime.db, patch)
    runtime.broadcast({ type: 'invalidate', keys: ['settings', 'integrations', 'overview'] })
    return settings
  })

  app.get('/api/privacy', async (request) => {
    requireUser(request)
    return getPrivacy(runtime.db, new Date())
  })

  app.patch('/api/privacy', async (request) => {
    requireUser(request)
    const current = await getPrivacy(runtime.db, new Date())
    const body = z.object({ privacyMode: z.boolean().optional(), micState: z.enum(['MIC_DISABLED', 'TRANSCRIPTION_ENABLED', 'ATLAS_VOICE_ACTIVE', 'PRIVACY_MODE']).optional() }).parse(request.body)
    const next = await setPrivacy(runtime.db, { ...current, ...body, hardwareKillSwitch: current.hardwareKillSwitch, recording: body.privacyMode ? false : current.recording }, new Date())
    runtime.broadcast({ type: 'privacy.changed', privacy: next })
    return next
  })

  app.get('/api/search', async (request) => {
    const user = requireUser(request)
    const q = z.string().min(1).max(200).parse((request.query as { q?: string }).q)
    const domain = await runtime.domainFor(user.id, user.timezone)
    const started = Date.now()
    const result = await searchAll(domain, q)
    return { ...result, tookMs: Date.now() - started }
  })

  app.get('/api/cameras/:id/snapshot', async (request, reply) => {
    const user = requireUser(request)
    const id = decodeURIComponent((request.params as { id: string }).id)
    const statuses = await runtime.statuses(user.id)
    const home = statuses.find((item) => item.id === 'home_assistant')
    if (home?.state === 'CONNECTED') {
      const image = await liveCameraBytes(runtime.config, id)
      if (!image) throw new AtlasError('NOT_FOUND', 'Home Assistant did not return a snapshot for this camera.')
      return reply.type(image.contentType).send(image.bytes)
    }
    const domain = await runtime.domainFor(user.id, user.timezone)
    const cameras = await listCameras(domain).catch(() => ({ cameras: [] }))
    const camera = cameras.cameras.find((item) => item.id === id)
    if (!camera) throw new AtlasError('NOT_FOUND', 'Camera was not found.')
    const label = camera.streamAvailable ? 'Stream capability reported' : 'No live stream — latest still'
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#101114"/>
  <rect x="16" y="16" width="608" height="328" fill="none" stroke="#2a2e38"/>
  <circle cx="40" cy="40" r="4" fill="#8b7cff"/>
  <text x="56" y="45" fill="#f4f4f5" font-family="Segoe UI, sans-serif" font-size="16">${escapeXml(camera.name)}</text>
  <text x="32" y="180" fill="#8b909a" font-family="Segoe UI, sans-serif" font-size="14">${escapeXml(label)}</text>
  <text x="32" y="204" fill="#6f7580" font-family="Segoe UI, sans-serif" font-size="12">${camera.isMock ? 'Mock snapshot. No video was fabricated.' : 'Snapshot unavailable from the provider.'}</text>
</svg>`
    return reply.type('image/svg+xml').send(svg)
  })

  app.get('/api/cameras/:id/stream', async (request, reply) => {
    const user = requireUser(request)
    const id = decodeURIComponent((request.params as { id: string }).id)
    const home = (await runtime.statuses(user.id)).find((item) => item.id === 'home_assistant')
    if (home?.state !== 'CONNECTED') throw new AtlasError('NOT_CONFIGURED', 'Home Assistant is not connected.')
    const abort = new AbortController()
    const upstream = await liveCameraStream(runtime.config, id, abort.signal)
    reply.hijack()
    reply.raw.writeHead(200, {
      'content-type': upstream.contentType,
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    })
    request.raw.on('close', () => abort.abort())
    const reader = upstream.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done || abort.signal.aborted) break
        if (value && !reply.raw.write(value)) await once(reply.raw, 'drain')
      }
    } catch {
      abort.abort()
    } finally {
      reader.releaseLock()
      await upstream.body.cancel().catch(() => undefined)
      if (!reply.raw.writableEnded) reply.raw.end()
    }
  })

  app.post('/api/devices/:id/state', async (request) => {
    const user = requireUser(request)
    const externalId = decodeURIComponent((request.params as { id: string }).id)
    const on = z.object({ on: z.boolean() }).parse(request.body).on
    const domain = await runtime.domainFor(user.id, user.timezone)
    const device = await setDeviceState(domain, externalId, on)
    runtime.broadcast({ type: 'invalidate', keys: ['devices', 'room'] })
    return device
  })

  app.get('/api/chat/threads', async (request) => {
    const user = requireUser(request)
    return { threads: await listThreads(runtime.db, user.id) }
  })

  app.get('/api/chat/threads/:id', async (request) => {
    const user = requireUser(request)
    const id = (request.params as { id: string }).id
    return { messages: await threadMessages(runtime.db, user.id, id) }
  })

  app.post('/api/chat', async (request, reply) => {
    const user = requireUser(request)
    await runtime.prepareUser(user.id)
    const body = (request.body ?? {}) as { id?: string; threadId?: string; messages?: unknown[] }
    const messages = normalizeMessages(body.messages)
    const incoming = [...messages].reverse().find((message) => message.role === 'user')
    if (!incoming) throw new AtlasError('BAD_REQUEST', 'Send a message to Atlas.')
    const text = incoming.parts.filter((part) => part.type === 'text').map((part) => (part.type === 'text' ? part.text : '')).join(' ').trim()
    const threadId = await ensureThread(runtime.db, user.id, body.threadId ?? body.id, text || 'New conversation')
    await saveUserMessage(runtime.db, threadId, incoming)
    const history = await threadMessages(runtime.db, user.id, threadId)
    const settings = await readSettings(runtime.db)
    const domain = await runtime.domainFor(user.id, user.timezone)
    const privacy = await getPrivacy(runtime.db, domain.now)
    const configured = runtime.config.features.ai.configured
    const ac = new AbortController()
    request.raw.on('aborted', () => ac.abort())
    const stream = await openChatStream({
      db: runtime.db,
      domain,
      userId: user.id,
      threadId,
      messages: history,
      models: {
        fast: configured ? (runtime.config.env.ATLAS_AI_FAST_MODEL ?? null) : null,
        reasoning: configured ? (runtime.config.env.ATLAS_AI_REASONING_MODEL ?? null) : null,
      },
      routerMode: settings.ai.routerMode,
      maxSteps: settings.ai.maxToolSteps,
      requestId: request.id,
      abortSignal: ac.signal,
      disabledTools: [],
      privacyMode: privacy.privacyMode,
    })
    reply.hijack()
    await writeChatStream(reply.raw, stream, threadId)
  })

  app.post('/api/confirmations/:id', async (request) => {
    const user = requireUser(request)
    const decision = ConfirmationDecisionInput.parse(request.body)
    const domain = await runtime.domainFor(user.id, user.timezone)
    return decideConfirmation(runtime.db, domain, user.id, (request.params as { id: string }).id, decision, request.id)
  })

  app.get('/api/onboarding', async (request) => {
    requireUser(request)
    return { completed: Boolean(request.atlasUser?.onboardingCompletedAt) }
  })

  app.post('/api/onboarding/complete', async (request) => {
    const user = requireUser(request)
    await completeOnboarding(runtime.db, user.id)
    return { ok: true }
  })

  app.get('/api/integrations/google/start', async (request, reply) => {
    const user = requireUser(request)
    const session = request.sessionToken ? await readSession(runtime.db, request.sessionToken, runtime.config.encryptionKey) : null
    const url = await startGoogleOAuth(runtime.db, runtime.config, user.id, session?.sessionId ?? null)
    return reply.redirect(url)
  })

  app.get('/api/integrations/google/callback', async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string }
    const back = `${runtime.config.env.ATLAS_BASE_URL}/integrations`
    if (!query.code || !query.state || query.error) return reply.redirect(`${back}?google=denied`)
    try {
      await finishGoogleOAuth(runtime.db, runtime.config, query.state, query.code)
      return reply.redirect(`${back}?google=connected`)
    } catch {
      return reply.redirect(`${back}?google=error`)
    }
  })

  app.get('/ws', { websocket: true }, (socket, request) => {
    if (!request.atlasUser) {
      socket.close(4401, 'Sign in required')
      return
    }
    const send = (message: RealtimeMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
    }
    send({ type: 'hello', serverTime: new Date().toISOString(), transport: 'poll' })
    const unsubscribe = runtime.subscribe(send)
    socket.on('message', (raw) => {
      const text = typeof raw === 'string' ? raw : raw.toString()
      if (text.includes('ping')) send({ type: 'pong', serverTime: new Date().toISOString() })
    })
    socket.on('close', () => unsubscribe())
  })

  void OnboardingStep
  return app
}

function requireUser(request: FastifyRequest): SessionInfo['user'] {
  if (!request.atlasUser) throw new AtlasError('UNAUTHENTICATED', 'Sign in to Atlas.')
  return request.atlasUser
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date, production: boolean) {
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    signed: true,
    expires: expiresAt,
  })
}

function normalizeMessages(value: unknown[] | undefined) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const message = item as { id?: string; role?: string; parts?: { type?: string; text?: string }[] }
    if (message.role !== 'user' && message.role !== 'assistant') return []
    const parts = (message.parts ?? []).filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
    return [{
      id: typeof message.id === 'string' ? message.id : randomUUID(),
      role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      parts: parts.map((part) => ({ type: 'text' as const, text: part.text ?? '' })),
    }]
  })
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char)
}
