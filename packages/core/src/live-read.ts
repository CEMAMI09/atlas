import {
  createGoogleEvent,
  fetchGoogleEvents,
  fetchGmailMessage,
  fetchHaAreas,
  fetchHaStates,
  fetchImportantMail,
  fetchVercelDeployments,
  haCameraImage,
  haCameraStream,
  haCameras,
  haDevices,
  haSecurity,
  haService,
  readStripe,
  searchGmailMessages,
  updateGoogleEvent,
} from '@atlas/integrations'
import { AtlasError, type Camera, type Device, type RoomState, type SecurityMode, type SecurityState } from '@atlas/shared'
import type { AtlasConfig } from '@atlas/config'
import type { Domain } from './domain'
import { googleAccessToken } from './google-auth'

function source(provider: string, mode: 'live', now: Date) {
  return { provider, mode, fetchedAt: now.toISOString() }
}

export async function liveCalendar(domain: Domain, start: Date, end: Date, limit: number) {
  const token = await googleAccessToken(domain.db, domain.config, domain.userId)
  const events = await fetchGoogleEvents(token, start, end, limit)
  return { events, sources: [source('google', 'live', domain.now)] }
}

export async function liveCreateCalendar(domain: Domain, input: { title: string; start: string; end: string; description?: string; location?: string }) {
  const token = await googleAccessToken(domain.db, domain.config, domain.userId)
  const event = await createGoogleEvent(token, input)
  return { event, sources: [source('google', 'live', domain.now)] }
}

export async function liveUpdateCalendar(domain: Domain, input: { eventId: string; title?: string; start?: string; end?: string; description?: string; location?: string }) {
  const token = await googleAccessToken(domain.db, domain.config, domain.userId)
  const event = await updateGoogleEvent(token, input.eventId, input)
  return { event, sources: [source('google', 'live', domain.now)] }
}

export async function liveImportantEmail(domain: Domain, limit: number) {
  const token = await googleAccessToken(domain.db, domain.config, domain.userId)
  return { messages: await fetchImportantMail(token, limit), sources: [source('google', 'live', domain.now)] }
}

export async function liveSearchEmail(domain: Domain, query: string, limit: number) {
  const token = await googleAccessToken(domain.db, domain.config, domain.userId)
  return { messages: await searchGmailMessages(token, query, limit), sources: [source('google', 'live', domain.now)] }
}

export async function liveGetEmail(domain: Domain, id: string) {
  const token = await googleAccessToken(domain.db, domain.config, domain.userId)
  return { message: await fetchGmailMessage(token, id), sources: [source('google', 'live', domain.now)] }
}

export async function liveDeployments(domain: Domain, limit: number) {
  const deployments = await fetchVercelDeployments(vercelToken(domain.config), domain.config.env.VERCEL_TEAM_ID, domain.config.env.VERCEL_PROJECT_IDS, limit)
  return { deployments, sources: [source('vercel', 'live', domain.now)] }
}

export async function liveDeployment(domain: Domain, id: string) {
  const deployments = await fetchVercelDeployments(vercelToken(domain.config), domain.config.env.VERCEL_TEAM_ID, domain.config.env.VERCEL_PROJECT_IDS, 20)
  const deployment = deployments.find((item) => item.id === id)
  if (!deployment) throw new AtlasError('NOT_FOUND', 'That deployment was not found.')
  return { deployment, sources: [source('vercel', 'live', domain.now)] }
}

export async function liveStripe(domain: Domain) {
  const key = domain.config.env.STRIPE_RESTRICTED_KEY
  if (!key || domain.config.features.stripe.keyKind !== 'restricted') {
    throw new AtlasError('NOT_CONFIGURED', 'Stripe needs a restricted key (rk_). A secret key is not used.')
  }
  const result = await readStripe(key)
  return { ...result, sources: [source('stripe', 'live', domain.now)] }
}

export async function liveDevices(domain: Domain): Promise<Device[]> {
  const { entities, areas } = await haBundle(domain)
  return haDevices(entities, areas, domain.now.toISOString())
}

export async function liveCameras(domain: Domain): Promise<{ cameras: Camera[]; sources: ReturnType<typeof source>[] }> {
  const { entities, areas } = await haBundle(domain)
  return { cameras: haCameras(entities, areas, domain.now.toISOString()), sources: [source('home_assistant', 'live', domain.now)] }
}

export async function liveSecurity(domain: Domain) {
  const { entities } = await haBundle(domain)
  const security = haSecurity(entities)
  if (!security) throw new AtlasError('NOT_FOUND', 'Home Assistant has no alarm panel.')
  return { security, sources: [source('home_assistant', 'live', domain.now)] }
}

