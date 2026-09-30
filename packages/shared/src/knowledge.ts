import { z } from 'zod'
import { IsoDateTime } from './common'

export const SearchResultKind = z.enum(['event', 'task', 'conversation', 'summary', 'memory', 'device', 'integration'])
export type SearchResultKind = z.infer<typeof SearchResultKind>

export const SearchResult = z.object({
  kind: SearchResultKind,
  id: z.string(),
  title: z.string(),
  snippet: z.string().nullable(),
  timestamp: IsoDateTime.nullable(),
  /** In-app route for the result. */
  href: z.string(),
  rank: z.number(),
})
export type SearchResult = z.infer<typeof SearchResult>

export const SearchResponse = z.object({
  query: z.string(),
  results: z.array(SearchResult),
  tookMs: z.number(),
})
export type SearchResponse = z.infer<typeof SearchResponse>

/**
 * Memories are deliberate, persistent facts — separate from events (objective occurrences).
 * They are only created explicitly or when extraction passes confidence and relevance rules.
 */
export const MemoryKind = z.enum(['preference', 'fact', 'person', 'project', 'routine'])
export type MemoryKind = z.infer<typeof MemoryKind>

export const Memory = z.object({
  id: z.uuid(),
  kind: MemoryKind,
  content: z.string(),
  source: z.enum(['user', 'atlas', 'conversation', 'import']),
  confidence: z.number().min(0).max(1),
  pinned: z.boolean(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  lastUsedAt: IsoDateTime.nullable(),
  isMock: z.boolean(),
})
export type Memory = z.infer<typeof Memory>

export const CreateMemoryInput = z.object({
  kind: MemoryKind,
  content: z.string().trim().min(3).max(1000),
  pinned: z.boolean().default(false),
})
export type CreateMemoryInput = z.input<typeof CreateMemoryInput>

/** Minimum confidence for Atlas-proposed memories to be stored without asking the user. */
export const MEMORY_AUTO_ACCEPT_CONFIDENCE = 0.9

export const AutomationTrigger = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event'), eventType: z.string().max(120), source: z.string().max(60).optional() }),
  z.object({ kind: z.literal('schedule'), cron: z.string().max(120), timezone: z.string().max(100).optional() }),
  z.object({ kind: z.literal('presence'), roomKey: z.string().max(60), status: z.enum(['PRESENT', 'ABSENT']) }),
])
export type AutomationTrigger = z.infer<typeof AutomationTrigger>

export const AutomationCondition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('time_between'), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }),
  z.object({ kind: z.literal('security_mode'), modes: z.array(z.string().max(40)).min(1).max(8) }),
  z.object({ kind: z.literal('presence'), roomKey: z.string().max(60), status: z.enum(['PRESENT', 'ABSENT', 'UNCERTAIN']) }),
  z.object({ kind: z.literal('privacy_off') }),
])
export type AutomationCondition = z.infer<typeof AutomationCondition>

/** Actions reference Atlas tools by id; they run through the same permission engine and audit log. */
export const AutomationAction = z.object({
  toolId: z.string().max(120),
  input: z.record(z.string(), z.unknown()),
})
export type AutomationAction = z.infer<typeof AutomationAction>

export const AutomationRule = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  trigger: AutomationTrigger,
  conditions: z.array(AutomationCondition),
  actions: z.array(AutomationAction),
  cooldownSeconds: z.number().int().min(0),
  enabled: z.boolean(),
  lastRunAt: IsoDateTime.nullable(),
  lastRunStatus: z.enum(['success', 'failed', 'skipped', 'pending_confirmation']).nullable(),
  createdAt: IsoDateTime,
  isMock: z.boolean(),
})
export type AutomationRule = z.infer<typeof AutomationRule>

export const UpsertAutomationInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  trigger: AutomationTrigger,
  conditions: z.array(AutomationCondition).max(10).default([]),
  actions: z.array(AutomationAction).min(1).max(10),
  cooldownSeconds: z.number().int().min(0).max(86_400).default(300),
  enabled: z.boolean().default(false),
})
export type UpsertAutomationInput = z.input<typeof UpsertAutomationInput>

export const Weather = z.object({
  available: z.boolean(),
  provider: z.string().nullable(),
  location: z.string().nullable(),
  temperatureC: z.number().nullable(),
  feelsLikeC: z.number().nullable(),
  condition: z.string().nullable(),
  highC: z.number().nullable(),
  lowC: z.number().nullable(),
  updatedAt: IsoDateTime.nullable(),
  isMock: z.boolean(),
})
export type Weather = z.infer<typeof Weather>
