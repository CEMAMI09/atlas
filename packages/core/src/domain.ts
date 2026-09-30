import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import {
  cameraEvents,
  conversationSegments,
  conversationSummaries,
  conversations,
  devices,
  providerRecords,
  rooms,
  systemSettings,
  taskSuggestions,
  tasks,
  projects,
  presenceStates,
  type Database,
} from '@atlas/database'
import { queryTimeline, selectDigest } from '@atlas/events'
import {
  AtlasError,
  CalendarEvent,
  Camera,
  Deployment,
  EmailMessage,
  EmailSummary,
  Payment,
  PaymentSummary,
  PrivacyStatus,
  SecurityState,
  Subscription,
  Task,
  TaskSuggestion,
  Weather,
  addZonedDays,
  endOfZonedDay,
  formatLocalTime,
  parseDateTimeInZone,
  resolvePresetRange,
  resolveRecentHourRange,
  startOfZonedDay,
  type AtlasEvent,
  type CameraEvent,
  type Conversation,
  type ConversationDetail,
  type DataSource,
  type Device,
  type PresenceEstimate,
  type ProjectStatus,
  type RoomState,
  type TimelineQuery,
} from '@atlas/shared'
import type { EventVisibility } from '@atlas/events'
import { liveCalendar, liveCameras, liveCreateCalendar, liveDeployment, liveDeployments, liveDevices, liveGetEmail, liveImportantEmail, liveRoom, liveSearchEmail, liveSecurity, liveSetDevice, liveSetSecurity, liveStripe, liveUpdateCalendar } from './live-read'
import type { AtlasConfig } from '@atlas/config'

type Mode = 'mock' | 'live'

export interface Domain {
  db: Database
  now: Date
  timeZone: string
  userId: string
  config: AtlasConfig
  visibility: EventVisibility
  /** mock = read seeded rows; live = not implemented; off = disconnected */
  integrationMode: (id: 'google' | 'home_assistant' | 'vercel' | 'stripe' | 'audio' | 'weather') => Mode | 'off'
}

export function source(provider: string, mode: Mode, now: Date): DataSource {
  return { provider, mode, fetchedAt: now.toISOString() }
}

function requireMode(domain: Domain, id: Parameters<Domain['integrationMode']>[0], label: string): Mode {
  const mode = domain.integrationMode(id)
  if (mode === 'off') throw new AtlasError('NOT_CONFIGURED', `${label} is not connected.`)
  return mode
}

export async function listCalendar(domain: Domain, start: Date, end: Date, limit = 12): Promise<{ events: CalendarEvent[]; sources: DataSource[] }> {
  const mode = requireMode(domain, 'google', 'Google Calendar')
  if (mode === 'live') return liveCalendar(domain, start, end, limit)
  const rows = await records(domain, 'google', 'calendar.event')
  const events = rows
    .map((row) => CalendarEvent.safeParse(row.data))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .filter((event) => new Date(event.end).getTime() > start.getTime() && new Date(event.start).getTime() < end.getTime())
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, limit)
  return { events, sources: [source('google', mode, domain.now)] }
}

export async function createCalendarEvent(
  domain: Domain,
  input: { title: string; start: string; end: string; description?: string; location?: string },
): Promise<{ event: CalendarEvent; sources: DataSource[] }> {
  const mode = requireMode(domain, 'google', 'Google Calendar')
  if (mode === 'live') return liveCreateCalendar(domain, input)
  const start = parseDateTimeInZone(input.start, domain.timeZone)
  const end = parseDateTimeInZone(input.end, domain.timeZone)
  if (!start || !end || end.getTime() <= start.getTime()) {
    throw new AtlasError('VALIDATION_FAILED', 'Calendar event needs a valid start and end.')
  }
  const event: CalendarEvent = {
    id: `cal_${crypto.randomUUID()}`,
    calendarId: 'primary',
    calendarName: 'Primary',
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    startDate: null,
    endDate: null,
    status: 'confirmed',
    attendees: [],
    meetingUrl: null,
    htmlLink: null,
    organizer: null,
    updatedAt: domain.now.toISOString(),
  }
  await domain.db.insert(providerRecords).values({
    provider: 'google',
    kind: 'calendar.event',
    externalId: event.id,
    occurredAt: start,
    data: event,
    isMock: mode === 'mock',
  })
  return { event, sources: [source('google', mode, domain.now)] }
}

