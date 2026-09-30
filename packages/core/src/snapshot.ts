import { greetingFor, type DashboardSnapshot, type OverviewStatus } from '@atlas/shared'
import {
  getPrivacy,
  getSecurity,
  getWeather,
  latestPresence,
  listCalendar,
  listCameras,
  listConversations,
  listDeployments,
  listDevices,
  listImportantEmail,
  listSuggestions,
  listTasks,
  projectStatus,
  recentCameraEvents,
  recentPayments,
  roomState,
  stripeSummary,
  timeline,
  type Domain,
} from './domain'
import type { IntegrationStatus } from '@atlas/shared'

export async function buildSnapshot(domain: Domain, userName: string, statuses: IntegrationStatus[], aiConfigured: boolean, privacyMode: boolean): Promise<DashboardSnapshot> {
  const now = domain.now
  const [calendar, taskList, suggestions, events, cameras, emails, deployments, project, conversations, deviceList, room, security, weather, presence, privacy, payments] =
    await Promise.all([
      listCalendar(domain, startOfToday(domain), endOfWeek(domain), 12).catch(() => ({ events: [] })),
      listTasks(domain, false, undefined, 12),
      listSuggestions(domain),
      timeline(domain, { limit: 12, order: 'desc' }),
      listCameras(domain).catch(() => ({ cameras: [] })),
      listImportantEmail(domain, 5).catch(() => ({ messages: [] })),
      listDeployments(domain, 6).catch(() => ({ deployments: [] })),
      projectStatus(domain, 'struct').catch(() => null),
      listConversations(domain, undefined, 6).catch(() => []),
      listDevices(domain),
      roomState(domain, 'bedroom').catch(() => null),
      getSecurity(domain).catch(() => null),
      getWeather(domain),
      latestPresence(domain),
      getPrivacy(domain.db, now),
      stripeSummary(domain).catch(() => null),
    ])
  const cameraEvents = cameras.cameras[0] ? await recentCameraEvents(domain, cameras.cameras[0].id, 4).catch(() => []) : []
  const recentPay = payments ? await recentPayments(domain, 4).catch(() => ({ payments: [] })) : { payments: [] }
  const next = calendar.events.find((event) => Date.parse(event.end) > now.getTime()) ?? null
  const roomLabel = presence?.status === 'PRESENT' && presence.roomName ? presence.roomName : presence?.status === 'ABSENT' ? 'Away' : 'Unknown'
  const securityMode = security?.security.mode ?? 'unknown'
  const overview: OverviewStatus = {
    greeting: greetingFor(now, domain.timeZone),
    userName,
    timezone: domain.timeZone,
    now: now.toISOString(),
    atlas: { state: 'online', aiAvailable: aiConfigured, aiMode: aiConfigured ? 'live' : 'unavailable' },
    room: { label: roomLabel, status: presence?.status ?? 'UNCERTAIN', roomName: presence?.roomName ?? null, isMock: presence?.evidence.some((item) => item.source === 'mock') ?? true },
    security: {
      mode: securityMode,
      label: securityLabel(securityMode),
      available: Boolean(security),
      isMock: security ? domain.integrationMode('home_assistant') === 'mock' : false,
    },
    nextEvent: next,
    nextEventAvailable: domain.integrationMode('google') !== 'off',
    server: { state: 'healthy', label: 'Healthy' },
    mockMode: statuses.some((status) => status.state === 'MOCK'),
    privacyMode: privacy.privacyMode || privacyMode,
  }
  return {
    overview,
    calendar: calendar.events,
    tasks: taskList,
    suggestions,
    events: events.events,
    cameras: cameras.cameras,
    cameraEvents,
    emails: emails.messages,
    deployments: deployments.deployments,
    payments: payments?.summary ?? null,
    recentPayments: recentPay.payments,
    project: project?.project ?? null,
    conversations,
    devices: deviceList,
    rooms: [],
    room: room?.room ?? null,
    security: security?.security ?? null,
    weather,
    presence,
    privacy,
    generatedAt: now.toISOString(),
  }
}

function startOfToday(domain: Domain): Date {
  return new Date(domain.now.getTime() - 12 * 3_600_000)
}
function endOfWeek(domain: Domain): Date {
  return new Date(domain.now.getTime() + 8 * 24 * 3_600_000)
}
function securityLabel(mode: string): string {
  switch (mode) {
    case 'armed_home':
      return 'Armed home'
    case 'armed_away':
      return 'Armed away'
    case 'armed_night':
      return 'Armed night'
    case 'disarmed':
      return 'Disarmed'
    case 'triggered':
      return 'Triggered'
    default:
      return 'Unknown'
  }
}