export async function liveSetSecurity(domain: Domain, modeName: SecurityMode): Promise<SecurityState> {
  const { entities } = await haBundle(domain)
  const panel = entities.find((entity) => entity.entityId.startsWith('alarm_control_panel.'))
  if (!panel) throw new AtlasError('NOT_FOUND', 'Home Assistant has no alarm panel.')
  const service = modeName === 'disarmed' ? 'alarm_disarm' : modeName === 'armed_away' ? 'alarm_arm_away' : modeName === 'armed_night' ? 'alarm_arm_night' : 'alarm_arm_home'
  await haService(haUrl(domain.config), haToken(domain.config), 'alarm_control_panel', service, panel.entityId)
  const next = await liveSecurity(domain)
  return next.security
}

export async function liveSetDevice(domain: Domain, externalId: string, on: boolean): Promise<Device> {
  const devices = await liveDevices(domain)
  const device = devices.find((item) => item.externalId === externalId)
  if (!device) throw new AtlasError('NOT_FOUND', 'That device was not found.')
  const domainName = externalId.split('.')[0]
  if (domainName !== 'light' && domainName !== 'switch') throw new AtlasError('UNSUPPORTED', `${device.name} cannot be toggled.`)
  await haService(haUrl(domain.config), haToken(domain.config), domainName, on ? 'turn_on' : 'turn_off', externalId)
  return { ...device, state: on ? 'on' : 'off', lastChangedAt: domain.now.toISOString() }
}

export async function liveRoom(domain: Domain, roomKey: string): Promise<{ room: RoomState; sources: ReturnType<typeof source>[] }> {
  const devices = await liveDevices(domain)
  const wanted = roomKey.toLowerCase()
  const inRoom = devices.filter((device) => (device.roomName ?? 'home').toLowerCase().replace(/\s+/g, '-') === wanted || (device.roomName ?? '').toLowerCase() === wanted)
  const chosen = inRoom.length > 0 ? inRoom : devices
  const roomName = inRoom[0]?.roomName ?? chosen[0]?.roomName ?? 'Home'
  const climate = chosen.find((device) => typeof device.attributes.temperatureC === 'number' || typeof device.attributes.humidity === 'number')
  const room: RoomState = {
    room: { id: crypto.randomUUID(), key: roomKey, name: roomName, floor: null },
    occupancy: 'UNCERTAIN',
    occupancyConfidence: 0,
    climate: {
      temperatureC: typeof climate?.attributes.temperatureC === 'number' ? climate.attributes.temperatureC : null,
      humidity: typeof climate?.attributes.humidity === 'number' ? climate.attributes.humidity : null,
    },
    lights: chosen.filter((device) => device.kind === 'light').map((device) => ({ id: device.externalId, name: device.name, on: device.state === 'on', brightness: typeof device.attributes.brightness === 'number' ? device.attributes.brightness : null })),
    doors: chosen.filter((device) => device.kind === 'door' || device.kind === 'lock').map((device) => ({ id: device.externalId, name: device.name, open: device.kind === 'door' ? device.state === 'on' : null, locked: device.kind === 'lock' ? device.state === 'locked' : null })),
    mediaPlaying: null,
    lastMotionAt: null,
    updatedAt: domain.now.toISOString(),
  }
  return { room, sources: [source('home_assistant', 'live', domain.now)] }
}

export async function liveCameraStream(config: AtlasConfig, entityId: string, signal: AbortSignal) {
  return haCameraStream(haUrl(config), haToken(config), entityId, signal)
}

export async function liveCameraBytes(config: AtlasConfig, entityId: string) {
  return haCameraImage(haUrl(config), haToken(config), entityId)
}

async function haBundle(domain: Domain) {
  const entities = await fetchHaStates(haUrl(domain.config), haToken(domain.config))
  const areas = await fetchHaAreas(haUrl(domain.config), haToken(domain.config))
  return { entities, areas }
}

function vercelToken(config: AtlasConfig): string {
  const token = config.env.VERCEL_ACCESS_TOKEN
  if (!token) throw new AtlasError('NOT_CONFIGURED', 'Vercel is not configured.')
  return token
}

function haUrl(config: AtlasConfig): string {
  const url = config.env.HOME_ASSISTANT_URL
  if (!url) throw new AtlasError('NOT_CONFIGURED', 'Home Assistant is not configured.')
  return url
}

function haToken(config: AtlasConfig): string {
  const token = config.env.HOME_ASSISTANT_ACCESS_TOKEN
  if (!token) throw new AtlasError('NOT_CONFIGURED', 'Home Assistant is not configured.')
  return token
}
