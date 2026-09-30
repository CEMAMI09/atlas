import { and, eq } from 'drizzle-orm'
import {
  automationRules,
  cameraEvents,
  conversationSegments,
  conversationSummaries,
  conversations,
  devices,
  memories,
  people,
  presenceStates,
  projects,
  providerRecords,
  rooms,
  systemSettings,
  taskSuggestions,
  tasks,
  type Database,
} from '@atlas/database'
import { hasDedupeKey, ingestDrafts } from '@atlas/events'
import { buildMockCatalog, localAt, type MockCatalog } from '@atlas/integrations'
import { type PrivacyStatus } from '@atlas/shared'

export interface SeedUser {
  id: string
  displayName: string
  timezone: string
}

/** Idempotent mock world. Re-running keeps user edits (device state, tasks, security). */
export async function ensureMockWorld(db: Database, user: SeedUser, now = new Date()): Promise<void> {
  const catalog = buildMockCatalog(now, user.timezone, user.displayName)
  await ensureRoomsAndDevices(db, catalog)
  await ensureProject(db)
  await ensureProviderRecords(db, catalog)
  await ensureSecurity(db, catalog)
  await ensurePrivacy(db, now)
  await ensureTasks(db, user, catalog, now)
  await ensureConversations(db, user, catalog, now)
  await ensureMemory(db, user, catalog)
  await ensureAutomation(db, catalog)
  await ensurePresence(db, user, catalog)
  if (!(await hasDedupeKey(db, `mock:day:${catalog.dateKey}`))) {
    await ingestDrafts(db, catalog.events)
    await ensureCameraEvents(db, catalog)
  }
}

async function ensureRoomsAndDevices(db: Database, catalog: MockCatalog): Promise<void> {
  await db.insert(rooms).values(catalog.rooms.map((room) => ({ ...room, isMock: true }))).onConflictDoNothing({ target: rooms.key })
  const roomRows = await db.select().from(rooms)
  const roomId = new Map(roomRows.map((room) => [room.key, room.id]))
  await db
    .insert(devices)
    .values(
      catalog.devices.map((device) => ({
        provider: 'home_assistant',
        externalId: device.externalId,
        name: device.name,
        kind: device.kind,
        roomId: roomId.get(device.roomKey) ?? null,
        capabilities: device.capabilities,
        state: device.state,
        attributes: device.attributes,
        online: device.online,
        battery: device.battery,
        lastSeenAt: new Date(),
        isMock: true,
      })),
    )
    .onConflictDoNothing({ target: [devices.provider, devices.externalId, devices.isMock] })
}

async function ensureProject(db: Database): Promise<void> {
  await db
    .insert(projects)
    .values({
      slug: 'struct',
      name: 'Struct',
      description: 'Tracked project. Deployment and revenue figures are mock until Vercel and Stripe are connected.',
      vercelProjectIds: ['prj_struct'],
      stripeEnabled: true,
      isMock: true,
    })
    .onConflictDoNothing({ target: projects.slug })
}

async function ensureProviderRecords(db: Database, catalog: MockCatalog): Promise<void> {
  const rows = [
    ...catalog.calendar.map((event) => ({
      provider: 'google',
      kind: 'calendar.event',
      externalId: event.id,
      occurredAt: new Date(event.start),
      data: event,
    })),
    ...catalog.emails.map((email) => ({
      provider: 'google',
      kind: 'email',
      externalId: email.id,
      occurredAt: new Date(email.receivedAt),
      data: email,
    })),
    ...catalog.deployments.map((deployment) => ({
      provider: 'vercel',
      kind: 'deployment',
      externalId: deployment.id,
      occurredAt: new Date(deployment.createdAt),
      data: deployment,
    })),
    ...catalog.payments.map((payment) => ({
      provider: 'stripe',
      kind: 'payment',
      externalId: payment.id,
      occurredAt: new Date(payment.createdAt),
      data: payment,
    })),
    ...catalog.subscriptions.map((subscription) => ({
      provider: 'stripe',
      kind: 'subscription',
      externalId: subscription.id,
      occurredAt: new Date(subscription.createdAt),
      data: subscription,
    })),
    {
      provider: 'stripe',
      kind: 'summary',
      externalId: 'current',
      occurredAt: new Date(catalog.paymentSummary.computedAt),
      data: catalog.paymentSummary,
    },
    {
      provider: 'weather',
      kind: 'current',
      externalId: 'current',
      occurredAt: new Date(),
      data: catalog.weather,
    },
  ]
  await db
    .insert(providerRecords)
    .values(rows.map((row) => ({ ...row, isMock: true })))
    .onConflictDoNothing({ target: [providerRecords.provider, providerRecords.kind, providerRecords.externalId, providerRecords.isMock] })
}

async function ensureSecurity(db: Database, catalog: MockCatalog): Promise<void> {
  const key = 'security.state'
  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1)
  if (existing.length > 0) return
  await db.insert(systemSettings).values({ key, value: catalog.security })
}

async function ensurePrivacy(db: Database, now: Date): Promise<void> {
  const key = 'privacy'
  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1)
  if (existing.length > 0) return
  const privacy: PrivacyStatus = {
    micState: 'MIC_DISABLED',
    privacyMode: false,
    hardwareKillSwitch: 'absent',
    recording: false,
    changedAt: now.toISOString(),
  }
  await db.insert(systemSettings).values({ key, value: privacy })
}

