import { AtlasError, type Camera, type Device, type SecurityMode, type SecurityState } from '@atlas/shared'

export interface HaEntity {
  entityId: string
  state: string
  attributes: Record<string, unknown>
  lastChanged: string | null
}

export async function fetchHaStates(baseUrl: string, token: string): Promise<HaEntity[]> {
  const body = await haGet(baseUrl, token, '/api/states')
  if (!Array.isArray(body)) throw new AtlasError('INVALID_PROVIDER_RESPONSE', 'Home Assistant did not return a state list.')
  return body.flatMap((row) => {
    const record = asRecord(row)
    const entityId = stringField(record, 'entity_id')
    const state = stringField(record, 'state')
    if (!entityId || state === null) return []
    return [{ entityId, state, attributes: asRecord(record.attributes), lastChanged: stringField(record, 'last_changed') }]
  })
}

export async function fetchHaAreas(baseUrl: string, token: string): Promise<Map<string, string>> {
  const areas = new Map<string, string>()
  const areaBody = await haGet(baseUrl, token, '/api/config/area_registry').catch(() => [])
  const entityBody = await haGet(baseUrl, token, '/api/config/entity_registry').catch(() => [])
  const areaNames = new Map<string, string>()
  if (Array.isArray(areaBody)) {
    for (const row of areaBody) {
      const record = asRecord(row)
      const id = stringField(record, 'area_id')
      const name = stringField(record, 'name')
      if (id && name) areaNames.set(id, name)
    }
  }
  if (Array.isArray(entityBody)) {
    for (const row of entityBody) {
      const record = asRecord(row)
      const entityId = stringField(record, 'entity_id')
      const areaId = stringField(record, 'area_id')
      if (entityId && areaId && areaNames.has(areaId)) areas.set(entityId, areaNames.get(areaId)!)
    }
  }
  return areas
}

export function haDevices(entities: HaEntity[], areas: Map<string, string>, now: string): Device[] {
  return entities.flatMap((entity) => {
    const kind = kindOf(entity)
    if (!kind) return []
    const name = stringField(entity.attributes, 'friendly_name') ?? entity.entityId
    const roomName = areas.get(entity.entityId) ?? null
    const battery = numberField(entity.attributes, 'battery_level')
    return [
      {
        id: uuidFrom(entity.entityId),
        provider: providerOf(entity),
        externalId: entity.entityId,
        name,
        kind,
        roomId: null,
        roomName,
        online: entity.state !== 'unavailable',
        state: entity.state,
        attributes: publicAttributes(entity),
        battery,
        lastSeenAt: entity.lastChanged,
        lastChangedAt: entity.lastChanged,
        isMock: false,
      } satisfies Device,
    ]
  })
}

export function haSecurity(entities: HaEntity[]): SecurityState | null {
  const panel = entities.find((entity) => entity.entityId.startsWith('alarm_control_panel.'))
  if (!panel) return null
  const openSensors = entities
    .filter((entity) => entity.entityId.startsWith('binary_sensor.') && entity.state === 'on' && isContact(entity))
    .map((entity) => ({ id: entity.entityId, name: stringField(entity.attributes, 'friendly_name') ?? entity.entityId, roomName: null }))
  return {
    mode: mapAlarm(panel.state),
    provider: providerOf(panel),
    panelName: stringField(panel.attributes, 'friendly_name'),
    openSensors,
    unlockedLocks: entities
      .filter((entity) => entity.entityId.startsWith('lock.') && entity.state === 'unlocked')
      .map((entity) => ({ id: entity.entityId, name: stringField(entity.attributes, 'friendly_name') ?? entity.entityId })),
    lastChangedAt: panel.lastChanged,
    lastChangedBy: null,
    controllable: true,
  }
}

export function haCameras(entities: HaEntity[], areas: Map<string, string>, now: string): Camera[] {
  return haDevices(entities, areas, now)
    .filter((device) => device.kind === 'camera')
    .map((device) => {
      const entity = entities.find((item) => item.entityId === device.externalId)
      const stream = entity ? stringField(entity.attributes, 'frontend_stream_type') : null
      const features = entity && typeof entity.attributes.supported_features === 'number' ? entity.attributes.supported_features : 0
      const live = Boolean(stream) || (features & 2) === 2 || Boolean(entity?.entityId.startsWith('camera.'))
      return {
        id: device.externalId,
        provider: device.provider,
        name: device.name,
        room: device.roomName,
        online: device.online,
        capabilities: ['snapshot', ...(live ? (['live_stream'] as const) : []), 'motion_detection'],
        snapshotPath: `/api/cameras/${encodeURIComponent(device.externalId)}/snapshot`,
        snapshotUpdatedAt: device.lastChangedAt,
        streamAvailable: live && device.online !== false,
        motionDetection: null,
        armed: null,
        battery: device.battery,
        lastMotionAt: null,
        lastRecordingAt: null,
        isMock: false,
      } satisfies Camera
    })
}

