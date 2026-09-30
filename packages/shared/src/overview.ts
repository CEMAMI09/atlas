import { z } from 'zod'
import { IsoDateTime } from './common'
import { CalendarEvent } from './calendar'
import { PresenceStatus, SecurityMode } from './home'
import { HealthState } from './system'

/** Compact data for the overview header and the Atlas status widget. */
export const OverviewStatus = z.object({
  greeting: z.string(),
  userName: z.string(),
  timezone: z.string(),
  now: IsoDateTime,
  atlas: z.object({ state: z.enum(['online', 'degraded', 'offline']), aiAvailable: z.boolean(), aiMode: z.enum(['live', 'unavailable']) }),
  room: z.object({ label: z.string(), status: PresenceStatus, roomName: z.string().nullable(), isMock: z.boolean() }),
  security: z.object({ mode: SecurityMode, label: z.string(), available: z.boolean(), isMock: z.boolean() }),
  nextEvent: CalendarEvent.nullable(),
  nextEventAvailable: z.boolean(),
  server: z.object({ state: HealthState, label: z.string() }),
  mockMode: z.boolean(),
  privacyMode: z.boolean(),
})
export type OverviewStatus = z.infer<typeof OverviewStatus>
