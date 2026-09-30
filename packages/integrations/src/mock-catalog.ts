/**
 * Mock world for Atlas. Every value here is synthetic and must stay labelled `isMock` once stored.
 * Times are built in the user's zone so "today" and "between 3 and 5" stay meaningful.
 */
import {
  addZonedDays,
  getZonedParts,
  startOfZonedDay,
  toLocalDateKey,
  zonedTimeToUtc,
  type AtlasEventDraft,
  type CalendarEvent,
  type Deployment,
  type EmailMessage,
  type Payment,
  type PaymentSummary,
  type PresenceEstimate,
  type SecurityState,
  type Subscription,
  type Weather,
} from '@atlas/shared'

export interface MockTaskSeed {
  sourceRef: string
  title: string
  description: string | null
  priority: 'low' | 'normal' | 'high' | 'urgent'
  dueOffsetDays: number | null
  dueHour: number | null
  project: string | null
  tags: string[]
  status: 'todo' | 'in_progress' | 'done'
}

export interface MockSegment {
  speaker: string
  startMs: number
  endMs: number
  text: string
}

export interface MockConversationSeed {
  dedupeKey: string
  title: string
  dayOffset: number
  startHour: number
  startMinute: number
  durationMin: number
  roomKey: string
  roomName: string
  participants: string[]
  segments: MockSegment[]
  summary: string
  topics: string[]
  decisions: string[]
  actionItems: string[]
}

export interface MockSuggestionSeed {
  dedupeKey: string
  title: string
  detail: string
  sourceKind: 'conversation' | 'email' | 'calendar'
  sourceLabel: string
  confidence: number
}

export interface MockCatalog {
  dateKey: string
  rooms: { key: string; name: string; floor: string }[]
  devices: {
    externalId: string
    name: string
    kind: string
    roomKey: string
    capabilities: string[]
    state: string
    online: boolean
    battery: number | null
    attributes: Record<string, unknown>
  }[]
  events: AtlasEventDraft[]
  calendar: CalendarEvent[]
  emails: EmailMessage[]
  tasks: MockTaskSeed[]
  suggestions: MockSuggestionSeed[]
  conversations: MockConversationSeed[]
  deployments: Deployment[]
  payments: Payment[]
  subscriptions: Subscription[]
  paymentSummary: PaymentSummary
  security: SecurityState
  presence: Omit<PresenceEstimate, 'personId'>
  weather: Weather
  memory: { kind: 'preference' | 'fact' | 'person' | 'project' | 'routine'; content: string }
  automation: { name: string; description: string }
}

export function localAt(now: Date, timeZone: string, dayOffset: number, hour: number, minute: number): Date {
  const start = addZonedDays(startOfZonedDay(now, timeZone), dayOffset, timeZone)
  const parts = getZonedParts(start, timeZone)
  return zonedTimeToUtc(
    { year: parts.year, month: parts.month, day: parts.day, hour, minute, second: 0 },
    timeZone,
  )
}

function iso(date: Date): string {
  return date.toISOString()
}

