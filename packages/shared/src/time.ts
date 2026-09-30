/**
 * Time-zone utilities built on `Intl` only. All persisted timestamps are UTC; these helpers convert
 * between UTC instants and wall-clock time in an IANA zone, handling DST gaps and overlaps.
 */

export interface LocalDateTime {
  year: number
  /** 1–12 */
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export interface ZonedParts extends LocalDateTime {
  /** 0 = Sunday */
  weekday: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    })
    formatterCache.set(timeZone, f)
  }
  return f
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const out: Partial<ZonedParts> = {}
  for (const part of partsFormatter(timeZone).formatToParts(date)) {
    switch (part.type) {
      case 'year':
        out.year = Number(part.value)
        break
      case 'month':
        out.month = Number(part.value)
        break
      case 'day':
        out.day = Number(part.value)
        break
      case 'hour':
        out.hour = Number(part.value) % 24
        break
      case 'minute':
        out.minute = Number(part.value)
        break
      case 'second':
        out.second = Number(part.value)
        break
      case 'weekday':
        out.weekday = WEEKDAYS[part.value] ?? 0
        break
    }
  }
  return out as ZonedParts
}

/** Offset of `timeZone` from UTC at the given instant, in milliseconds (e.g. -7h for PDT). */
export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const truncated = Math.floor(date.getTime() / 1000) * 1000
  return asUtc - truncated
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC instant.
 * - Nonexistent times (spring-forward gap) resolve forward, e.g. 02:30 → 03:30.
 * - Ambiguous times (fall-back overlap) resolve to the earlier instant.
 */
export function zonedTimeToUtc(local: LocalDateTime, timeZone: string): Date {
  const naive = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second)
  // Offsets a few hours either side cover any DST transition near `naive`.
  const offsetBefore = getTimeZoneOffsetMs(new Date(naive - 6 * 3_600_000), timeZone)
  const offsetAfter = getTimeZoneOffsetMs(new Date(naive + 6 * 3_600_000), timeZone)
  const candidates = [naive - offsetBefore, naive - offsetAfter]
  const valid = candidates.filter((utc) => getTimeZoneOffsetMs(new Date(utc), timeZone) === naive - utc)
  if (valid.length > 0) return new Date(Math.min(...valid))
  // In a gap: the local time does not exist. Shift forward by the size of the gap.
  return new Date(naive - offsetBefore)
}

export function startOfZonedDay(date: Date, timeZone: string): Date {
  const p = getZonedParts(date, timeZone)
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0, second: 0 }, timeZone)
}

/** Add calendar days in the given zone (keeps wall-clock time; DST-safe). */
export function addZonedDays(date: Date, days: number, timeZone: string): Date {
  const p = getZonedParts(date, timeZone)
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return zonedTimeToUtc(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: p.hour,
      minute: p.minute,
      second: p.second,
    },
    timeZone,
  )
}

export function endOfZonedDay(date: Date, timeZone: string): Date {
  return addZonedDays(startOfZonedDay(date, timeZone), 1, timeZone)
}