export async function updateCalendarEvent(
  domain: Domain,
  input: { eventId: string; title?: string; start?: string; end?: string; description?: string; location?: string },
): Promise<{ event: CalendarEvent; sources: DataSource[] }> {
  const mode = requireMode(domain, 'google', 'Google Calendar')
  if (mode === 'live') return liveUpdateCalendar(domain, input)
  const rows = await domain.db
    .select()
    .from(providerRecords)
    .where(and(eq(providerRecords.provider, 'google'), eq(providerRecords.kind, 'calendar.event'), eq(providerRecords.externalId, input.eventId)))
    .limit(1)
  const row = rows[0]
  const current = row ? CalendarEvent.safeParse(row.data) : null
  if (!row || !current?.success) throw new AtlasError('NOT_FOUND', 'Calendar event was not found.')
  const start = input.start ? parseDateTimeInZone(input.start, domain.timeZone) : new Date(current.data.start)
  const end = input.end ? parseDateTimeInZone(input.end, domain.timeZone) : new Date(current.data.end)
  if (!start || !end || end.getTime() <= start.getTime()) throw new AtlasError('VALIDATION_FAILED', 'Updated event times are invalid.')
  const event: CalendarEvent = {
    ...current.data,
    title: input.title ?? current.data.title,
    description: input.description ?? current.data.description,
    location: input.location ?? current.data.location,
    start: start.toISOString(),
    end: end.toISOString(),
    updatedAt: domain.now.toISOString(),
  }
  await domain.db.update(providerRecords).set({ data: event, occurredAt: start, updatedAt: domain.now }).where(eq(providerRecords.id, row.id))
  return { event, sources: [source('google', mode, domain.now)] }
}

export async function listImportantEmail(domain: Domain, limit: number): Promise<{ messages: EmailSummary[]; sources: DataSource[] }> {
  const mode = requireMode(domain, 'google', 'Gmail')
  if (mode === 'live') return liveImportantEmail(domain, limit)
  const messages = (await allEmail(domain)).filter((message) => message.important || message.unread).slice(0, limit).map(toSummary)
  return { messages, sources: [source('google', mode, domain.now)] }
}

export async function searchEmail(domain: Domain, query: string, limit: number): Promise<{ messages: EmailSummary[]; sources: DataSource[] }> {
  const mode = requireMode(domain, 'google', 'Gmail')
  if (mode === 'live') return liveSearchEmail(domain, query, limit)
  const needle = query.trim().toLowerCase()
  const messages = (await allEmail(domain))
    .filter((message) => !needle || `${message.subject} ${message.snippet} ${message.from.email}`.toLowerCase().includes(needle))
    .slice(0, limit)
    .map(toSummary)
  return { messages, sources: [source('google', mode, domain.now)] }
}

export async function getEmail(domain: Domain, id: string): Promise<{ message: EmailMessage; sources: DataSource[] }> {
  const mode = requireMode(domain, 'google', 'Gmail')
  if (mode === 'live') return liveGetEmail(domain, id)
  const message = (await allEmail(domain)).find((item) => item.id === id)
  if (!message) throw new AtlasError('NOT_FOUND', 'That message was not found.')
  return { message, sources: [source('google', mode, domain.now)] }
}

export async function listDeployments(domain: Domain, limit: number): Promise<{ deployments: Deployment[]; sources: DataSource[] }> {
  const mode = requireMode(domain, 'vercel', 'Vercel')
  if (mode === 'live') return liveDeployments(domain, limit)
  const deployments = (await allDeployments(domain)).slice(0, limit)
  return { deployments, sources: [source('vercel', mode, domain.now)] }
}

export async function getDeployment(domain: Domain, id: string): Promise<{ deployment: Deployment; sources: DataSource[] }> {
  const mode = requireMode(domain, 'vercel', 'Vercel')
  if (mode === 'live') return liveDeployment(domain, id)
  const deployment = (await allDeployments(domain)).find((item) => item.id === id)
  if (!deployment) throw new AtlasError('NOT_FOUND', 'That deployment was not found.')
  return { deployment, sources: [source('vercel', mode, domain.now)] }
}

export async function stripeSummary(domain: Domain): Promise<{ summary: PaymentSummary; sources: DataSource[] }> {
  const mode = requireMode(domain, 'stripe', 'Stripe')
  if (mode === 'live') {
    const result = await liveStripe(domain)
    return { summary: result.summary, sources: result.sources }
  }
  const rows = await records(domain, 'stripe', 'summary')
  const summary = rows.map((row) => PaymentSummary.safeParse(row.data)).find((parsed) => parsed.success)?.data
  if (!summary) throw new AtlasError('NOT_FOUND', 'Stripe has no summary yet.')
  return { summary, sources: [source('stripe', mode, domain.now)] }
}

