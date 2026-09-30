import { z } from 'zod'
import { IsoDateTime } from './common'

export const CalendarAttendee = z.object({
  email: z.string().max(320).nullable(),
  name: z.string().max(200).nullable(),
  responseStatus: z.enum(['needsAction', 'declined', 'tentative', 'accepted', 'unknown']),
  self: z.boolean(),
})
export type CalendarAttendee = z.infer<typeof CalendarAttendee>

export const CalendarEvent = z.object({
  id: z.string(),
  calendarId: z.string(),
  calendarName: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  start: IsoDateTime,
  end: IsoDateTime,
  allDay: z.boolean(),
  /** For all-day events: local `YYYY-MM-DD` dates (end exclusive). */
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']),
  attendees: z.array(CalendarAttendee),
  meetingUrl: z.string().nullable(),
  htmlLink: z.string().nullable(),
  organizer: z.string().nullable(),
  updatedAt: IsoDateTime.nullable(),
})
export type CalendarEvent = z.infer<typeof CalendarEvent>

export const CalendarInfo = z.object({
  id: z.string(),
  name: z.string(),
  primary: z.boolean(),
  color: z.string().nullable(),
  accessRole: z.enum(['owner', 'writer', 'reader', 'freeBusyReader']),
})
export type CalendarInfo = z.infer<typeof CalendarInfo>

export const CreateCalendarEventInput = z
  .object({
    title: z.string().trim().min(1).max(300),
    start: IsoDateTime,
    end: IsoDateTime,
    description: z.string().trim().max(8000).optional(),
    location: z.string().trim().max(500).optional(),
    calendarId: z.string().max(300).optional(),
  })
  .refine((v) => new Date(v.end).getTime() > new Date(v.start).getTime(), {
    message: 'end must be after start',
    path: ['end'],
  })
export type CreateCalendarEventInput = z.infer<typeof CreateCalendarEventInput>

export const UpdateCalendarEventInput = z.object({
  eventId: z.string().min(1).max(300),
  calendarId: z.string().max(300).optional(),
  changes: z
    .object({
      title: z.string().trim().min(1).max(300),
      start: IsoDateTime,
      end: IsoDateTime,
      description: z.string().trim().max(8000),
      location: z.string().trim().max(500),
    })
    .partial()
    .refine((c) => Object.keys(c).length > 0, { message: 'At least one change is required' }),
})
export type UpdateCalendarEventInput = z.infer<typeof UpdateCalendarEventInput>
