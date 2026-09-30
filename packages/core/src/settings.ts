import { eq } from 'drizzle-orm'
import { systemSettings, type Database } from '@atlas/database'
import { AtlasSettings, defaultSettings, type AtlasSettings as Settings, type SettingsPatch } from '@atlas/shared'

const KEY = 'atlas.settings'

export async function readSettings(db: Database): Promise<Settings> {
  const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, KEY)).limit(1)
  const parsed = AtlasSettings.safeParse(rows[0]?.value ?? {})
  return parsed.success ? parsed.data : defaultSettings()
}

export async function writeSettings(db: Database, settings: Settings): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key: KEY, value: settings })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: settings, updatedAt: new Date() } })
}

export async function patchSettings(db: Database, patch: SettingsPatch): Promise<Settings> {
  const current = await readSettings(db)
  const next = AtlasSettings.parse({
    appearance: { ...current.appearance, ...patch.appearance },
    dashboard: { ...current.dashboard, ...patch.dashboard },
    ai: { ...current.ai, ...patch.ai },
    audio: { ...current.audio, ...patch.audio },
    security: { ...current.security, ...patch.security, allowLevel4: false },
    retention: { ...current.retention, ...patch.retention },
    notifications: { ...current.notifications, ...patch.notifications },
    developer: { ...current.developer, ...patch.developer },
  })
  await writeSettings(db, next)
  return next
}

export async function ensureSettings(db: Database, useMockIntegrations: boolean): Promise<Settings> {
  const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, KEY)).limit(1)
  if (rows.length === 0) {
    const settings = defaultSettings()
    settings.developer.useMockIntegrations = useMockIntegrations
    await writeSettings(db, settings)
    return settings
  }
  return readSettings(db)
}