export async function haService(baseUrl: string, token: string, domain: string, service: string, entityId: string): Promise<void> {
  const response = await fetch(join(baseUrl, `/api/services/${domain}/${service}`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_id: entityId }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new AtlasError('PROVIDER_ERROR', `Home Assistant ${domain}.${service} returned ${response.status}.`)
}

export async function haCameraStream(baseUrl: string, token: string, entityId: string, signal: AbortSignal): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
  if (!/^camera\.[a-z0-9_]+$/i.test(entityId)) throw new AtlasError('BAD_REQUEST', 'Camera id is not valid.')
  const response = await fetch(join(baseUrl, `/api/camera_proxy_stream/${entityId}`), {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok || !response.body || !contentType.includes('multipart/x-mixed-replace')) {
    throw new AtlasError('UNSUPPORTED', 'This camera does not provide a live view through Home Assistant.')
  }
  return { body: response.body, contentType }
}

export async function haCameraImage(baseUrl: string, token: string, entityId: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!/^camera\.[a-z0-9_]+$/i.test(entityId)) return null
  const response = await fetch(join(baseUrl, `/api/camera_proxy/${entityId}`), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) return null
  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  if (!contentType.startsWith('image/')) return null
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType }
}

async function haGet(baseUrl: string, token: string, path: string): Promise<unknown> {
  if (!path.startsWith('/api/')) throw new AtlasError('BAD_REQUEST', 'Home Assistant path is not allowed.')
  const response = await fetch(join(baseUrl, path), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  })
  if (response.status === 401) throw new AtlasError('AUTH_FAILED', 'Home Assistant rejected the access token.')
  if (!response.ok) throw new AtlasError('PROVIDER_ERROR', `Home Assistant returned ${response.status} for ${path}.`)
  return response.json() as Promise<unknown>
}

function join(baseUrl: string, path: string): string {
  const url = new URL(baseUrl)
  url.pathname = path
  url.search = ''
  url.username = ''
  url.password = ''
  return url.toString()
}

function kindOf(entity: HaEntity): Device['kind'] | null {
  const domain = entity.entityId.split('.')[0]
  const deviceClass = String(entity.attributes.device_class ?? '')
  if (domain === 'light') return 'light'
  if (domain === 'switch') return 'switch'
  if (domain === 'lock') return 'lock'
  if (domain === 'camera') return 'camera'
  if (domain === 'alarm_control_panel') return 'alarm_panel'
  if (domain === 'climate') return 'climate'
  if (domain === 'binary_sensor' && ['door', 'window', 'garage_door', 'opening'].includes(deviceClass)) return 'door'
  if (domain === 'binary_sensor' && deviceClass === 'motion') return 'binary_sensor'
  if (domain === 'sensor' && ['temperature', 'humidity', 'battery'].includes(deviceClass)) return 'sensor'
  return null
}

function providerOf(entity: HaEntity): string {
  const blob = `${entity.entityId} ${stringField(entity.attributes, 'friendly_name') ?? ''} ${stringField(entity.attributes, 'attribution') ?? ''}`.toLowerCase()
  if (blob.includes('blink')) return 'blink'
  if (blob.includes('vivint')) return 'vivint'
  return 'home_assistant'
}

function publicAttributes(entity: HaEntity): Record<string, unknown> {
  const brightness = numberField(entity.attributes, 'brightness')
  return {
    ...(brightness !== null ? { brightness: Math.round((brightness / 255) * 100) } : {}),
    ...(temperatureC(entity.attributes) !== null ? { temperatureC: temperatureC(entity.attributes) } : {}),
    ...(numberField(entity.attributes, 'humidity') !== null ? { humidity: numberField(entity.attributes, 'humidity') } : {}),
    ...(entity.state === 'on' && entity.entityId.startsWith('binary_sensor.') ? { open: true } : {}),
    liveStream: Boolean(stringField(entity.attributes, 'frontend_stream_type')),
  }
}

function mapAlarm(state: string): SecurityMode {
  if (state === 'disarmed') return 'disarmed'
  if (state === 'armed_home') return 'armed_home'
  if (state === 'armed_away') return 'armed_away'
  if (state === 'armed_night') return 'armed_night'
  if (state === 'arming' || state === 'pending') return 'pending'
  if (state === 'triggered') return 'triggered'
  return 'unknown'
}

function isContact(entity: HaEntity): boolean {
  const deviceClass = String(entity.attributes.device_class ?? '')
  return ['door', 'window', 'garage_door', 'opening'].includes(deviceClass)
}

function uuidFrom(value: string): string {
  let hex = ''
  for (let i = 0; i < value.length; i += 1) hex += value.charCodeAt(i).toString(16).padStart(2, '0')
  hex = (hex + '0'.repeat(32)).slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function temperatureC(attributes: Record<string, unknown>): number | null {
  const raw = numberField(attributes, 'current_temperature') ?? numberField(attributes, 'temperature')
  if (raw === null) return null
  const unit = stringField(attributes, 'unit_of_measurement') ?? ''
  if (unit.includes('F')) return Math.round((((raw - 32) * 5) / 9) * 10) / 10
  return raw
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
