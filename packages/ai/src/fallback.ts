import type { ToolOutput } from '@atlas/shared'
import { forcedTool } from './router'

export interface FallbackStep {
  toolId: string
  input: unknown
}

/** Deterministic tool plan used when the language model is not configured or the provider call fails. */
export function planFallback(text: string): FallbackStep[] {
  const q = text.toLowerCase()
  const forced = forcedTool(text)
  if (forced === 'timeline.whatHappened') {
    const hours = hourRange(q)
    return [{ toolId: 'timeline.whatHappened', input: hours ?? { preset: 'today' } }]
  }
  if (forced === 'calendar.getEvents') {
    return [{ toolId: 'calendar.getEvents', input: { preset: /tomorrow/.test(q) ? 'tomorrow' : 'today', limit: 8 } }]
  }
  if (forced === 'projects.getStatus') return [{ toolId: 'projects.getStatus', input: { slug: 'struct' } }]
  if (forced === 'email.getImportant') return [{ toolId: 'email.getImportant', input: { limit: 5 } }]
  if (forced === 'security.getState') return [{ toolId: 'security.getState', input: {} }, { toolId: 'room.getState', input: {} }]
  if (forced === 'conversations.search') {
    const topic = /pricing/.test(q) ? 'pricing' : undefined
    return [{ toolId: 'conversations.search', input: { ...(topic ? { query: topic } : {}), limit: 5 } }]
  }
  if (/task/.test(q)) return [{ toolId: 'tasks.list', input: { limit: 8 } }]
  return []
}

export function renderFallback(text: string, outputs: ToolOutput[], modelNote: string): string {
  const lines = [modelNote, '']
  if (outputs.length === 0) {
    lines.push('No Atlas tool matched that question, so there is nothing grounded to report.')
    lines.push('Try “What’s on my agenda?”, “What happened between 3 and 5?”, or “How is Struct doing?”')
    return lines.join('\n')
  }
  lines.push(`Question: ${text}`, '')
  for (const output of outputs) {
    lines.push(`### ${output.toolId}`, '')
    lines.push(renderOutput(output), '')
  }
  lines.push('This answer was assembled from Atlas tool results, not from an ungrounded model guess.')
  return lines.join('\n').trim()
}

function renderOutput(output: ToolOutput): string {
  if (output.status !== 'success') {
    return `Tool status: ${output.status}. ${output.error?.message ?? output.note ?? ''}`.trim()
  }
  const data = output.data
  if (!data || typeof data !== 'object') return 'The tool returned no data.'
  const record = data as Record<string, unknown>
  if (typeof record.narrative === 'string') return record.narrative
  if (Array.isArray(record.events) && record.range && typeof record.range === 'object') {
    const range = record.range as { label?: string }
    const events = record.events as { timestamp?: string; title?: string; summary?: string | null; source?: string }[]
    const bits = [`Range: ${range.label ?? 'requested range'}.`, '']
    if (events.length === 0) bits.push('No Atlas events were found in that range.')
    for (const event of events) {
      bits.push(`- ${event.timestamp ?? ''} — ${event.title ?? 'Event'}${event.summary ? ` — ${event.summary}` : ''} (${event.source ?? 'atlas'})`)
    }
    return bits.join('\n')
  }
  if (Array.isArray(record.events) && record.events.every((item) => item && typeof item === 'object' && 'title' in (item as object))) {
    return (record.events as { title?: string; start?: string }[]).map((event) => `- ${event.start ?? ''} ${event.title ?? ''}`).join('\n') || 'No events.'
  }
  return '```json\n' + JSON.stringify(trimData(data), null, 2) + '\n```'
}

function trimData(value: unknown): unknown {
  const json = JSON.stringify(value, (_key, inner: unknown) => {
    if (typeof inner === 'string' && inner.length > 400) return `${inner.slice(0, 400)}…`
    return inner
  })
  return JSON.parse(json) as unknown
}

function hourRange(text: string): { startHour: number; endHour: number } | null {
  const match = /between\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+and\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text)
  if (!match) return null
  const start = toHour(Number(match[1]), match[3])
  const end = toHour(Number(match[4]), match[6] ?? match[3])
  if (start === null || end === null) return null
  return { startHour: start, endHour: end }
}

function toHour(hour: number, meridiem: string | undefined): number | null {
  if (!Number.isFinite(hour)) return null
  const marker = meridiem?.toLowerCase()
  if (!marker) {
    if (hour >= 0 && hour <= 23) return hour
    return null
  }
  if (hour < 1 || hour > 12) return null
  if (marker === 'am') return hour === 12 ? 0 : hour
  return hour === 12 ? 12 : hour + 12
}
