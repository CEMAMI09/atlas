import { z } from 'zod'

export const AccentIntensity = z.enum(['subtle', 'standard', 'strong'])
export type AccentIntensity = z.infer<typeof AccentIntensity>

export const AppearanceSettings = z.object({
  theme: z.literal('dark').default('dark'),
  accentIntensity: AccentIntensity.default('standard'),
  density: z.enum(['compact', 'comfortable']).default('compact'),
  reduceMotion: z.boolean().default(false),
  clock24h: z.boolean().default(false),
})
export type AppearanceSettings = z.infer<typeof AppearanceSettings>

export const DashboardSettings = z.object({
  separateLayouts: z.boolean().default(true),
  animateLayout: z.boolean().default(true),
})
export type DashboardSettings = z.infer<typeof DashboardSettings>

export const AiRouterMode = z.enum(['auto', 'fast', 'reasoning'])
export type AiRouterMode = z.infer<typeof AiRouterMode>

export const AiSettings = z.object({
  routerMode: AiRouterMode.default('auto'),
  showReasoning: z.boolean().default(false),
  maxToolSteps: z.number().int().min(1).max(12).default(8),
})
export type AiSettings = z.infer<typeof AiSettings>

export const AudioSettings = z.object({
  transcriptionEnabled: z.boolean().default(false),
  diarizationEnabled: z.boolean().default(true),
  dailySummaries: z.boolean().default(true),
  extractTaskSuggestions: z.boolean().default(true),
})
export type AudioSettings = z.infer<typeof AudioSettings>

export const SecuritySettings = z.object({
  /** Minutes before idle sessions require sign-in again. */
  sessionIdleMinutes: z.number().int().min(15).max(60 * 24 * 30).default(60 * 24 * 14),
  confirmationTtlSeconds: z.number().int().min(30).max(900).default(300),
  /** Level 4 (financial/destructive) tools. Locked off in V1 regardless of this value. */
  allowLevel4: z.literal(false).default(false),
})
export type SecuritySettings = z.infer<typeof SecuritySettings>

/** Days to keep each category; `null` keeps data until the user deletes it. */
const RetentionDays = z.number().int().min(0).max(3650).nullable()

export const RetentionSettings = z.object({
  rawCameraMediaDays: RetentionDays.default(7),
  rawAudioDays: RetentionDays.default(0),
  transcriptsDays: RetentionDays.default(null),
  conversationSummariesDays: RetentionDays.default(null),
  eventsDays: RetentionDays.default(null),
  chatHistoryDays: RetentionDays.default(null),
  systemLogsDays: RetentionDays.default(14),
})
export type RetentionSettings = z.infer<typeof RetentionSettings>

export const NotificationSettings = z.object({
  inApp: z.boolean().default(true),
  minSeverity: z.enum(['info', 'notice', 'warning', 'critical']).default('warning'),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
})
export type NotificationSettings = z.infer<typeof NotificationSettings>

export const DeveloperSettings = z.object({
  /** Global mock toggle; per-integration overrides live on the integration. */
  useMockIntegrations: z.boolean().default(true),
  mockSimulator: z.boolean().default(true),
  verboseToolDetails: z.boolean().default(false),
})
export type DeveloperSettings = z.infer<typeof DeveloperSettings>

export const SettingsSections = {
  appearance: AppearanceSettings,
  dashboard: DashboardSettings,
  ai: AiSettings,
  audio: AudioSettings,
  security: SecuritySettings,
  retention: RetentionSettings,
  notifications: NotificationSettings,
  developer: DeveloperSettings,
} as const

export type SettingsSectionId = keyof typeof SettingsSections

export const AtlasSettings = z.object({
  appearance: AppearanceSettings.prefault({}),
  dashboard: DashboardSettings.prefault({}),
  ai: AiSettings.prefault({}),
  audio: AudioSettings.prefault({}),
  security: SecuritySettings.prefault({}),
  retention: RetentionSettings.prefault({}),
  notifications: NotificationSettings.prefault({}),
  developer: DeveloperSettings.prefault({}),
})
export type AtlasSettings = z.infer<typeof AtlasSettings>

export const SettingsPatch = z.object({
  appearance: AppearanceSettings.partial().optional(),
  dashboard: DashboardSettings.partial().optional(),
  ai: AiSettings.partial().optional(),
  audio: AudioSettings.partial().optional(),
  security: SecuritySettings.partial().optional(),
  retention: RetentionSettings.partial().optional(),
  notifications: NotificationSettings.partial().optional(),
  developer: DeveloperSettings.partial().optional(),
})
export type SettingsPatch = z.infer<typeof SettingsPatch>

export function defaultSettings(): AtlasSettings {
  return AtlasSettings.parse({})
}
