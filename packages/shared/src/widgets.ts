import { z } from 'zod'
import { IsoDateTime } from './common'
import { EventCategory, EventSeverity } from './events'
import type { Permission } from './risk'

export const Breakpoint = z.enum(['desktop', 'tablet', 'mobile'])
export type Breakpoint = z.infer<typeof Breakpoint>

export const BREAKPOINT_COLUMNS: Record<Breakpoint, number> = { desktop: 12, tablet: 8, mobile: 4 }
/** Minimum viewport width (px) for each breakpoint. */
export const BREAKPOINT_MIN_WIDTH: Record<Breakpoint, number> = { desktop: 1180, tablet: 720, mobile: 0 }

export function breakpointForWidth(width: number): Breakpoint {
  if (width >= BREAKPOINT_MIN_WIDTH.desktop) return 'desktop'
  if (width >= BREAKPOINT_MIN_WIDTH.tablet) return 'tablet'
  return 'mobile'
}

export const WidgetType = z.enum([
  'atlas.status',
  'atlas.chat',
  'room.state',
  'security.status',
  'calendar.next',
  'calendar.agenda',
  'tasks.list',
  'timeline.recent',
  'cameras.preview',
  'struct.status',
  'email.important',
  'vercel.deployments',
  'stripe.summary',
  'conversations.recent',
  'system.health',
  'weather.current',
  'presence.ring',
  'devices.status',
  'controls.quick',
])
export type WidgetType = z.infer<typeof WidgetType>

const Limit = (def: number, max = 25) => z.number().int().min(1).max(max).default(def)

/** Settings schema per widget type. Unknown keys are stripped; missing keys take defaults. */
export const WIDGET_SETTINGS_SCHEMAS = {
  'atlas.status': z.object({ showStatusRow: z.boolean().default(true) }),
  'atlas.chat': z.object({ showSuggestions: z.boolean().default(true) }),
  'room.state': z.object({ roomKey: z.string().max(60).default('bedroom'), showSecurity: z.boolean().default(true) }),
  'security.status': z.object({ showSensors: z.boolean().default(true) }),
  'calendar.next': z.object({ includeAllDay: z.boolean().default(false) }),
  'calendar.agenda': z.object({ days: z.number().int().min(1).max(7).default(1), showAllDay: z.boolean().default(true) }),
  'tasks.list': z.object({
    limit: Limit(8, 50),
    showCompleted: z.boolean().default(false),
    project: z.string().max(120).nullable().default(null),
  }),
  'timeline.recent': z.object({
    limit: Limit(8, 40),
    categories: z.array(EventCategory).max(20).default([]),
    minSeverity: EventSeverity.default('info'),
  }),
  'cameras.preview': z.object({ cameraId: z.string().max(200).nullable().default(null), showEvents: z.boolean().default(true) }),
  'struct.status': z.object({ projectSlug: z.string().max(60).default('struct') }),
  'email.important': z.object({ limit: Limit(5, 15) }),
  'vercel.deployments': z.object({ limit: Limit(6, 20) }),
  'stripe.summary': z.object({ showRecent: z.boolean().default(true) }),
  'conversations.recent': z.object({ limit: Limit(4, 12) }),
  'system.health': z.object({ showChart: z.boolean().default(true) }),
  'weather.current': z.object({ units: z.enum(['imperial', 'metric']).default('imperial') }),
  'presence.ring': z.object({}),
  'devices.status': z.object({ onlyProblems: z.boolean().default(false), limit: Limit(10, 40) }),
  'controls.quick': z.object({ deviceIds: z.array(z.string().max(200)).max(12).default([]) }),
} satisfies Record<WidgetType, z.ZodObject>

export type WidgetSettings<T extends WidgetType> = z.infer<(typeof WIDGET_SETTINGS_SCHEMAS)[T]>

export type WidgetConfigField =
  | { key: string; label: string; kind: 'boolean' }
  | { key: string; label: string; kind: 'number'; min: number; max: number }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: 'multiselect'; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: 'text'; placeholder?: string }
  | { key: string; label: string; kind: 'camera' }
  | { key: string; label: string; kind: 'devices' }

export interface WidgetDefinitionMeta {
  type: WidgetType
  name: string
  description: string
  /** Lucide icon name (kebab-case). */
  icon: string
  category: 'atlas' | 'home' | 'personal' | 'business' | 'system'
  /** Sizes in 12-column desktop units; scaled for smaller breakpoints. */
  minW: number
  minH: number
  defaultW: number
  defaultH: number
  maxW?: number
  maxH?: number
  permissions: Permission[]
  /** Data dependencies the widget reads, used for realtime invalidation. */
  dataKeys: string[]
  fields: WidgetConfigField[]
}