export async function recentPayments(domain: Domain, limit: number): Promise<{ payments: Payment[]; sources: DataSource[] }> {
  const mode = requireMode(domain, 'stripe', 'Stripe')
  if (mode === 'live') {
    const result = await liveStripe(domain)
    return { payments: result.payments.slice(0, limit), sources: result.sources }
  }
  const payments = (await records(domain, 'stripe', 'payment'))
    .map((row) => Payment.safeParse(row.data))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit)
  return { payments, sources: [source('stripe', mode, domain.now)] }
}

export async function recentSubscriptions(domain: Domain, limit: number): Promise<{ subscriptions: Subscription[]; sources: DataSource[] }> {
  const mode = requireMode(domain, 'stripe', 'Stripe')
  if (mode === 'live') {
    const result = await liveStripe(domain)
    return { subscriptions: result.subscriptions.slice(0, limit), sources: result.sources }
  }
  const subscriptions = (await records(domain, 'stripe', 'subscription'))
    .map((row) => Subscription.safeParse(row.data))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit)
  return { subscriptions, sources: [source('stripe', mode, domain.now)] }
}

export async function listDevices(domain: Domain): Promise<Device[]> {
  if (domain.integrationMode('home_assistant') === 'live') return liveDevices(domain)
  if (domain.integrationMode('home_assistant') === 'off') return []
  const rows = await domain.db
    .select({ device: devices, roomName: rooms.name })
    .from(devices)
    .leftJoin(rooms, eq(devices.roomId, rooms.id))
    .orderBy(asc(devices.name))
  return rows.map((row) => ({
    id: row.device.id,
    provider: row.device.provider,
    externalId: row.device.externalId,
    name: row.device.name,
    kind: row.device.kind as Device['kind'],
    roomId: row.device.roomId,
    roomName: row.roomName,
    online: row.device.online,
    state: row.device.state,
    attributes: row.device.attributes ?? {},
    battery: row.device.battery,
    lastSeenAt: row.device.lastSeenAt?.toISOString() ?? null,
    lastChangedAt: row.device.lastChangedAt?.toISOString() ?? null,
    isMock: row.device.isMock,
  }))
}

export async function setDeviceState(domain: Domain, externalId: string, on: boolean): Promise<Device> {
  const mode = requireMode(domain, 'home_assistant', 'Home Assistant')
  if (mode === 'live') return liveSetDevice(domain, externalId, on)
  const current = (await listDevices(domain)).find((device) => device.externalId === externalId)
  if (!current) throw new AtlasError('NOT_FOUND', 'That device was not found.')
  if (current.kind !== 'light' && current.kind !== 'switch') {
    throw new AtlasError('UNSUPPORTED', `${current.name} cannot be toggled.`)
  }
  await domain.db
    .update(devices)
    .set({ state: on ? 'on' : 'off', attributes: { ...current.attributes, brightness: on ? 80 : 0 }, lastChangedAt: domain.now, updatedAt: domain.now })
    .where(eq(devices.id, current.id))
  return { ...current, state: on ? 'on' : 'off', lastChangedAt: domain.now.toISOString() }
}

export async function roomState(domain: Domain, roomKey = 'bedroom'): Promise<{ room: RoomState; sources: DataSource[] }> {
  const mode = requireMode(domain, 'home_assistant', 'Home Assistant')
  if (mode === 'live') return liveRoom(domain, roomKey)
  const roomRows = await domain.db.select().from(rooms).where(eq(rooms.key, roomKey)).limit(1)
  const room = roomRows[0]
  if (!room) throw new AtlasError('NOT_FOUND', `Room “${roomKey}” was not found.`)
  const all = await listDevices(domain)
  const inRoom = all.filter((device) => device.roomName === room.name || device.roomId === room.id)
  const climate = inRoom.find((device) => device.kind === 'sensor')
  const temperature = typeof climate?.attributes.temperatureC === 'number' ? climate.attributes.temperatureC : null
  const humidity = typeof climate?.attributes.humidity === 'number' ? climate.attributes.humidity : null
  const presence = await latestPresence(domain)
  const state: RoomState = {
    room: { id: room.id, key: room.key, name: room.name, floor: room.floor },
    occupancy: presence?.roomId === room.key ? presence.status : 'UNCERTAIN',
    occupancyConfidence: presence?.roomId === room.key ? presence.confidence : 0.2,
    climate: { temperatureC: temperature, humidity },
    lights: inRoom
      .filter((device) => device.kind === 'light')
      .map((device) => ({
        id: device.externalId,
        name: device.name,
        on: device.state === 'on',
        brightness: typeof device.attributes.brightness === 'number' ? device.attributes.brightness : null,
      })),
    doors: inRoom
      .filter((device) => device.kind === 'door' || device.kind === 'lock')
      .map((device) => ({
        id: device.externalId,
        name: device.name,
        open: device.kind === 'door' ? device.attributes.open === true : null,
        locked: device.kind === 'lock' ? device.state === 'locked' : null,
      })),
    mediaPlaying: null,
    lastMotionAt: null,
    updatedAt: domain.now.toISOString(),
  }
  return { room: state, sources: [source('home_assistant', mode, domain.now)] }
}