/** `YYYY-MM-DD` of the instant in the zone. */
export function toLocalDateKey(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** `YYYY-MM-DDTHH:mm` of the instant in the zone. */
export function toLocalDateTimeString(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/
const OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i

/**
 * Parse either a local wall-clock string (`2026-09-29T15:00`, `2026-09-29`) interpreted in
 * `timeZone`, or an ISO string with an explicit offset. Returns null for invalid input.
 */
export function parseDateTimeInZone(value: string, timeZone: string): Date | null {
  const trimmed = value.trim()
  if (OFFSET_RE.test(trimmed)) {
    const d = new Date(trimmed)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const m = LOCAL_RE.exec(trimmed)
  if (!m) return null
  const local: LocalDateTime = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: m[4] ? Number(m[4]) : 0,
    minute: m[5] ? Number(m[5]) : 0,
    second: m[6] ? Number(m[6]) : 0,
  }
  if (local.month < 1 || local.month > 12 || local.day < 1 || local.day > 31) return null
  if (local.hour > 23 || local.minute > 59 || local.second > 59) return null
  const check = new Date(Date.UTC(local.year, local.month - 1, local.day))
  if (check.getUTCDate() !== local.day) return null
  return zonedTimeToUtc(local, timeZone)
}

export interface ResolvedRange {
  start: Date
  end: Date
  timeZone: string
  /** Human description such as "Tue, Sep 29, 3:00 PM – 5:00 PM (America/Los_Angeles)". */
  label: string
}

export const RANGE_PRESETS = [
  'last_hour',
  'last_3_hours',
  'last_24_hours',
  'today',
  'yesterday',
  'this_week',
  'last_7_days',
  'tonight',
  'this_morning',
  'this_afternoon',
] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

/** Resolve a named relative range against `now` in the user's zone. */
export function resolvePresetRange(preset: RangePreset, now: Date, timeZone: string): ResolvedRange {
  const dayStart = startOfZonedDay(now, timeZone)
  const at = (hour: number, base = dayStart) => {
    const p = getZonedParts(base, timeZone)
    return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour, minute: 0, second: 0 }, timeZone)
  }
  let start: Date
  let end: Date = now
  switch (preset) {
    case 'last_hour':
      start = new Date(now.getTime() - 3_600_000)
      break
    case 'last_3_hours':
      start = new Date(now.getTime() - 3 * 3_600_000)
      break
    case 'last_24_hours':
      start = new Date(now.getTime() - 24 * 3_600_000)
      break
    case 'today':
      start = dayStart
      break
    case 'yesterday':
      start = addZonedDays(dayStart, -1, timeZone)
      end = dayStart
      break
    case 'this_week': {
      const weekday = getZonedParts(now, timeZone).weekday
      const mondayOffset = (weekday + 6) % 7
      start = addZonedDays(dayStart, -mondayOffset, timeZone)
      break
    }
    case 'last_7_days':
      start = addZonedDays(dayStart, -6, timeZone)
      break
    case 'this_morning':
      start = at(5)
      end = minDate(at(12), now)
      break
    case 'this_afternoon':
      start = at(12)
      end = minDate(at(17), now)
      break
    case 'tonight':
      start = at(17)
      end = now.getTime() > start.getTime() ? now : at(23)
      break
  }
  return { start, end, timeZone, label: formatRangeLabel(start, end, timeZone) }
}

/**
 * Resolve an hour-of-day range with no explicit date ("between 3 and 5") to its most recent
 * occurrence that has already started. Hours are 0–23 in the user's zone.
 */
export function resolveRecentHourRange(
  startHour: number,
  endHour: number,
  now: Date,
  timeZone: string,
  startMinute = 0,
  endMinute = 0,
): ResolvedRange {
  const today = getZonedParts(now, timeZone)
  const build = (dayOffset: number) => {
    const base = addZonedDays(
      zonedTimeToUtc({ year: today.year, month: today.month, day: today.day, hour: 12, minute: 0, second: 0 }, timeZone),
      dayOffset,
      timeZone,
    )
    const b = getZonedParts(base, timeZone)
    const start = zonedTimeToUtc(
      { year: b.year, month: b.month, day: b.day, hour: startHour, minute: startMinute, second: 0 },
      timeZone,
    )
    let end = zonedTimeToUtc({ year: b.year, month: b.month, day: b.day, hour: endHour, minute: endMinute, second: 0 }, timeZone)
    if (end.getTime() <= start.getTime()) end = addZonedDays(end, 1, timeZone)
    return { start, end }
  }
  let range = build(0)
  if (range.start.getTime() > now.getTime()) range = build(-1)
  return { ...range, timeZone, label: formatRangeLabel(range.start, range.end, timeZone) }
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}

export function formatRangeLabel(start: Date, end: Date, timeZone: string): string {
  const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
  const sameDay = toLocalDateKey(start, timeZone) === toLocalDateKey(new Date(end.getTime() - 1), timeZone)
  const left = `${dateFmt.format(start)}, ${timeFmt.format(start)}`
  const right = sameDay ? timeFmt.format(end) : `${dateFmt.format(end)}, ${timeFmt.format(end)}`
  return `${left} – ${right} (${timeZone})`
}

export function formatLocalTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date)
}

export function formatLocalDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function greetingFor(date: Date, timeZone: string): 'Good morning' | 'Good afternoon' | 'Good evening' {
  const hour = getZonedParts(date, timeZone).hour
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}