const severityOptions = EventSeverity.options.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))
const categoryOptions = EventCategory.options.map((c) => ({ value: c, label: c[0]!.toUpperCase() + c.slice(1) }))

export const WIDGET_DEFINITIONS: Record<WidgetType, WidgetDefinitionMeta> = {
  'atlas.status': {
    type: 'atlas.status',
    name: 'Atlas status',
    description: 'Greeting, date and a compact status of Atlas, room, security and server.',
    icon: 'sparkle',
    category: 'atlas',
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 3,
    permissions: ['system:read'],
    dataKeys: ['overview'],
    fields: [{ key: 'showStatusRow', label: 'Show status row', kind: 'boolean' }],
  },
  'atlas.chat': {
    type: 'atlas.chat',
    name: 'Ask Atlas',
    description: 'Quick question box that opens the answer in Atlas chat.',
    icon: 'message-square',
    category: 'atlas',
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 3,
    permissions: [],
    dataKeys: [],
    fields: [{ key: 'showSuggestions', label: 'Show suggested questions', kind: 'boolean' }],
  },
  'room.state': {
    type: 'room.state',
    name: 'Room',
    description: 'Occupancy, climate, lights and doors for a room, with security summary.',
    icon: 'bed-double',
    category: 'home',
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 3,
    permissions: ['home:read'],
    dataKeys: ['room', 'security', 'devices'],
    fields: [
      { key: 'roomKey', label: 'Room', kind: 'text', placeholder: 'bedroom' },
      { key: 'showSecurity', label: 'Show security summary', kind: 'boolean' },
    ],
  },
  'security.status': {
    type: 'security.status',
    name: 'Security',
    description: 'Alarm state, open sensors and unlocked doors.',
    icon: 'shield',
    category: 'home',
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 3,
    permissions: ['security:read'],
    dataKeys: ['security'],
    fields: [{ key: 'showSensors', label: 'List open sensors', kind: 'boolean' }],
  },
  'calendar.next': {
    type: 'calendar.next',
    name: 'Next event',
    description: 'Your next calendar event with countdown.',
    icon: 'calendar-clock',
    category: 'personal',
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 3,
    permissions: ['calendar:read'],
    dataKeys: ['calendar'],
    fields: [{ key: 'includeAllDay', label: 'Include all-day events', kind: 'boolean' }],
  },
  'calendar.agenda': {
    type: 'calendar.agenda',
    name: 'Agenda',
    description: "Today's events, optionally the next few days.",
    icon: 'calendar',
    category: 'personal',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 6,
    permissions: ['calendar:read'],
    dataKeys: ['calendar'],
    fields: [
      { key: 'days', label: 'Days to show', kind: 'number', min: 1, max: 7 },
      { key: 'showAllDay', label: 'Show all-day events', kind: 'boolean' },
    ],
  },
  'tasks.list': {
    type: 'tasks.list',
    name: 'Tasks',
    description: 'Open Atlas tasks with quick completion.',
    icon: 'list-checks',
    category: 'personal',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 6,
    permissions: ['tasks:read'],
    dataKeys: ['tasks'],
    fields: [
      { key: 'limit', label: 'Maximum tasks', kind: 'number', min: 1, max: 50 },
      { key: 'showCompleted', label: 'Show completed', kind: 'boolean' },
      { key: 'project', label: 'Project filter', kind: 'text', placeholder: 'Any project' },
    ],
  },
  'timeline.recent': {
    type: 'timeline.recent',
    name: 'Recent activity',
    description: 'Latest Atlas timeline events.',
    icon: 'activity',
    category: 'atlas',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 6,
    permissions: ['timeline:read'],
    dataKeys: ['events'],
    fields: [
      { key: 'limit', label: 'Maximum events', kind: 'number', min: 1, max: 40 },
      { key: 'minSeverity', label: 'Minimum severity', kind: 'select', options: severityOptions },
      { key: 'categories', label: 'Categories (empty = all)', kind: 'multiselect', options: categoryOptions },
    ],
  },
  'cameras.preview': {
    type: 'cameras.preview',
    name: 'Camera',
    description: 'Latest snapshot and recent motion from one camera.',
    icon: 'cctv',
    category: 'home',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 6,
    permissions: ['cameras:read'],
    dataKeys: ['cameras'],
    fields: [
      { key: 'cameraId', label: 'Camera', kind: 'camera' },
      { key: 'showEvents', label: 'Show recent motion', kind: 'boolean' },
    ],
  },
  'struct.status': {
    type: 'struct.status',
    name: 'Project status',
    description: 'Deployments, revenue and health for a project such as Struct.',
    icon: 'box',
    category: 'business',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 6,
    permissions: ['deployments:read', 'payments:read'],
    dataKeys: ['projects', 'deployments', 'payments'],
    fields: [{ key: 'projectSlug', label: 'Project', kind: 'text', placeholder: 'struct' }],
  },
  'email.important': {
    type: 'email.important',
    name: 'Important email',
    description: 'Unread messages Gmail or Atlas marked important.',
    icon: 'mail',
    category: 'personal',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 6,
    permissions: ['email:read'],
    dataKeys: ['email'],
    fields: [{ key: 'limit', label: 'Maximum messages', kind: 'number', min: 1, max: 15 }],
  },
  'vercel.deployments': {
    type: 'vercel.deployments',
    name: 'Deployments',
    description: 'Recent Vercel deployments across tracked projects.',
    icon: 'rocket',
    category: 'business',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
    permissions: ['deployments:read'],
    dataKeys: ['deployments'],
    fields: [{ key: 'limit', label: 'Maximum deployments', kind: 'number', min: 1, max: 20 }],
  },
  'stripe.summary': {
    type: 'stripe.summary',
    name: 'Revenue',
    description: 'MRR, subscriptions and payment health from Stripe.',
    icon: 'circle-dollar-sign',
    category: 'business',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
    permissions: ['payments:read'],
    dataKeys: ['payments'],
    fields: [{ key: 'showRecent', label: 'Show recent payments', kind: 'boolean' }],
  },
  'conversations.recent': {
    type: 'conversations.recent',
    name: 'Conversations',
    description: 'Recent conversation summaries and pending task suggestions.',
    icon: 'audio-lines',
    category: 'personal',
    minW: 3,
    minH: 3,
    defaultW: 6,
    defaultH: 5,
    permissions: ['conversations:read'],
    dataKeys: ['conversations'],
    fields: [{ key: 'limit', label: 'Maximum conversations', kind: 'number', min: 1, max: 12 }],
  },
  'system.health': {
    type: 'system.health',
    name: 'System health',
    description: 'Atlas services, database and host resources.',
    icon: 'server',
    category: 'system',
    minW: 3,
    minH: 3,
    defaultW: 6,
    defaultH: 5,
    permissions: ['system:read'],
    dataKeys: ['system'],
    fields: [{ key: 'showChart', label: 'Show resource chart', kind: 'boolean' }],
  },
  'weather.current': {
    type: 'weather.current',
    name: 'Weather',
    description: 'Current conditions (provider not yet configured).',
    icon: 'cloud-sun',
    category: 'personal',
    minW: 2,
    minH: 2,
    defaultW: 3,
    defaultH: 3,
    permissions: [],
    dataKeys: ['weather'],
    fields: [
      {
        key: 'units',
        label: 'Units',
        kind: 'select',
        options: [
          { value: 'imperial', label: 'Imperial (°F)' },
          { value: 'metric', label: 'Metric (°C)' },
        ],
      },
    ],
  },
  'presence.ring': {
    type: 'presence.ring',
    name: 'Presence',
    description: 'Room presence estimate and smart ring status (hardware pending).',
    icon: 'radar',
    category: 'home',
    minW: 2,
    minH: 2,
    defaultW: 3,
    defaultH: 3,
    permissions: ['home:read'],
    dataKeys: ['presence'],
    fields: [],
  },
  'devices.status': {
    type: 'devices.status',
    name: 'Devices',
    description: 'Online state and battery of Atlas-known devices.',
    icon: 'cpu',
    category: 'home',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
    permissions: ['home:read'],
    dataKeys: ['devices'],
    fields: [
      { key: 'onlyProblems', label: 'Only offline or low battery', kind: 'boolean' },
      { key: 'limit', label: 'Maximum devices', kind: 'number', min: 1, max: 40 },
    ],
  },
  'controls.quick': {
    type: 'controls.quick',
    name: 'Quick controls',
    description: 'Toggle lights and switches. Actions go through Atlas permissions and audit.',
    icon: 'toggle-right',
    category: 'home',
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 3,
    permissions: ['home:control'],
    dataKeys: ['devices'],
    fields: [{ key: 'deviceIds', label: 'Devices', kind: 'devices' }],
  },
}