export async function getSecurity(domain: Domain): Promise<{ security: SecurityState; sources: DataSource[] }> {
  const mode = requireMode(domain, 'home_assistant', 'Home Assistant')
  if (mode === 'live') return liveSecurity(domain)
  const rows = await domain.db.select().from(systemSettings).where(eq(systemSettings.key, 'security.state')).limit(1)
  const parsed = SecurityState.safeParse(rows[0]?.value)
  if (!parsed.success) throw new AtlasError('NOT_FOUND', 'Security state is not available.')
  return { security: parsed.data, sources: [source('home_assistant', mode, domain.now)] }
}

export async function setSecurity(domain: Domain, modeName: SecurityState['mode']): Promise<SecurityState> {
  const mode = requireMode(domain, 'home_assistant', 'Home Assistant')
  if (mode === 'live') return liveSetSecurity(domain, modeName)
  const current = await getSecurity(domain)
  const next: SecurityState = { ...current.security, mode: modeName, lastChangedAt: domain.now.toISOString(), lastChangedBy: 'Atlas' }
  await domain.db
    .insert(systemSettings)
    .values({ key: 'security.state', value: next })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: next, updatedAt: domain.now } })
  return next
}

export async function listCameras(domain: Domain): Promise<{ cameras: Camera[]; sources: DataSource[] }> {
  const mode = requireMode(domain, 'home_assistant', 'Home Assistant')
  if (mode === 'live') return liveCameras(domain)
  const all = await listDevices(domain)
  const cameras = all.filter((device) => device.kind === 'camera').map((device) => toCamera(device, domain.now))
  return { cameras, sources: [source('home_assistant', mode, domain.now)] }
}

export async function recentCameraEvents(domain: Domain, cameraId: string | undefined, limit: number): Promise<CameraEvent[]> {
  const mode = requireMode(domain, 'home_assistant', 'Home Assistant')
  if (mode === 'live') return []
  const filters = cameraId ? eq(cameraEvents.cameraId, cameraId) : undefined
  const rows = await domain.db.select().from(cameraEvents).where(filters).orderBy(desc(cameraEvents.occurredAt)).limit(limit)
  return rows.map((row) => ({
    id: row.id,
    cameraId: row.cameraId,
    cameraName: row.cameraName,
    kind: row.kind,
    occurredAt: row.occurredAt.toISOString(),
    mediaAvailable: Boolean(row.mediaRef),
    isMock: row.isMock,
  }))
}

export async function listTasks(domain: Domain, includeDone: boolean, project: string | undefined, limit: number): Promise<Task[]> {
  const rows = await domain.db.select().from(tasks).where(eq(tasks.userId, domain.userId)).orderBy(desc(tasks.updatedAt)).limit(200)
  return rows
    .map(toTask)
    .filter((task) => includeDone || (task.status !== 'done' && task.status !== 'canceled'))
    .filter((task) => !project || task.project === project)
    .slice(0, limit)
}