export function buildMockCatalog(now: Date, timeZone: string, ownerName: string): MockCatalog {
  const dateKey = toLocalDateKey(now, timeZone)
  const at = (offset: number, hour: number, minute: number) => localAt(now, timeZone, offset, hour, minute)
  const first = ownerName.trim().split(/\s+/)[0] || 'You'

  const rooms = [
    { key: 'bedroom', name: 'Bedroom', floor: 'Upper' },
    { key: 'hallway', name: 'Hallway', floor: 'Upper' },
    { key: 'office', name: 'Office', floor: 'Upper' },
  ]

  const devices = [
    {
      externalId: 'mock.light.bedroom',
      name: 'Bedroom lights',
      kind: 'light',
      roomKey: 'bedroom',
      capabilities: ['on_off', 'brightness'],
      state: 'off',
      online: true,
      battery: null,
      attributes: { brightness: 0 },
    },
    {
      externalId: 'mock.door.bedroom',
      name: 'Bedroom door',
      kind: 'door',
      roomKey: 'bedroom',
      capabilities: ['contact'],
      state: 'closed',
      online: true,
      battery: 86,
      attributes: { open: false },
    },
    {
      externalId: 'mock.lock.bedroom',
      name: 'Bedroom lock',
      kind: 'lock',
      roomKey: 'bedroom',
      capabilities: ['lock'],
      state: 'locked',
      online: true,
      battery: 74,
      attributes: { locked: true },
    },
    {
      externalId: 'mock.camera.bedroom',
      name: 'Bedroom camera',
      kind: 'camera',
      roomKey: 'bedroom',
      capabilities: ['snapshot', 'motion_detection', 'battery', 'recording'],
      state: 'idle',
      online: true,
      battery: 81,
      attributes: { provider: 'blink', liveStream: false, armed: true },
    },
    {
      externalId: 'mock.camera.hallway',
      name: 'Hallway camera',
      kind: 'camera',
      roomKey: 'hallway',
      capabilities: ['snapshot', 'live_stream', 'motion_detection'],
      state: 'idle',
      online: true,
      battery: null,
      attributes: { provider: 'vivint', liveStream: true, armed: true },
    },
    {
      externalId: 'mock.alarm.panel',
      name: 'Security panel',
      kind: 'alarm_panel',
      roomKey: 'hallway',
      capabilities: ['arm', 'disarm'],
      state: 'armed_home',
      online: true,
      battery: null,
      attributes: { provider: 'vivint' },
    },
    {
      externalId: 'mock.sensor.bedroom.climate',
      name: 'Bedroom climate',
      kind: 'sensor',
      roomKey: 'bedroom',
      capabilities: ['temperature', 'humidity'],
      state: '21.4°C',
      online: true,
      battery: 64,
      attributes: { temperatureC: 21.4, humidity: 46 },
    },
    {
      externalId: 'mock.esp32.bedroom',
      name: 'Bedroom presence receiver',
      kind: 'esp32',
      roomKey: 'bedroom',
      capabilities: ['presence'],
      state: 'online',
      online: false,
      battery: null,
      attributes: { note: 'Hardware not installed. Shown so the device list has an offline receiver.' },
    },
    {
      externalId: 'mock.ring.owner',
      name: 'Smart ring',
      kind: 'ring',
      roomKey: 'bedroom',
      capabilities: ['battery'],
      state: 'not_paired',
      online: false,
      battery: null,
      attributes: { model: 'COLMI R02', note: 'No ring receiver is connected.' },
    },
  ]

  const events: AtlasEventDraft[] = []
  const push = (draft: AtlasEventDraft) => events.push(draft)

  for (const offset of [-1, 0] as const) {
    const day = toLocalDateKey(at(offset, 12, 0), timeZone)
    const prefix = `mock:${day}`
    push({
      timestamp: iso(at(offset, 8, 30)),
      source: 'google',
      type: 'calendar.event.started',
      title: 'Standup started',
      summary: 'Daily standup on the primary calendar.',
      actor: { kind: 'integration', id: 'google', name: 'Google Calendar' },
      dedupeKey: `${prefix}:standup`,
      isMock: true,
    })
    push({
      timestamp: iso(at(offset, 9, 12)),
      source: 'google',
      type: 'email.important',
      title: 'Important email from Stripe',
      summary: 'A payout summary was marked important. Body is not included in the timeline.',
      severity: 'notice',
      actor: { kind: 'integration', id: 'google', name: 'Gmail' },
      dedupeKey: `${prefix}:email`,
      isMock: true,
    })
    push({
      timestamp: iso(at(offset, 11, 40)),
      source: 'vercel',
      type: 'vercel.deployment.failed',
      title: 'Struct preview deployment failed',
      summary: 'Preview build exited during typecheck. Production was not affected.',
      severity: 'warning',
      actor: { kind: 'integration', id: 'vercel', name: 'Vercel' },
      entityId: `dpl_${day}_preview`,
      dedupeKey: `${prefix}:deploy-fail`,
      isMock: true,
      metadata: { project: 'struct', target: 'preview' },
    })
    push({
      timestamp: iso(at(offset, 15, 12)),
      source: 'home_assistant',
      type: 'door.opened',
      title: 'Bedroom door opened',
      summary: 'Contact sensor opened. No person was identified.',
      location: { roomId: 'bedroom', name: 'Bedroom' },
      actor: { kind: 'device', id: 'mock.door.bedroom', name: 'Bedroom door' },
      dedupeKey: `${prefix}:door`,
      isMock: true,
      correlationId: `${prefix}:room`,
    })
    push({
      timestamp: iso(at(offset, 15, 14)),
      source: 'home_assistant',
      type: 'camera.motion.detected',
      title: 'Motion detected',
      summary: 'Bedroom camera (Blink) reported motion. Live video is not available from this camera.',
      severity: 'notice',
      location: { roomId: 'bedroom', name: 'Bedroom' },
      actor: { kind: 'device', id: 'mock.camera.bedroom', name: 'Bedroom camera' },
      entityId: 'mock.camera.bedroom',
      dedupeKey: `${prefix}:motion`,
      isMock: true,
      correlationId: `${prefix}:room`,
    })
    push({
      timestamp: iso(at(offset, 15, 19)),
      source: 'home_assistant',
      type: 'camera.clip.recorded',
      title: 'Blink recording captured',
      summary: 'A short clip was saved in Home Assistant. Atlas does not store the video.',
      location: { roomId: 'bedroom', name: 'Bedroom' },
      actor: { kind: 'device', id: 'mock.camera.bedroom', name: 'Bedroom camera' },
      entityId: 'mock.camera.bedroom',
      dedupeKey: `${prefix}:clip`,
      isMock: true,
      correlationId: `${prefix}:room`,
    })
    push({
      timestamp: iso(at(offset, 15, 41)),
      source: 'presence',
      type: 'room.presence.exited',
      title: `${first} left the bedroom`,
      summary: 'Mock presence estimate changed to absent. This is not a live ring or ESP32 reading.',
      location: { roomId: 'bedroom', name: 'Bedroom' },
      actor: { kind: 'person', id: 'owner', name: first },
      dedupeKey: `${prefix}:presence-exit`,
      isMock: true,
    })
    push({
      timestamp: iso(at(offset, 16, 8)),
      source: 'vercel',
      type: 'vercel.deployment.ready',
      title: 'Struct production deployment ready',
      summary: 'Production deployment finished successfully.',
      actor: { kind: 'integration', id: 'vercel', name: 'Vercel' },
      entityId: `dpl_${day}_prod`,
      dedupeKey: `${prefix}:deploy-ready`,
      isMock: true,
      metadata: { project: 'struct', target: 'production' },
    })
    push({
      timestamp: iso(at(offset, 16, 31)),
      source: 'stripe',
      type: 'stripe.subscription.created',
      title: 'Stripe subscription created',
      summary: 'A new Struct Pro subscription started. Test/mock mode, not a live charge.',
      severity: 'notice',
      actor: { kind: 'integration', id: 'stripe', name: 'Stripe' },
      dedupeKey: `${prefix}:sub`,
      isMock: true,
      metadata: { plan: 'Struct Pro', amount: 2900, currency: 'usd' },
    })
    push({
      timestamp: iso(at(offset, 16, 48)),
      source: 'audio',
      type: 'conversation.summarized',
      title: 'Conversation summary ready',
      summary: `${first} and Alex discussed Struct pricing. Possible tasks were saved as suggestions.`,
      location: { roomId: 'office', name: 'Office' },
      dedupeKey: `${prefix}:convo`,
      isMock: true,
    })
    push({
      timestamp: iso(at(offset, 17, 5)),
      source: 'home_assistant',
      type: 'device.offline',
      title: 'Bedroom presence receiver offline',
      summary: 'The ESP32 receiver is not connected. This mock row exists so offline state is visible.',
      severity: 'warning',
      location: { roomId: 'bedroom', name: 'Bedroom' },
      actor: { kind: 'device', id: 'mock.esp32.bedroom', name: 'Bedroom presence receiver' },
      dedupeKey: `${prefix}:esp-off`,
      isMock: true,
    })
  }

  push({
    timestamp: iso(now),
    source: 'system',
    type: 'system.started',
    title: 'Mock day ready',
    summary: 'Atlas seeded mock events for this local day.',
    severity: 'debug',
    dedupeKey: `mock:day:${dateKey}`,
    isMock: true,
  })

  const calendar: CalendarEvent[] = [
    eventCal(at(0, 8, 30), at(0, 8, 50), dateKey, 'standup', 'Standup', 'Daily check-in', false),
    eventCal(at(0, 13, 0), at(0, 13, 45), dateKey, 'design', 'Struct pricing review', 'Office', false),
    eventCal(at(0, 18, 30), at(0, 19, 30), dateKey, 'focus', 'Focus block', null, false),
    eventCal(at(1, 9, 0), at(1, 9, 30), toLocalDateKey(at(1, 9, 0), timeZone), 'tomorrow', 'Dentist', 'Clinic', false),
  ]

  const emails: EmailMessage[] = [
    {
      id: 'mock-mail-stripe',
      threadId: 'mock-thread-stripe',
      from: { name: 'Stripe', email: 'receipts@stripe.example' },
      to: [{ name: ownerName, email: 'owner@atlas.local' }],
      cc: [],
      subject: 'Struct payout summary',
      snippet: 'Your mock payout summary is ready. No live funds moved.',
      bodyText: 'This is mock mailbox data. A payout summary would appear here as truncated plain text. Atlas does not have a live Gmail connection in mock mode.',
      bodyTruncated: false,
      receivedAt: iso(at(0, 9, 12)),
      unread: true,
      important: true,
      labels: ['IMPORTANT', 'INBOX'],
      hasAttachments: false,
      importanceReason: 'Marked important by the mock mailbox.',
      webLink: null,
    },
    {
      id: 'mock-mail-vercel',
      threadId: 'mock-thread-vercel',
      from: { name: 'Vercel', email: 'notifications@vercel.example' },
      to: [{ name: ownerName, email: 'owner@atlas.local' }],
      cc: [],
      subject: 'Struct preview deployment failed',
      snippet: 'The preview deployment failed during typecheck.',
      bodyText: 'Mock notification: the Struct preview deployment failed. Production is a separate deployment and was not changed by this message.',
      bodyTruncated: false,
      receivedAt: iso(at(0, 11, 42)),
      unread: true,
      important: true,
      labels: ['IMPORTANT', 'INBOX'],
      hasAttachments: false,
      importanceReason: 'Deployment failure notification.',
      webLink: null,
    },
    {
      id: 'mock-mail-personal',
      threadId: 'mock-thread-personal',
      from: { name: 'Alex', email: 'alex@atlas.local' },
      to: [{ name: ownerName, email: 'owner@atlas.local' }],
      cc: [],
      subject: 'Notes from the pricing conversation',
      snippet: 'Annual plan felt clearer than monthly for Struct Pro.',
      bodyText: 'Mock note from Alex: annual pricing was easier to explain than monthly. This message is synthetic.',
      bodyTruncated: false,
      receivedAt: iso(at(0, 16, 55)),
      unread: false,
      important: false,
      labels: ['INBOX'],
      hasAttachments: false,
      importanceReason: null,
      webLink: null,
    },
  ]

  const tasks: MockTaskSeed[] = [
    {
      sourceRef: 'mock:task:pricing',
      title: 'Review Struct pricing page',
      description: 'Check the annual plan copy from today’s conversation. This task was seeded, not extracted automatically.',
      priority: 'high',
      dueOffsetDays: 0,
      dueHour: 18,
      project: 'Struct',
      tags: ['struct', 'pricing'],
      status: 'in_progress',
    },
    {
      sourceRef: 'mock:task:clip',
      title: 'Look at the bedroom camera clip',
      description: 'Motion was recorded this afternoon. The clip stays in Home Assistant.',
      priority: 'normal',
      dueOffsetDays: 0,
      dueHour: 20,
      project: null,
      tags: ['home'],
      status: 'todo',
    },
    {
      sourceRef: 'mock:task:reply',
      title: 'Reply to Alex about pricing',
      description: null,
      priority: 'normal',
      dueOffsetDays: 1,
      dueHour: 11,
      project: 'Struct',
      tags: ['email'],
      status: 'todo',
    },
    {
      sourceRef: 'mock:task:done',
      title: 'Publish Atlas dashboard layout',
      description: null,
      priority: 'low',
      dueOffsetDays: -1,
      dueHour: 16,
      project: 'Atlas',
      tags: ['atlas'],
      status: 'done',
    },
  ]

  const conversations: MockConversationSeed[] = [
    {
      dedupeKey: 'mock:conversation:pricing',
      title: 'Struct pricing',
      dayOffset: 0,
      startHour: 16,
      startMinute: 20,
      durationMin: 18,
      roomKey: 'office',
      roomName: 'Office',
      participants: [first, 'Alex'],
      segments: [
        { speaker: first, startMs: 0, endMs: 14000, text: 'The monthly price is hard to compare. I want the annual Struct plan to be the default.' },
        { speaker: 'Alex', startMs: 14000, endMs: 28000, text: 'Annual at two hundred forty is clearer. We should mention the package includes the gateway.' },
        { speaker: first, startMs: 28000, endMs: 40000, text: 'Do not add that as a task automatically. I want to review the pricing page myself.' },
      ],
      summary: `${first} and Alex preferred an annual Struct plan and mentioned the gateway package. No task was created from the conversation.`,
      topics: ['Struct pricing', 'annual plan', 'gateway package'],
      decisions: ['Annual plan should be the default presentation.'],
      actionItems: ['Review the Struct pricing page before changing copy.'],
    },
    {
      dedupeKey: 'mock:conversation:yesterday',
      title: 'Room sensor check',
      dayOffset: -1,
      startHour: 19,
      startMinute: 5,
      durationMin: 8,
      roomKey: 'bedroom',
      roomName: 'Bedroom',
      participants: [first],
      segments: [
        { speaker: first, startMs: 0, endMs: 12000, text: 'The presence receiver is still offline. I am not installing the ESP32 tonight.' },
      ],
      summary: `${first} noted the bedroom presence receiver is offline and deferred hardware installation.`,
      topics: ['presence', 'ESP32'],
      decisions: [],
      actionItems: [],
    },
  ]

  const suggestions: MockSuggestionSeed[] = [
    {
      dedupeKey: 'mock:suggestion:pricing',
      title: 'Draft Struct annual pricing copy',
      detail: 'Suggested from the office conversation. It is not a task until you accept it.',
      sourceKind: 'conversation',
      sourceLabel: 'Struct pricing',
      confidence: 0.72,
    },
  ]

  const readyAt = at(0, 16, 8)
  const deployments: Deployment[] = [
    {
      id: `dpl_${dateKey}_prod`,
      projectId: 'prj_struct',
      projectName: 'Struct',
      url: null,
      state: 'ready',
      target: 'production',
      branch: 'main',
      commitMessage: 'Clarify annual plan copy',
      commitSha: 'a1b2c3d',
      creator: first,
      createdAt: iso(at(0, 16, 2)),
      readyAt: iso(readyAt),
      buildDurationMs: 6 * 60 * 1000,
      errorMessage: null,
      inspectorUrl: null,
    },
    {
      id: `dpl_${dateKey}_preview`,
      projectId: 'prj_struct',
      projectName: 'Struct',
      url: null,
      state: 'error',
      target: 'preview',
      branch: 'pricing-copy',
      commitMessage: 'Try a shorter pricing table',
      commitSha: 'e4f5a6b',
      creator: first,
      createdAt: iso(at(0, 11, 36)),
      readyAt: null,
      buildDurationMs: 4 * 60 * 1000,
      errorMessage: 'Typecheck failed in the preview build.',
      inspectorUrl: null,
    },
    {
      id: `dpl_${dateKey}_yesterday`,
      projectId: 'prj_struct',
      projectName: 'Struct',
      url: null,
      state: 'ready',
      target: 'production',
      branch: 'main',
      commitMessage: 'Fix ingestion retry',
      commitSha: 'c0ffee1',
      creator: first,
      createdAt: iso(at(-1, 15, 10)),
      readyAt: iso(at(-1, 15, 16)),
      buildDurationMs: 5 * 60 * 1000,
      errorMessage: null,
      inspectorUrl: null,
    },
  ]

  const subscriptions: Subscription[] = [
    {
      id: 'sub_mock_pro',
      status: 'active',
      customerLabel: 'Northwind Studio',
      planLabel: 'Struct Pro',
      monthlyAmount: { amount: 2900, currency: 'usd' },
      interval: 'month',
      createdAt: iso(at(0, 16, 31)),
      canceledAt: null,
      currentPeriodEnd: iso(at(30, 16, 31)),
    },
    {
      id: 'sub_mock_team',
      status: 'active',
      customerLabel: 'Harbor Labs',
      planLabel: 'Struct Team',
      monthlyAmount: { amount: 9900, currency: 'usd' },
      interval: 'month',
      createdAt: iso(at(-20, 10, 0)),
      canceledAt: null,
      currentPeriodEnd: iso(at(10, 10, 0)),
    },
    {
      id: 'sub_mock_trial',
      status: 'trialing',
      customerLabel: 'Example Trial',
      planLabel: 'Struct Pro',
      monthlyAmount: { amount: 0, currency: 'usd' },
      interval: 'month',
      createdAt: iso(at(-2, 12, 0)),
      canceledAt: null,
      currentPeriodEnd: iso(at(12, 12, 0)),
    },
  ]

  const payments: Payment[] = [
    {
      id: 'pi_mock_ok',
      status: 'succeeded',
      amount: { amount: 9900, currency: 'usd' },
      customerLabel: 'Harbor Labs',
      description: 'Struct Team subscription',
      failureReason: null,
      createdAt: iso(at(-3, 9, 15)),
    },
    {
      id: 'pi_mock_fail',
      status: 'failed',
      amount: { amount: 2900, currency: 'usd' },
      customerLabel: 'Example Customer',
      description: 'Struct Pro renewal',
      failureReason: 'Card declined (mock).',
      createdAt: iso(at(-1, 8, 5)),
    },
  ]

  const paymentSummary: PaymentSummary = {
    mode: 'mock',
    currency: 'usd',
    mrr: { amount: 12800, currency: 'usd' },
    activeSubscriptions: 2,
    trialingSubscriptions: 1,
    pastDueSubscriptions: 0,
    canceledLast30Days: 0,
    newSubscriptionsLast30Days: 1,
    customers: 4,
    succeededPayments30d: 1,
    failedPayments30d: 1,
    grossVolume30d: { amount: 9900, currency: 'usd' },
    excludedCurrencies: [],
    computedAt: iso(now),
    truncated: false,
  }

  const security: SecurityState = {
    mode: 'armed_home',
    provider: 'home_assistant',
    panelName: 'Vivint panel',
    openSensors: [],
    unlockedLocks: [],
    lastChangedAt: iso(at(0, 7, 40)),
    lastChangedBy: first,
    controllable: true,
  }

  const presence: Omit<PresenceEstimate, 'personId'> = {
    personName: first,
    roomId: 'office',
    roomName: 'Office',
    status: 'PRESENT',
    confidence: 0.62,
    evidence: [
      {
        source: 'mock',
        description: 'Seeded estimate. No ring RSSI or ESP32 observation is available.',
        weight: 0.4,
        observedAt: iso(at(0, 16, 20)),
      },
    ],
    timestamp: iso(at(0, 16, 20)),
  }

  const weather: Weather = {
    available: true,
    provider: 'mock',
    location: 'Local (mock)',
    temperatureC: 18,
    feelsLikeC: 17,
    condition: 'Clear',
    highC: 22,
    lowC: 13,
    updatedAt: iso(now),
    isMock: true,
  }

  return {
    dateKey,
    rooms,
    devices,
    events,
    calendar,
    emails,
    tasks,
    suggestions,
    conversations,
    deployments,
    payments,
    subscriptions,
    paymentSummary,
    security,
    presence,
    weather,
    memory: {
      kind: 'project',
      content: 'Struct pricing discussions should keep the annual plan as the default. This memory was seeded, not extracted automatically.',
    },
    automation: {
      name: 'Arm bedroom camera when away',
      description: 'Example rule only. The automation engine does not run it yet. When it does, the action must pass through Atlas permissions.',
    },
  }
}

function eventCal(start: Date, end: Date, day: string, slug: string, title: string, location: string | null, allDay: boolean): CalendarEvent {
  return {
    id: `mock-cal-${day}-${slug}`,
    calendarId: 'primary',
    calendarName: 'Primary',
    title,
    description: null,
    location,
    start: iso(start),
    end: iso(end),
    allDay,
    startDate: null,
    endDate: null,
    status: 'confirmed',
    attendees: [],
    meetingUrl: null,
    htmlLink: null,
    organizer: null,
    updatedAt: iso(start),
  }
}
