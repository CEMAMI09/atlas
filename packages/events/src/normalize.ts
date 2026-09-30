import {
  AtlasEventDraft,
  AtlasError,
  getEventTypeInfo,
  type AtlasEventDraft as AtlasEventDraftType,
  type EventCategory,
  type EventSeverity,
} from '@atlas/shared'

export interface NormalizedEvent {
  occurredAt: Date
  source: string
  category: EventCategory
  type: string
  title: string
  summary: string | null
  severity: EventSeverity
  actor: { kind: string; id: string | null; name: string } | null
  location: { roomId: string | null; name: string } | null
  roomKey: string | null
  entityId: string | null
  metadata: Record<string, unknown>
  links: { label: string; url: string }[]
  correlationId: string | null
  dedupeKey: string | null
  isMock: boolean
}

const MAX_METADATA_BYTES = 16 * 1024

/** Keep metadata JSON-safe and bounded: drops functions/undefined, caps size. */
export function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) return {}
  const json = JSON.stringify(metadata, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'function' || typeof value === 'symbol') return undefined
    return value
  })
  if (!json) return {}
  if (Buffer.byteLength(json, 'utf8') > MAX_METADATA_BYTES) {
    return { truncated: true, keys: Object.keys(metadata).slice(0, 50) }
  }
  return JSON.parse(json) as Record<string, unknown>
}

/**
 * Validate and complete an event draft. Integrations never write rows directly — every event
 * passes through here so the timeline only ever contains well-formed AtlasEvents.
 */
export function normalizeEvent(input: AtlasEventDraftType): NormalizedEvent {
  const parsed = AtlasEventDraft.safeParse(input)
  if (!parsed.success) {
    throw new AtlasError('VALIDATION_FAILED', 'Invalid event draft', {
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  const draft = parsed.data
  const info = getEventTypeInfo(draft.type)
  const category = draft.category ?? info?.category
  if (!category) {
    throw new AtlasError('VALIDATION_FAILED', `Unknown event type "${draft.type}" requires an explicit category`)
  }
  const location = draft.location ?? null
  return {
    occurredAt: new Date(draft.timestamp),
    source: draft.source,
    category,
    type: draft.type,
    title: draft.title.trim(),
    summary: draft.summary?.trim() || null,
    severity: draft.severity ?? info?.severity ?? 'info',
    actor: draft.actor ?? null,
    location,
    roomKey: location?.roomId ?? null,
    entityId: draft.entityId ?? null,
    metadata: sanitizeMetadata(draft.metadata),
    links: draft.links ?? [],
    correlationId: draft.correlationId ?? null,
    dedupeKey: draft.dedupeKey ?? null,
    isMock: draft.isMock ?? false,
  }
}