export async function createTask(
  domain: Domain,
  input: { title: string; description?: string; priority?: Task['priority']; project?: string },
): Promise<Task> {
  const inserted = await domain.db
    .insert(tasks)
    .values({
      userId: domain.userId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? 'normal',
      project: input.project ?? null,
      source: 'atlas',
      status: 'todo',
      isMock: false,
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new AtlasError('INTERNAL', 'Task was not created.')
  return toTask(row)
}

export async function updateTask(domain: Domain, id: string, patch: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority'>>): Promise<Task> {
  const existing = await domain.db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, domain.userId))).limit(1)
  const row = existing[0]
  if (!row) throw new AtlasError('NOT_FOUND', 'Task was not found.')
  const status = patch.status ?? row.status
  const updated = await domain.db
    .update(tasks)
    .set({
      title: patch.title ?? row.title,
      description: patch.description === undefined ? row.description : patch.description,
      status,
      priority: patch.priority ?? row.priority,
      completedAt: status === 'done' ? row.completedAt ?? domain.now : null,
      updatedAt: domain.now,
    })
    .where(eq(tasks.id, id))
    .returning()
  const next = updated[0]
  if (!next) throw new AtlasError('INTERNAL', 'Task was not updated.')
  return toTask(next)
}

export async function listSuggestions(domain: Domain): Promise<TaskSuggestion[]> {
  const rows = await domain.db
    .select()
    .from(taskSuggestions)
    .where(and(eq(taskSuggestions.userId, domain.userId), eq(taskSuggestions.status, 'pending')))
    .orderBy(desc(taskSuggestions.createdAt))
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    detail: row.detail,
    sourceKind: row.sourceKind,
    sourceId: row.sourceId,
    sourceLabel: row.sourceLabel,
    confidence: row.confidence,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    isMock: row.isMock,
  }))
}

export async function acceptSuggestion(domain: Domain, id: string): Promise<Task> {
  const rows = await domain.db
    .select()
    .from(taskSuggestions)
    .where(and(eq(taskSuggestions.id, id), eq(taskSuggestions.userId, domain.userId)))
    .limit(1)
  const suggestion = rows[0]
  if (!suggestion || suggestion.status !== 'pending') throw new AtlasError('NOT_FOUND', 'That suggestion is not pending.')
  const task = await createTask(domain, { title: suggestion.title, description: suggestion.detail ?? undefined })
  await domain.db
    .update(taskSuggestions)
    .set({ status: 'accepted', createdTaskId: task.id, decidedAt: domain.now })
    .where(eq(taskSuggestions.id, id))
  return task
}

export async function dismissSuggestion(domain: Domain, id: string): Promise<void> {
  await domain.db
    .update(taskSuggestions)
    .set({ status: 'dismissed', decidedAt: domain.now })
    .where(and(eq(taskSuggestions.id, id), eq(taskSuggestions.userId, domain.userId)))
}

export async function listConversations(domain: Domain, query: string | undefined, limit: number): Promise<Conversation[]> {
  requireMode(domain, 'audio', 'Audio')
  const rows = await domain.db.select().from(conversations).orderBy(desc(conversations.startedAt)).limit(50)
  const summaries = await domain.db.select().from(conversationSummaries)
  const suggestions = await listSuggestions(domain)
  const needle = query?.trim().toLowerCase()
  const mapped = rows.map((row) => {
    const summary = summaries.find((item) => item.conversationId === row.id && item.kind === 'conversation')
    return toConversation(row, summary, suggestions.filter((item) => item.sourceLabel === row.title).length)
  })
  return mapped
    .filter((conversation) => {
      if (!needle) return true
      const blob = `${conversation.title} ${conversation.summary?.summary ?? ''} ${(conversation.summary?.topics ?? []).join(' ')}`.toLowerCase()
      return blob.includes(needle)
    })
    .slice(0, limit)
}