export const WidgetInstance = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{4,64}$/),
  type: WidgetType,
  x: z.number().int().min(0).max(47),
  y: z.number().int().min(0).max(999),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(24),
  settings: z.record(z.string(), z.unknown()).default({}),
})
export type WidgetInstance = z.infer<typeof WidgetInstance>

export const DashboardLayout = z.object({
  breakpoint: Breakpoint,
  columns: z.number().int(),
  widgets: z.array(WidgetInstance).max(60),
  isDefault: z.boolean(),
  version: z.number().int(),
  updatedAt: IsoDateTime.nullable(),
})
export type DashboardLayout = z.infer<typeof DashboardLayout>

export const SaveLayoutInput = z.object({
  widgets: z.array(WidgetInstance).max(60),
  /** Optimistic concurrency: the version the client last loaded. */
  baseVersion: z.number().int().nullable(),
})
export type SaveLayoutInput = z.input<typeof SaveLayoutInput>

/** Scale a desktop-unit size to a breakpoint's column count. */
export function scaleWidth(w: number, columns: number): number {
  return Math.max(1, Math.min(columns, Math.round((w * columns) / 12)))
}

export function minSizeFor(type: WidgetType, columns: number): { minW: number; minH: number } {
  const def = WIDGET_DEFINITIONS[type]
  return { minW: Math.min(columns, Math.max(1, Math.ceil((def.minW * columns) / 12))), minH: def.minH }
}