async function ensureTasks(db: Database, user: SeedUser, catalog: MockCatalog, now: Date): Promise<void> {
  for (const task of catalog.tasks) {
    const existing = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.sourceRef, task.sourceRef)).limit(1)
    if (existing.length > 0) continue
    const dueAt =
      task.dueOffsetDays === null || task.dueHour === null
        ? null
        : localAt(now, user.timezone, task.dueOffsetDays, task.dueHour, 0)
    await db.insert(tasks).values({
      userId: user.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueAt,
      source: 'manual',
      sourceRef: task.sourceRef,
      project: task.project,
      tags: task.tags,
      completedAt: task.status === 'done' ? now : null,
      isMock: true,
    })
  }
  for (const suggestion of catalog.suggestions) {
    await db
      .insert(taskSuggestions)
      .values({
        userId: user.id,
        sourceKind: suggestion.sourceKind,
        sourceLabel: suggestion.sourceLabel,
        title: suggestion.title,
        detail: suggestion.detail,
        confidence: suggestion.confidence,
        dedupeKey: suggestion.dedupeKey,
        isMock: true,
      })
      .onConflictDoNothing({ target: taskSuggestions.dedupeKey })
  }
}

async function ensureConversations(db: Database, user: SeedUser, catalog: MockCatalog, now: Date): Promise<void> {
  for (const conversation of catalog.conversations) {
    const existing = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.dedupeKey, conversation.dedupeKey))
      .limit(1)
    if (existing.length > 0) continue
    const startedAt = localAt(now, user.timezone, conversation.dayOffset, conversation.startHour, conversation.startMinute)
    const endedAt = new Date(startedAt.getTime() + conversation.durationMin * 60_000)
    const inserted = await db
      .insert(conversations)
      .values({
        title: conversation.title,
        startedAt,
        endedAt,
        roomKey: conversation.roomKey,
        roomName: conversation.roomName,
        status: 'complete',
        source: 'mock',
        participants: conversation.participants,
        confidence: 0.9,
        dedupeKey: conversation.dedupeKey,
        isMock: true,
      })
      .returning({ id: conversations.id })
    const id = inserted[0]?.id
    if (!id) continue
    await db.insert(conversationSegments).values(
      conversation.segments.map((segment, index) => ({
        conversationId: id,
        seq: index,
        speakerLabel: segment.speaker,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        confidence: 0.9,
      })),
    )
    await db.insert(conversationSummaries).values({
      conversationId: id,
      kind: 'conversation',
      rangeStart: startedAt,
      rangeEnd: endedAt,
      summary: conversation.summary,
      topics: conversation.topics,
      decisions: conversation.decisions,
      actionItems: conversation.actionItems,
      isMock: true,
    })
  }
}

async function ensureMemory(db: Database, user: SeedUser, catalog: MockCatalog): Promise<void> {
  const existing = await db
    .select({ id: memories.id })
    .from(memories)
    .where(and(eq(memories.userId, user.id), eq(memories.isMock, true)))
    .limit(1)
  if (existing.length > 0) return
  await db.insert(memories).values({
    userId: user.id,
    kind: catalog.memory.kind,
    content: catalog.memory.content,
    source: 'import',
    confidence: 1,
    pinned: true,
    isMock: true,
  })
  const existingPerson = await db.select({ id: people.id }).from(people).where(eq(people.userId, user.id)).limit(1)
  if (existingPerson.length === 0) {
    await db.insert(people).values({ name: user.displayName, kind: 'owner', userId: user.id, isMock: false })
  }
}

async function ensureAutomation(db: Database, catalog: MockCatalog): Promise<void> {
  const existing = await db.select({ id: automationRules.id }).from(automationRules).limit(1)
  if (existing.length > 0) return
  await db.insert(automationRules).values({
    name: catalog.automation.name,
    description: catalog.automation.description,
    enabled: false,
    trigger: { kind: 'presence', roomKey: 'bedroom', status: 'ABSENT' },
    conditions: [{ kind: 'privacy_off' }],
    actions: [{ toolId: 'security.arm', input: { mode: 'armed_home' } }],
    cooldownSeconds: 600,
    maxRiskLevel: 2,
    isMock: true,
  })
}

async function ensurePresence(db: Database, user: SeedUser, catalog: MockCatalog): Promise<void> {
  const existing = await db.select({ id: presenceStates.id }).from(presenceStates).where(eq(presenceStates.isMock, true)).limit(1)
  if (existing.length > 0) return
  await db.insert(presenceStates).values({
    personId: user.id,
    personName: catalog.presence.personName,
    roomKey: catalog.presence.roomId,
    roomName: catalog.presence.roomName,
    status: catalog.presence.status,
    confidence: catalog.presence.confidence,
    evidence: catalog.presence.evidence,
    estimatedAt: new Date(catalog.presence.timestamp),
    isMock: true,
  })
}

async function ensureCameraEvents(db: Database, catalog: MockCatalog): Promise<void> {
  const motion = catalog.events.find((event) => event.type === 'camera.motion.detected' && event.dedupeKey?.includes(catalog.dateKey))
  const clip = catalog.events.find((event) => event.type === 'camera.clip.recorded' && event.dedupeKey?.includes(catalog.dateKey))
  const rows = [motion, clip].filter((event): event is NonNullable<typeof event> => Boolean(event))
  if (rows.length === 0) return
  await db.insert(cameraEvents).values(
    rows.map((event) => ({
      cameraId: 'mock.camera.bedroom',
      cameraName: 'Bedroom camera',
      kind: event.type === 'camera.clip.recorded' ? ('clip' as const) : ('motion' as const),
      occurredAt: new Date(event.timestamp),
      mediaRef: event.type === 'camera.clip.recorded' ? 'mock:clip' : null,
      isMock: true,
    })),
  )
}