export async function getConversation(domain: Domain, id: string): Promise<ConversationDetail> {
  requireMode(domain, 'audio', 'Audio')
  const rows = await domain.db.select().from(conversations).where(eq(conversations.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw new AtlasError('NOT_FOUND', 'Conversation was not found.')
  const summaryRows = await domain.db.select().from(conversationSummaries).where(eq(conversationSummaries.conversationId, id))
  const segments = await domain.db
    .select()
    .from(conversationSegments)
    .where(eq(conversationSegments.conversationId, id))
    .orderBy(asc(conversationSegments.seq))
  const base = toConversation(row, summaryRows.find((item) => item.kind === 'conversation'), 0)
  return {
    ...base,
    transcriptAvailable: segments.length > 0,
    segments: segments.map((segment) => ({
      id: segment.id,
      speaker: segment.speakerLabel,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
      confidence: segment.confidence,
    })),
  }
}

export async function timeline(domain: Domain, query: TimelineQuery) {
  return queryTimeline(domain.db, query, domain.visibility)
}

export async function whatHappened(
  domain: Domain,
  input: { preset?: Parameters<typeof resolvePresetRange>[0]; startHour?: number; endHour?: number; start?: string; end?: string; query?: string },
): Promise<Record<string, unknown>> {
  const range = resolveRange(domain, input)
  const page = await queryTimeline(
    domain.db,
    {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      ...(input.query ? { q: input.query } : {}),
      limit: 80,
      order: 'asc',
    },
    domain.visibility,
  )
  const digest = selectDigest(page.events, 24)
  const conversationRows = await listConversations(domain, input.query, 8).catch(() => [])
  const related = conversationRows.filter((conversation) => {
    const start = Date.parse(conversation.startedAt)
    return start >= range.start.getTime() - 60_000 && start < range.end.getTime()
  })
  const lines = digest.map((event) => {
    const when = formatLocalTime(new Date(event.timestamp), domain.timeZone)
    return `${when} — ${event.title}${event.summary ? `: ${event.summary}` : ''}`
  })
  const narrative =
    lines.length === 0 && related.length === 0
      ? `Nothing was recorded for ${range.label}.`
      : [`Recorded activity for ${range.label}.`, ...lines, ...related.map((item) => `Conversation: ${item.title}. ${item.summary?.summary ?? ''}`)].join('\n')
  return {
    range: { start: range.start.toISOString(), end: range.end.toISOString(), label: range.label, timeZone: domain.timeZone },
    events: digest,
    conversations: related.map((item) => ({
      id: item.id,
      title: item.title,
      startedAt: item.startedAt,
      summary: item.summary?.summary ?? null,
      topics: item.summary?.topics ?? [],
    })),
    narrative,
    isMock: digest.some((event) => event.isMock) || related.some((item) => item.isMock),
  }
}

export async function projectStatus(domain: Domain, slug = 'struct'): Promise<{ project: ProjectStatus; sources: DataSource[] }> {
  const rows = await domain.db.select().from(projects).where(eq(projects.slug, slug)).limit(1)
  const project = rows[0]
  if (!project) throw new AtlasError('NOT_FOUND', `No project named ${slug} is configured.`)
  let deployments: Deployment[] = []
  let payments: PaymentSummary | null = null
  const sources: DataSource[] = []
  if (domain.integrationMode('vercel') === 'live') {
    const result = await liveDeployments(domain, 8)
    deployments = result.deployments
    sources.push(...result.sources)
  } else if (domain.integrationMode('vercel') === 'mock') {
    deployments = await allDeployments(domain)
    sources.push(source('vercel', 'mock', domain.now))
  }
  const stripeMode = domain.integrationMode('stripe')
  if (stripeMode === 'live' || stripeMode === 'mock') {
    const result = await stripeSummary(domain).catch(() => null)
    payments = result?.summary ?? null
    if (result) sources.push(...result.sources)
  }
  const recent = deployments.slice(0, 6)
  const production = deployments.find((item) => item.target === 'production' && item.state === 'ready') ?? null
  const failed = deployments.filter((item) => item.state === 'error').length
  const health = !production ? 'unknown' : failed > 0 ? 'degraded' : 'healthy'
  const reasons = [
    production ? 'Latest production deployment is ready.' : 'No ready production deployment is recorded.',
    failed > 0 ? `${failed} deployment${failed === 1 ? '' : 's'} failed recently.` : 'No recent deployment failures.',
  ]
  if (deployments.length === 0) reasons.push('Vercel data is not available.')
  const status: ProjectStatus = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    health,
    healthReasons: reasons,
    deployments: {
      available: deployments.length > 0,
      latest: deployments[0] ?? null,
      latestProduction: production,
      failedLast7Days: failed,
      recent,
    },
    payments: {
      available: Boolean(payments),
      summary: payments,
      recentFailures: [],
    },
    healthChecks: [{ name: 'Gateway', ok: null, checkedAt: null, detail: 'No Struct health endpoint is configured.' }],
    isMock: domain.integrationMode('vercel') === 'mock' || domain.integrationMode('stripe') === 'mock',
    updatedAt: domain.now.toISOString(),
  }
  if (payments) {
    const failedPayments = await recentPayments(domain, 5)
    status.payments.recentFailures = failedPayments.payments.filter((payment) => payment.status === 'failed')
  }
  return { project: status, sources }
}

export async function getWeather(domain: Domain): Promise<Weather> {
  if (domain.integrationMode('weather') !== 'mock') {
    return { available: false, provider: null, location: null, temperatureC: null, feelsLikeC: null, condition: null, highC: null, lowC: null, updatedAt: null, isMock: false }
  }
  const rows = await records(domain, 'weather', 'current')
  const parsed = rows.map((row) => Weather.safeParse(row.data)).find((item) => item.success)
  return parsed?.data ?? { available: false, provider: 'mock', location: null, temperatureC: null, feelsLikeC: null, condition: null, highC: null, lowC: null, updatedAt: null, isMock: true }
}

export async function latestPresence(domain: Domain): Promise<PresenceEstimate | null> {
  const rows = await domain.db
    .select()
    .from(presenceStates)
    .where(domain.integrationMode('home_assistant') === 'mock' ? eq(presenceStates.isMock, true) : eq(presenceStates.isMock, false))
    .orderBy(desc(presenceStates.estimatedAt))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    personId: row.personId,
    personName: row.personName,
    roomId: row.roomKey,
    roomName: row.roomName,
    status: row.status,
    confidence: row.confidence,
    evidence: Array.isArray(row.evidence) ? (row.evidence as PresenceEstimate['evidence']) : [],
    timestamp: row.estimatedAt.toISOString(),
  }
}