/** Parse and default a widget's settings; invalid values fall back to defaults. */
export function normalizeWidgetSettings(type: WidgetType, raw: unknown): Record<string, unknown> {
  const schema = WIDGET_SETTINGS_SCHEMAS[type]
  const parsed = schema.safeParse(raw ?? {})
  if (parsed.success) return parsed.data as Record<string, unknown>
  return schema.parse({}) as Record<string, unknown>
}

/**
 * Clamp a widget instance to the grid: sizes within the definition's limits, x within the columns,
 * settings validated. Used by the server before persisting and by the client before rendering.
 */
export function normalizeWidget(widget: WidgetInstance, columns: number): WidgetInstance {
  const { minW, minH } = minSizeFor(widget.type, columns)
  const def = WIDGET_DEFINITIONS[widget.type]
  const maxH = def.maxH ?? 24
  const w = Math.min(columns, Math.max(minW, widget.w))
  const h = Math.min(maxH, Math.max(minH, widget.h))
  const x = Math.min(Math.max(0, widget.x), columns - w)
  return { id: widget.id, type: widget.type, x, y: Math.max(0, widget.y), w, h, settings: normalizeWidgetSettings(widget.type, widget.settings) }
}

const DEFAULT_DESKTOP: Array<Omit<WidgetInstance, 'settings'>> = [
  { id: 'status', type: 'atlas.status', x: 0, y: 0, w: 4, h: 3 },
  { id: 'room', type: 'room.state', x: 4, y: 0, w: 4, h: 3 },
  { id: 'next-event', type: 'calendar.next', x: 8, y: 0, w: 4, h: 3 },
  { id: 'agenda', type: 'calendar.agenda', x: 0, y: 3, w: 4, h: 6 },
  { id: 'tasks', type: 'tasks.list', x: 4, y: 3, w: 4, h: 6 },
  { id: 'timeline', type: 'timeline.recent', x: 8, y: 3, w: 4, h: 6 },
  { id: 'camera', type: 'cameras.preview', x: 0, y: 9, w: 4, h: 6 },
  { id: 'struct', type: 'struct.status', x: 4, y: 9, w: 4, h: 6 },
  { id: 'email', type: 'email.important', x: 8, y: 9, w: 4, h: 6 },
  { id: 'conversations', type: 'conversations.recent', x: 0, y: 15, w: 6, h: 5 },
  { id: 'system', type: 'system.health', x: 6, y: 15, w: 6, h: 5 },
]

/**
 * Re-flow widgets (in reading order) into a narrower grid, preserving relative widths.
 * Deterministic so a reset always produces the same layout.
 */
export function reflowLayout(widgets: WidgetInstance[], columns: number): WidgetInstance[] {
  const ordered = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: WidgetInstance[] = []
  let cursorX = 0
  let rowY = 0
  let rowH = 0
  for (const widget of ordered) {
    const { minW, minH } = minSizeFor(widget.type, columns)
    let w = Math.max(minW, scaleWidth(widget.w, columns))
    if (columns <= 4) w = columns
    const h = Math.max(minH, widget.h)
    if (cursorX + w > columns) {
      rowY += rowH
      cursorX = 0
      rowH = 0
    }
    out.push({ ...widget, x: cursorX, y: rowY, w, h })
    cursorX += w
    rowH = Math.max(rowH, h)
  }
  return out
}

export function defaultLayout(breakpoint: Breakpoint): WidgetInstance[] {
  const desktop = DEFAULT_DESKTOP.map((w) => ({ ...w, settings: normalizeWidgetSettings(w.type, {}) }))
  if (breakpoint === 'desktop') return desktop
  return reflowLayout(desktop, BREAKPOINT_COLUMNS[breakpoint])
}
