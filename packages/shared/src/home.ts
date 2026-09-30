import { z } from 'zod'
import { IsoDateTime } from './common'

export const DeviceKind = z.enum([
  'light',
  'switch',
  'sensor',
  'binary_sensor',
  'lock',
  'door',
  'camera',
  'climate',
  'fan',
  'media_player',
  'alarm_panel',
  'presence',
  'ring',
  'esp32',
  'server',
  'other',
])
export type DeviceKind = z.infer<typeof DeviceKind>

export const Device = z.object({
  id: z.uuid(),
  provider: z.string(),
  externalId: z.string(),
  name: z.string(),
  kind: DeviceKind,
  roomId: z.uuid().nullable(),
  roomName: z.string().nullable(),
  online: z.boolean().nullable(),
  state: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()),
  battery: z.number().min(0).max(100).nullable(),
  lastSeenAt: IsoDateTime.nullable(),
  lastChangedAt: IsoDateTime.nullable(),
  isMock: z.boolean(),
})
export type Device = z.infer<typeof Device>

export const Room = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  floor: z.string().nullable(),
})
export type Room = z.infer<typeof Room>

export const PresenceStatus = z.enum(['PRESENT', 'ABSENT', 'UNCERTAIN'])
export type PresenceStatus = z.infer<typeof PresenceStatus>

export const PresenceSourceKind = z.enum(['manual', 'home_assistant', 'phone', 'ble_ring', 'esp32', 'motion', 'door', 'mock'])
export type PresenceSourceKind = z.infer<typeof PresenceSourceKind>

export const PresenceEvidence = z.object({
  source: PresenceSourceKind,
  description: z.string(),
  weight: z.number().min(-1).max(1),
  observedAt: IsoDateTime,
})
export type PresenceEvidence = z.infer<typeof PresenceEvidence>

export const PresenceEstimate = z.object({
  personId: z.string(),
  personName: z.string(),
  roomId: z.string().nullable(),
  roomName: z.string().nullable(),
  status: PresenceStatus,
  confidence: z.number().min(0).max(1),
  evidence: z.array(PresenceEvidence),
  timestamp: IsoDateTime,
})
export type PresenceEstimate = z.infer<typeof PresenceEstimate>

export const PresenceObservation = z.object({
  personId: z.string(),
  roomId: z.string().nullable(),
  source: PresenceSourceKind,
  sourceId: z.string().nullable(),
  signal: z.enum(['seen', 'not_seen', 'entered', 'exited', 'motion']),
  strength: z.number().nullable(),
  observedAt: IsoDateTime,
})
export type PresenceObservation = z.infer<typeof PresenceObservation>

export const SecurityMode = z.enum(['disarmed', 'armed_home', 'armed_away', 'armed_night', 'arming', 'pending', 'triggered', 'unknown'])
export type SecurityMode = z.infer<typeof SecurityMode>

export const SecurityState = z.object({
  mode: SecurityMode,
  provider: z.string().nullable(),
  panelName: z.string().nullable(),
  openSensors: z.array(z.object({ id: z.string(), name: z.string(), roomName: z.string().nullable() })),
  unlockedLocks: z.array(z.object({ id: z.string(), name: z.string() })),
  lastChangedAt: IsoDateTime.nullable(),
  lastChangedBy: z.string().nullable(),
  /** True only when the provider exposes arm/disarm through Home Assistant. */
  controllable: z.boolean(),
})
export type SecurityState = z.infer<typeof SecurityState>

export const RoomClimate = z.object({
  temperatureC: z.number().nullable(),
  humidity: z.number().nullable(),
})

export const RoomState = z.object({
  room: Room,
  occupancy: PresenceStatus,
  occupancyConfidence: z.number().min(0).max(1),
  climate: RoomClimate,
  lights: z.array(z.object({ id: z.string(), name: z.string(), on: z.boolean(), brightness: z.number().nullable() })),
  doors: z.array(z.object({ id: z.string(), name: z.string(), open: z.boolean().nullable(), locked: z.boolean().nullable() })),
  mediaPlaying: z.string().nullable(),
  lastMotionAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
})
export type RoomState = z.infer<typeof RoomState>

export const CameraCapability = z.enum([
  'snapshot',
  'live_stream',
  'motion_detection',
  'arm',
  'battery',
  'recording',
  'two_way_audio',
])
export type CameraCapability = z.infer<typeof CameraCapability>

/** Provider-neutral camera. Capabilities are detected, never assumed (Blink rarely offers live video). */
export const Camera = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  room: z.string().nullable(),
  online: z.boolean().nullable(),
  capabilities: z.array(CameraCapability),
  /** Atlas-relative proxy path for the latest snapshot, or null if unavailable. Never a provider URL. */
  snapshotPath: z.string().nullable(),
  snapshotUpdatedAt: IsoDateTime.nullable(),
  streamAvailable: z.boolean(),
  motionDetection: z.boolean().nullable(),
  armed: z.boolean().nullable(),
  battery: z.number().min(0).max(100).nullable(),
  lastMotionAt: IsoDateTime.nullable(),
  lastRecordingAt: IsoDateTime.nullable(),
  isMock: z.boolean(),
})
export type Camera = z.infer<typeof Camera>

export const CameraEvent = z.object({
  id: z.uuid(),
  cameraId: z.string(),
  cameraName: z.string(),
  kind: z.enum(['motion', 'person', 'clip', 'offline', 'online']),
  occurredAt: IsoDateTime,
  mediaAvailable: z.boolean(),
  isMock: z.boolean(),
})
export type CameraEvent = z.infer<typeof CameraEvent>