export async function getPrivacy(db: Database, now: Date): Promise<PrivacyStatus> {
  const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, 'privacy')).limit(1)
  const parsed = PrivacyStatus.safeParse(rows[0]?.value)
  if (parsed.success) return parsed.data
  return { micState: 'MIC_DISABLED', privacyMode: false, hardwareKillSwitch: 'absent', recording: false, changedAt: now.toISOString() }
}

export async function setPrivacy(db: Database, privacy: PrivacyStatus, now: Date): Promise<PrivacyStatus> {
  const next = { ...privacy, changedAt: now.toISOString(), recording: privacy.privacyMode ? false : privacy.recording }
  if (next.privacyMode) next.micState = 'PRIVACY_MODE'
  await db.insert(systemSettings).values({ key: 'privacy', value: next }).onConflictDoUpdate({
    target: systemSettings.key,
    set: { value: next, updatedAt: now },
  })
  return next
}

export function calendarWindow(domain: Domain, preset?: 'today' | 'tomorrow' | 'next_7_days', start?: string, end?: string): { start: Date; end: Date } {
  if (start || end) {
    const from = start ? parseDateTimeInZone(start, domain.timeZone) : startOfZonedDay(domain.now, domain.timeZone)
    const to = end ? parseDateTimeInZone(end, domain.timeZone) : from ? endOfZonedDay(from, domain.timeZone) : null
    if (!from || !to) throw new AtlasError('VALIDATION_FAILED', 'Could not read that time range.')
    return { start: from, end: to }
  }
  const day = startOfZonedDay(domain.now, domain.timeZone)
  if (preset === 'tomorrow') return { start: addZonedDays(day, 1, domain.timeZone), end: addZonedDays(day, 2, domain.timeZone) }
  if (preset === 'next_7_days') return { start: day, end: addZonedDays(day, 7, domain.timeZone) }
  return { start: day, end: endOfZonedDay(domain.now, domain.timeZone) }
}

export async function searchAll(domain: Domain, query: string) {
  const needle = `%${query.replace(/[\\%_]/g, '')}%`
  const eventRows = await domain.db
    .select()
    .from(providerRecords)
    .where(or(ilike(sql`${providerRecords.data}::text`, needle)))
    .limit(5)
  void eventRows
  const taskRows = await domain.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, domain.userId), or(ilike(tasks.title, needle), ilike(tasks.description, needle))))
    .limit(8)
  const conversationRows = await listConversations(domain, query, 6).catch(() => [])
  const page = await queryTimeline(domain.db, { q: query, limit: 8, order: 'desc' }, domain.visibility).catch(() => ({ events: [] as AtlasEvent[], nextCursor: null }))
  return {
    query,
    results: [
      ...page.events.map((event) => ({
        kind: 'event' as const,
        id: event.id,
        title: event.title,
        snippet: event.summary,
        timestamp: event.timestamp,
        href: `/timeline?focus=${event.id}`,
        rank: 1,
      })),
      ...taskRows.map((task) => ({
        kind: 'task' as const,
        id: task.id,
        title: task.title,
        snippet: task.description,
        timestamp: task.updatedAt.toISOString(),
        href: `/tasks?focus=${task.id}`,
        rank: 0.8,
      })),
      ...conversationRows.map((conversation) => ({
        kind: 'conversation' as const,
        id: conversation.id,
        title: conversation.title,
        snippet: conversation.summary?.summary ?? null,
        timestamp: conversation.startedAt,
        href: `/conversations?focus=${conversation.id}`,
        rank: 0.7,
      })),
    ],
  }
}

