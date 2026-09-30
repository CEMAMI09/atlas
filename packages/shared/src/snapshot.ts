import { z } from 'zod'
import { CalendarEvent } from './calendar'
import { IsoDateTime } from './common'
import { Conversation, PrivacyStatus } from './conversations'
import { EmailSummary } from './email'
import { AtlasEvent } from './events'
import { Camera, CameraEvent, Device, PresenceEstimate, Room, RoomState, SecurityState } from './home'
import { OverviewStatus } from './overview'
import { Deployment, Payment, PaymentSummary, ProjectStatus } from './business'
import { Task, TaskSuggestion } from './tasks'
import { Weather } from './knowledge'

/** One payload for the overview dashboard so widgets do not each poll. */
export const DashboardSnapshot = z.object({
  overview: OverviewStatus,
  calendar: z.array(CalendarEvent),
  tasks: z.array(Task),
  suggestions: z.array(TaskSuggestion),
  events: z.array(AtlasEvent),
  cameras: z.array(Camera),
  cameraEvents: z.array(CameraEvent),
  emails: z.array(EmailSummary),
  deployments: z.array(Deployment),
  payments: PaymentSummary.nullable(),
  recentPayments: z.array(Payment),
  project: ProjectStatus.nullable(),
  conversations: z.array(Conversation),
  devices: z.array(Device),
  rooms: z.array(Room),
  room: RoomState.nullable(),
  security: SecurityState.nullable(),
  weather: Weather,
  presence: PresenceEstimate.nullable(),
  privacy: PrivacyStatus,
  generatedAt: IsoDateTime,
})
export type DashboardSnapshot = z.infer<typeof DashboardSnapshot>
