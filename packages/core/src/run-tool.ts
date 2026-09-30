import { ingestDrafts } from '@atlas/events'
import { AtlasError } from '@atlas/shared'
import type { ToolRunResult } from '@atlas/ai'
import {
  calendarWindow,
  createCalendarEvent,
  createTask,
  getConversation,
  getDeployment,
  getEmail,
  getSecurity,
  listCalendar,
  listCameras,
  listConversations,
  listDeployments,
  listDevices,
  listImportantEmail,
  listTasks,
  projectStatus,
  recentCameraEvents,
  recentPayments,
  recentSubscriptions,
  roomState,
  searchEmail,
  setDeviceState,
  setSecurity,
  source,
  stripeSummary,
  timeline,
  updateCalendarEvent,
  updateTask,
  whatHappened,
  type Domain,
} from './domain'

export async function runDomainTool(domain: Domain, toolId: string, input: unknown): Promise<ToolRunResult> {
  const body = asRecord(input)
  switch (toolId) {
    case 'calendar.getEvents': {
      const window = calendarWindow(domain, enumPreset(body.preset), str(body.start), str(body.end))
      const result = await listCalendar(domain, window.start, window.end, num(body.limit, 8))
      return { data: { events: result.events, from: window.start.toISOString(), to: window.end.toISOString() }, sources: result.sources }
    }
    case 'calendar.createEvent': {
      const result = await createCalendarEvent(domain, {
        title: required(body.title, 'title'),
        start: required(body.start, 'start'),
        end: required(body.end, 'end'),
        ...(str(body.description) ? { description: str(body.description) } : {}),
        ...(str(body.location) ? { location: str(body.location) } : {}),
      })
      await ingestDrafts(domain.db, [
        {
          timestamp: domain.now.toISOString(),
          source: 'google',
          type: 'calendar.event.created',
          title: `Created “${result.event.title}”`,
          summary: 'Calendar event created through Atlas.',
          entityId: result.event.id,
          dedupeKey: `calendar:create:${result.event.id}`,
          isMock: result.sources[0]?.mode === 'mock',
        },
      ])
      return { data: { event: result.event }, sources: result.sources, note: 'The calendar provider stored this event.' }
    }
    case 'calendar.updateEvent': {
      const result = await updateCalendarEvent(domain, {
        eventId: required(body.eventId, 'eventId'),
        ...(str(body.title) ? { title: str(body.title) } : {}),
        ...(str(body.start) ? { start: str(body.start) } : {}),
        ...(str(body.end) ? { end: str(body.end) } : {}),
        ...(str(body.description) ? { description: str(body.description) } : {}),
        ...(str(body.location) ? { location: str(body.location) } : {}),
      })
      return { data: { event: result.event }, sources: result.sources, note: 'The calendar provider updated this event.' }
    }
    case 'email.search': {
      const result = await searchEmail(domain, str(body.query) ?? '', num(body.limit, 8))
      return { data: { messages: result.messages }, sources: result.sources }
    }
    case 'email.getMessage': {
      const result = await getEmail(domain, required(body.id, 'id'))
      return { data: { message: result.message }, sources: result.sources }
    }
    case 'email.getImportant': {
      const result = await listImportantEmail(domain, num(body.limit, 5))
      return { data: { messages: result.messages }, sources: result.sources }
    }
    case 'timeline.query':
    case 'timeline.search': {
      const page = await timeline(domain, {
        ...(str(body.start) ? { start: str(body.start) } : {}),
        ...(str(body.end) ? { end: str(body.end) } : {}),
        ...(str(body.query) || str(body.q) ? { q: str(body.query) ?? str(body.q) } : {}),
        ...(str(body.roomId) ? { roomId: str(body.roomId) } : {}),
        limit: num(body.limit, 20),
        order: 'desc',
      })
      return { data: page, sources: [source('atlas', 'live', domain.now)] }
    }
    case 'timeline.whatHappened': {
      const hours = afternoonBias(typeof body.startHour === 'number' ? body.startHour : undefined, typeof body.endHour === 'number' ? body.endHour : undefined)
      const data = await whatHappened(domain, {
        ...(isPreset(body.preset) ? { preset: body.preset } : {}),
        ...(hours.startHour !== undefined ? { startHour: hours.startHour } : {}),
        ...(hours.endHour !== undefined ? { endHour: hours.endHour } : {}),
        ...(str(body.start) ? { start: str(body.start) } : {}),
        ...(str(body.end) ? { end: str(body.end) } : {}),
        ...(str(body.query) ? { query: str(body.query) } : {}),
      })
      return { data, sources: [source('atlas', 'live', domain.now)] }
    }
    case 'tasks.list':
      return { data: { tasks: await listTasks(domain, body.includeDone === true, str(body.project), num(body.limit, 12)) }, sources: [source('atlas', 'live', domain.now)] }
    case 'tasks.create':
      return {
        data: { task: await createTask(domain, { title: required(body.title, 'title'), description: str(body.description), priority: priority(body.priority), project: str(body.project) }) },
        sources: [source('atlas', 'live', domain.now)],
      }
    case 'tasks.update':
      return { data: { task: await updateTask(domain, required(body.id, 'id'), body) }, sources: [source('atlas', 'live', domain.now)] }
    case 'tasks.complete':
      return { data: { task: await updateTask(domain, required(body.id, 'id'), { status: 'done' }) }, sources: [source('atlas', 'live', domain.now)] }
    case 'room.getState': {
      const result = await roomState(domain, str(body.roomKey) ?? 'bedroom')
      return { data: result.room, sources: result.sources }
    }
    case 'security.getState': {
      const result = await getSecurity(domain)
      return { data: result.security, sources: result.sources }
    }
    case 'security.arm': {
      const mode = body.mode === 'armed_away' || body.mode === 'armed_night' ? body.mode : 'armed_home'
      const security = await setSecurity(domain, mode)
      await ingestDrafts(domain.db, [
        {
          timestamp: domain.now.toISOString(),
          source: 'home_assistant',
          type: 'security.armed',
          title: `Security armed (${mode})`,
          dedupeKey: `security:arm:${domain.now.toISOString()}`,
          isMock: true,
        },
      ])
      return { data: security, sources: [source('home_assistant', 'mock', domain.now)], note: 'The panel state was updated.' }
    }
    case 'security.disarm': {
      const security = await setSecurity(domain, 'disarmed')
      await ingestDrafts(domain.db, [
        {
          timestamp: domain.now.toISOString(),
          source: 'home_assistant',
          type: 'security.disarmed',
          title: 'Security disarmed',
          severity: 'notice',
          dedupeKey: `security:disarm:${domain.now.toISOString()}`,
          isMock: true,
        },
      ])
      return { data: security, sources: [source('home_assistant', 'mock', domain.now)], note: 'The panel was disarmed.' }
    }
    case 'cameras.list': {
      const result = await listCameras(domain)
      return { data: { cameras: result.cameras }, sources: result.sources }
    }
    case 'cameras.getSnapshot': {
      const cameras = await listCameras(domain)
      const camera = cameras.cameras.find((item) => item.id === body.cameraId)
      if (!camera) throw new AtlasError('NOT_FOUND', 'Camera was not found.')
      return {
        data: {
          cameraId: camera.id,
          name: camera.name,
          snapshotPath: camera.snapshotPath,
          streamAvailable: camera.streamAvailable,
          note: camera.streamAvailable ? 'A stream capability is reported.' : 'This camera has no live stream. The snapshot is the latest still.',
        },
        sources: cameras.sources,
      }
    }
    case 'cameras.getRecentEvents': {
      const events = await recentCameraEvents(domain, str(body.cameraId), num(body.limit, 8))
      return { data: { events }, sources: [source('home_assistant', 'mock', domain.now)] }
    }
    case 'homeAssistant.getEntities':
    case 'homeAssistant.getEntity': {
      const devices = await listDevices(domain)
      const filtered = str(body.kind) ? devices.filter((device) => device.kind === body.kind) : devices
      const one = str(body.externalId) ? filtered.filter((device) => device.externalId === body.externalId) : filtered
      return { data: { entities: one }, sources: [source('home_assistant', 'mock', domain.now)] }
    }
    case 'devices.setState': {
      const device = await setDeviceState(domain, required(body.externalId, 'externalId'), body.on === true)
      return { data: { device }, sources: [source('home_assistant', 'mock', domain.now)] }
    }
    case 'vercel.getProjects':
    case 'vercel.getDeployments': {
      const result = await listDeployments(domain, num(body.limit, 8))
      return { data: { deployments: result.deployments }, sources: result.sources }
    }
    case 'vercel.getDeploymentStatus': {
      const result = await getDeployment(domain, required(body.deploymentId, 'deploymentId'))
      return { data: { deployment: result.deployment }, sources: result.sources }
    }
    case 'stripe.getSummary': {
      const result = await stripeSummary(domain)
      return { data: result.summary, sources: result.sources }
    }
    case 'stripe.getRecentPayments': {
      const result = await recentPayments(domain, num(body.limit, 8))
      return { data: { payments: result.payments }, sources: result.sources }
    }
    case 'stripe.getSubscriptions': {
      const result = await recentSubscriptions(domain, num(body.limit, 8))
      return { data: { subscriptions: result.subscriptions }, sources: result.sources }
    }
    case 'projects.getStatus': {
      const result = await projectStatus(domain, str(body.slug) ?? 'struct')
      return { data: result.project, sources: result.sources }
    }
    case 'conversations.search':
    case 'conversations.summarizeRange': {
      const conversations = await listConversations(domain, str(body.query), num(body.limit, 6))
      return { data: { conversations }, sources: [source('audio', 'mock', domain.now)] }
    }
    case 'conversations.get': {
      const conversation = await getConversation(domain, required(body.id, 'id'))
      return { data: conversation, sources: [source('audio', 'mock', domain.now)] }
    }
    case 'system.getStatus':
      return { data: { note: 'Use the system page for full health. This tool confirms Atlas can read system state.' }, sources: [source('atlas', 'live', domain.now)] }
    default:
      throw new AtlasError('NOT_FOUND', `No handler for ${toolId}.`)
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
}
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function required(value: unknown, name: string): string {
  const text = str(value)
  if (!text) throw new AtlasError('VALIDATION_FAILED', `${name} is required.`)
  return text
}
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
function enumPreset(value: unknown): 'today' | 'tomorrow' | 'next_7_days' | undefined {
  return value === 'today' || value === 'tomorrow' || value === 'next_7_days' ? value : undefined
}
function isPreset(value: unknown): value is 'today' | 'yesterday' | 'this_week' | 'last_hour' | 'last_3_hours' | 'last_24_hours' | 'last_7_days' | 'tonight' | 'this_morning' | 'this_afternoon' {
  return typeof value === 'string'
}
function afternoonBias(start: number | undefined, end: number | undefined): { startHour?: number; endHour?: number } {
  if (start === undefined || end === undefined) return { startHour: start, endHour: end }
  // Spoken "between 3 and 5" means afternoon unless the caller already used 24-hour time.
  if (start >= 1 && start <= 7 && end > start && end <= 11) return { startHour: start + 12, endHour: end + 12 }
  return { startHour: start, endHour: end }
}

function priority(value: unknown): 'low' | 'normal' | 'high' | 'urgent' | undefined {
  return value === 'low' || value === 'normal' || value === 'high' || value === 'urgent' ? value : undefined
}