function resolveRange(
  domain: Domain,
  input: { preset?: Parameters<typeof resolvePresetRange>[0]; startHour?: number; endHour?: number; start?: string; end?: string },
) {
  if (input.start && input.end) {
    const start = parseDateTimeInZone(input.start, domain.timeZone)
    const end = parseDateTimeInZone(input.end, domain.timeZone)
    if (!start || !end) throw new AtlasError('VALIDATION_FAILED', 'Could not read that time range.')
    return { start, end, timeZone: domain.timeZone, label: `${start.toISOString()} – ${end.toISOString()}` }
  }
  if (input.startHour !== undefined && input.endHour !== undefined) {
    return resolveRecentHourRange(input.startHour, input.endHour, domain.now, domain.timeZone)
  }
  if (input.preset) return resolvePresetRange(input.preset, domain.now, domain.timeZone)
  return resolvePresetRange('today', domain.now, domain.timeZone)
}

async function records(domain: Domain, provider: string, kind: string) {
  return domain.db
    .select()
    .from(providerRecords)
    .where(and(eq(providerRecords.provider, provider), eq(providerRecords.kind, kind)))
    .orderBy(desc(providerRecords.occurredAt))
}

async function allEmail(domain: Domain): Promise<EmailMessage[]> {
  return (await records(domain, 'google', 'email'))
    .map((row) => EmailMessage.safeParse(row.data))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
}

async function allDeployments(domain: Domain): Promise<Deployment[]> {
  return (await records(domain, 'vercel', 'deployment'))
    .map((row) => Deployment.safeParse(row.data))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

function toSummary(message: EmailMessage): EmailSummary {
  const { bodyText: _body, bodyTruncated: _truncated, to: _to, cc: _cc, webLink: _link, ...summary } = message
  return summary
}

function toTask(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    dueAt: row.dueAt?.toISOString() ?? null,
    source: row.source as Task['source'],
    project: row.project,
    tags: row.tags ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    isMock: row.isMock,
  }
}

function toConversation(
  row: typeof conversations.$inferSelect,
  summary: typeof conversationSummaries.$inferSelect | undefined,
  pendingSuggestions: number,
): Conversation {
  const duration = row.endedAt ? Math.round((row.endedAt.getTime() - row.startedAt.getTime()) / 1000) : null
  return {
    id: row.id,
    title: row.title,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: duration,
    source: row.source,
    status: row.status,
    roomName: row.roomName,
    participants: row.participants ?? [],
    summary: summary
      ? {
          summary: summary.summary,
          topics: summary.topics ?? [],
          decisions: summary.decisions ?? [],
          actionItems: summary.actionItems ?? [],
          model: summary.model,
          createdAt: summary.createdAt.toISOString(),
        }
      : null,
    segmentCount: 0,
    pendingSuggestions,
    isMock: row.isMock,
  }
}

function toCamera(device: Device, now: Date): Camera {
  const caps = new Set(device.attributes ? Object.keys(device.attributes) : [])
  const capabilities = (['snapshot', 'live_stream', 'motion_detection', 'arm', 'battery', 'recording', 'two_way_audio'] as const).filter((cap) => {
    if (cap === 'live_stream') return device.attributes.liveStream === true
    if (cap === 'snapshot') return true
    if (cap === 'battery') return device.battery !== null
    if (cap === 'recording' || cap === 'motion_detection') return true
    return caps.has(cap)
  })
  return {
    id: device.externalId,
    provider: String(device.attributes.provider ?? device.provider),
    name: device.name,
    room: device.roomName,
    online: device.online,
    capabilities: [...capabilities],
    snapshotPath: `/api/cameras/${encodeURIComponent(device.externalId)}/snapshot`,
    snapshotUpdatedAt: now.toISOString(),
    streamAvailable: device.attributes.liveStream === true,
    motionDetection: capabilities.includes('motion_detection'),
    armed: typeof device.attributes.armed === 'boolean' ? device.attributes.armed : null,
    battery: device.battery,
    lastMotionAt: null,
    lastRecordingAt: null,
    isMock: device.isMock,
  }
}
