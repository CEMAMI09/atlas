import { SEVERITY_RANK, type AtlasEvent, type EventSeverity } from '@atlas/shared'

const CATEGORY_WEIGHT: Record<string, number> = {
  security: 50,
  camera: 36,
  door: 34,
  presence: 28,
  deployment: 26,
  payment: 24,
  email: 18,
  conversation: 16,
  calendar: 12,
  device: 10,
  task: 8,
  automation: 8,
  integration: 6,
  system: 4,
  atlas: 4,
}

/** Higher scores are more relevant to a "what happened" digest. Presentation stays chronological. */
export function rankEvents(events: AtlasEvent[]): AtlasEvent[] {
  return [...events].sort((a, b) => score(b) - score(a) || Date.parse(b.timestamp) - Date.parse(a.timestamp))
}

export function score(event: AtlasEvent): number {
  const severity = SEVERITY_RANK[event.severity as EventSeverity] ?? 1
  const category = CATEGORY_WEIGHT[event.category] ?? 0
  const novel = event.correlationId ? 0 : 4
  return severity * 20 + category + novel
}

/** Keep the highest-ranked events, then return them in time order for a narrative. */
export function selectDigest(events: AtlasEvent[], limit: number): AtlasEvent[] {
  const picked = rankEvents(events).slice(0, limit)
  return picked.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}
