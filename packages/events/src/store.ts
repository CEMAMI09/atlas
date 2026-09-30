import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import { events, type Database, type Executor } from '@atlas/database'
import {
  AtlasEvent,
  type AtlasEvent as AtlasEventType,
  type EventActor,
  type EventCategory,
  type EventLocation,
  type EventSeverity,
  type SourceLink,
  type TimelinePage,
  type TimelineQuery,
} from '@atlas/shared'
import { normalizeEvent, type NormalizedEvent } from './normalize'

type EventRow = typeof events.$inferSelect

export interface EventVisibility {
  /** Sources whose mock rows may be shown. Mock rows from other sources are hidden. */
  mockSources: readonly string[]
}

export function rowToEvent(row: EventRow): AtlasEventType {
  const event: AtlasEventType = {
    id: row.id,
    timestamp: row.occurredAt.toISOString(),
    source: row.source,
    category: row.category as EventCategory,
    type: row.type,
    title: row.title,
    summary: row.summary,
    severity: row.severity as EventSeverity,
    actor: (row.actor as EventActor | null) ?? null,
    location: (row.location as EventLocation | null) ?? null,
    entityId: row.entityId,
    metadata: row.metadata ?? {},
    links: (row.links as SourceLink[]) ?? [],
    correlationId: row.correlationId,
    isMock: row.isMock,
  }
  return AtlasEvent.parse(event)
}

/** Insert events idempotently. Existing dedupe keys are left untouched. */
export async function ingestEvents(db: Executor, drafts: NormalizedEvent[]): Promise<number> {
  if (drafts.length === 0) return 0
  const inserted = await db
    .insert(events)
    .values(
      drafts.map((draft) => ({
        occurredAt: draft.occurredAt,
        source: draft.source,
        category: draft.category,
        type: draft.type,
        title: draft.title,
        summary: draft.summary,
        severity: draft.severity,
        actor: draft.actor,
        location: draft.location,
        roomKey: draft.roomKey,
        entityId: draft.entityId,
        metadata: draft.metadata,
        links: draft.links,
        correlationId: draft.correlationId,
        dedupeKey: draft.dedupeKey,
        isMock: draft.isMock,
      })),
    )
    .onConflictDoNothing({ target: events.dedupeKey })
    .returning({ id: events.id })
  return inserted.length
}

export async function ingestDrafts(db: Executor, drafts: Parameters<typeof normalizeEvent>[0][]): Promise<number> {
  return ingestEvents(db, drafts.map((draft) => normalizeEvent(draft)))
}

export async function queryTimeline(
  db: Database,
  query: TimelineQuery,
  visibility: EventVisibility,
): Promise<TimelinePage> {
  const filters: SQL[] = [visibilityFilter(visibility)]
  if (query.start) filters.push(gte(events.occurredAt, new Date(query.start)))
  if (query.end) filters.push(lt(events.occurredAt, new Date(query.end)))
  if (query.sources && query.sources.length > 0) filters.push(inArray(events.source, query.sources))
  if (query.categories && query.categories.length > 0) filters.push(inArray(events.category, query.categories))
  if (query.severities && query.severities.length > 0) filters.push(inArray(events.severity, query.severities))
  if (query.minSeverity) {
    const allowed = (['debug', 'info', 'notice', 'warning', 'critical'] as const).filter(
      (level) => severityAtLeast(level, query.minSeverity!),
    )
    filters.push(inArray(events.severity, [...allowed]))
  }
  if (query.roomId) filters.push(eq(events.roomKey, query.roomId))
  if (query.actor) {
    const pattern = `%${escapeLike(query.actor)}%`
    filters.push(sql`${events.actor}->>'name' ILIKE ${pattern}`)
  }
  if (query.q) {
    filters.push(sql`${events.search} @@ websearch_to_tsquery('english', ${query.q})`)
  }
  const cursor = query.before ? decodeCursor(query.before) : null
  if (cursor) {
    const older =
      query.order === 'asc'
        ? or(gtDate(cursor.at), and(eq(events.occurredAt, cursor.at), sql`${events.id} > ${cursor.id}`))
        : or(lt(events.occurredAt, cursor.at), and(eq(events.occurredAt, cursor.at), sql`${events.id} < ${cursor.id}`))
    if (older) filters.push(older)
  }

  const limit = query.limit
  const rows = await db
    .select()
    .from(events)
    .where(and(...filters))
    .orderBy(query.order === 'asc' ? asc(events.occurredAt) : desc(events.occurredAt), query.order === 'asc' ? asc(events.id) : desc(events.id))
    .limit(limit + 1)

  const page = rows.slice(0, limit).map(rowToEvent)
  const last = page.at(-1)
  const nextCursor = rows.length > limit && last ? `${last.timestamp}|${last.id}` : null
  return { events: page, nextCursor }
}

export async function hasDedupeKey(db: Executor, dedupeKey: string): Promise<boolean> {
  const rows = await db.select({ id: events.id }).from(events).where(eq(events.dedupeKey, dedupeKey)).limit(1)
  return rows.length > 0
}

function visibilityFilter(visibility: EventVisibility): SQL {
  if (visibility.mockSources.length === 0) return eq(events.isMock, false)
  return or(eq(events.isMock, false), inArray(events.source, [...visibility.mockSources])) ?? eq(events.isMock, false)
}

function severityAtLeast(level: EventSeverity, minimum: EventSeverity): boolean {
  const rank: Record<EventSeverity, number> = { debug: 0, info: 1, notice: 2, warning: 3, critical: 4 }
  return rank[level] >= rank[minimum]
}

function gtDate(date: Date): SQL {
  return sql`${events.occurredAt} > ${date}`
}

function decodeCursor(value: string): { at: Date; id: string } | null {
  const split = value.lastIndexOf('|')
  if (split <= 0) return null
  const at = new Date(value.slice(0, split))
  const id = value.slice(split + 1)
  if (Number.isNaN(at.getTime()) || !id) return null
  return { at, id }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}
