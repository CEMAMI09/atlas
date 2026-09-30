import { z } from 'zod'
import { validatePolicy, type ToolPolicy } from '@atlas/permissions'
import {
  ConfirmationPolicy,
  Permission,
  RANGE_PRESETS,
  RiskLevel,
  SideEffect,
  type ConfirmationPolicy as ConfirmationPolicyType,
  type IntegrationId,
  type Permission as PermissionType,
  type RiskLevel as RiskLevelType,
  type SideEffect as SideEffectType,
} from '@atlas/shared'

const localTime = z
  .string()
  .max(40)
  .describe('ISO timestamp, or local wall time such as 2026-09-30T15:00. Interpreted in the user time zone when no offset is present.')

export interface AtlasToolDefinition extends ToolPolicy {
  title: string
  description: string
  integration: IntegrationId | null
  inputSchema: z.ZodType
  summarize: (input: unknown) => string
}

function def(tool: AtlasToolDefinition): AtlasToolDefinition {
  validatePolicy(tool)
  return tool
}

const none = 'none' as const

export const ATLAS_TOOLS: AtlasToolDefinition[] = [
  def({
    id: 'calendar.getEvents',
    title: 'Get calendar events',
    description: 'Read calendar events for a local time range. Use this for agenda questions. Does not invent events.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['calendar:read'],
    integration: 'google',
    inputSchema: z.object({
      preset: z.enum(['today', 'tomorrow', 'next_7_days']).optional().describe('Relative range in the user time zone.'),
      start: localTime.optional(),
      end: localTime.optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    summarize: () => 'Read calendar events',
  }),
  def({
    id: 'calendar.createEvent',
    title: 'Create calendar event',
    description: 'Create a calendar event. Requires confirmation. Do not claim success until the tool status is success.',
    riskLevel: 2,
    sideEffect: 'external_write',
    confirmationPolicy: 'confirm',
    requiredPermissions: ['calendar:write'],
    integration: 'google',
    inputSchema: z.object({
      title: z.string().min(1).max(300),
      start: localTime,
      end: localTime,
      description: z.string().max(4000).optional(),
      location: z.string().max(500).optional(),
    }),
    summarize: (input) => `Create calendar event “${text(input, 'title')}”`,
  }),
  def({
    id: 'calendar.updateEvent',
    title: 'Update calendar event',
    description: 'Modify an existing calendar event. Requires confirmation.',
    riskLevel: 2,
    sideEffect: 'external_write',
    confirmationPolicy: 'confirm',
    requiredPermissions: ['calendar:write'],
    integration: 'google',
    inputSchema: z.object({
      eventId: z.string().min(1).max(300),
      title: z.string().min(1).max(300).optional(),
      start: localTime.optional(),
      end: localTime.optional(),
      description: z.string().max(4000).optional(),
      location: z.string().max(500).optional(),
    }),
    summarize: (input) => `Update calendar event ${text(input, 'eventId')}`,
  }),
  def({
    id: 'email.search',
    title: 'Search email',
    description: 'Search recent mail. Returns snippets, never a full mailbox.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['email:read'],
    integration: 'google',
    inputSchema: z.object({
      query: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(15).optional(),
    }),
    summarize: () => 'Search email',
  }),
  def({
    id: 'email.getMessage',
    title: 'Read email',
    description: 'Read one message as truncated plain text.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['email:read'],
    integration: 'google',
    inputSchema: z.object({ id: z.string().min(1).max(200) }),
    summarize: (input) => `Read email ${text(input, 'id')}`,
  }),
  def({
    id: 'email.getImportant',
    title: 'Important email',
    description: 'List unread or important messages from today.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['email:read'],
    integration: 'google',
    inputSchema: z.object({ limit: z.number().int().min(1).max(10).optional() }),
    summarize: () => 'List important email',
  }),
  def({
    id: 'timeline.query',
    title: 'Query timeline',
    description: 'Query Atlas events with filters. Prefer timeline.whatHappened for “what happened” questions.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['timeline:read'],
    integration: null,
    inputSchema: z.object({
      start: localTime.optional(),
      end: localTime.optional(),
      query: z.string().max(200).optional(),
      roomId: z.string().max(60).optional(),
      limit: z.number().int().min(1).max(40).optional(),
    }),
    summarize: () => 'Query the timeline',
  }),
  def({
    id: 'timeline.search',
    title: 'Search timeline',
    description: 'Full-text search over Atlas events.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['timeline:read'],
    integration: null,
    inputSchema: z.object({
      query: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(25).optional(),
    }),
    summarize: (input) => `Search timeline for “${text(input, 'query')}”`,
  }),
  def({
    id: 'timeline.whatHappened',
    title: 'What happened',
    description:
      'Resolve a local time range, retrieve events, conversation summaries, camera and service events, and return a ranked digest. Use this for “what happened between 3 and 5”.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['timeline:read'],
    integration: null,
    inputSchema: z.object({
      preset: z.enum(RANGE_PRESETS).optional(),
      startHour: z.number().int().min(0).max(23).optional().describe('Local hour, 24-hour clock. 3 PM is 15.'),
      endHour: z.number().int().min(0).max(24).optional(),
      start: localTime.optional(),
      end: localTime.optional(),
      query: z.string().max(200).optional(),
    }),
    summarize: () => 'Summarize what happened in a time range',
  }),
  def({
    id: 'tasks.list',
    title: 'List tasks',
    description: 'List Atlas tasks. Does not include unapproved suggestions unless asked separately.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['tasks:read'],
    integration: null,
    inputSchema: z.object({
      includeDone: z.boolean().optional(),
      project: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(30).optional(),
    }),
    summarize: () => 'List tasks',
  }),
  def({
    id: 'tasks.create',
    title: 'Create task',
    description: 'Create an Atlas task. Do not use this for unconfirmed conversation suggestions.',
    riskLevel: 1,
    sideEffect: 'internal_write',
    confirmationPolicy: none,
    requiredPermissions: ['tasks:write'],
    integration: null,
    inputSchema: z.object({
      title: z.string().min(1).max(300),
      description: z.string().max(2000).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      project: z.string().max(120).optional(),
    }),
    summarize: (input) => `Create task “${text(input, 'title')}”`,
  }),
  def({
    id: 'tasks.update',
    title: 'Update task',
    description: 'Update an existing Atlas task.',
    riskLevel: 1,
    sideEffect: 'internal_write',
    confirmationPolicy: none,
    requiredPermissions: ['tasks:write'],
    integration: null,
    inputSchema: z.object({
      id: z.uuid(),
      title: z.string().min(1).max(300).optional(),
      description: z.string().max(2000).nullable().optional(),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'canceled']).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    }),
    summarize: (input) => `Update task ${text(input, 'id')}`,
  }),
  def({
    id: 'tasks.complete',
    title: 'Complete task',
    description: 'Mark an Atlas task done.',
    riskLevel: 1,
    sideEffect: 'internal_write',
    confirmationPolicy: none,
    requiredPermissions: ['tasks:write'],
    integration: null,
    inputSchema: z.object({ id: z.uuid() }),
    summarize: (input) => `Complete task ${text(input, 'id')}`,
  }),
  def({
    id: 'room.getState',
    title: 'Room state',
    description: 'Occupancy, lights, doors and climate for one room.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['home:read'],
    integration: 'home_assistant',
    inputSchema: z.object({ roomKey: z.string().max(60).optional() }),
    summarize: () => 'Read room state',
  }),
  def({
    id: 'security.getState',
    title: 'Security state',
    description: 'Read the alarm panel mode and open sensors.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['security:read'],
    integration: 'home_assistant',
    inputSchema: z.object({}),
    summarize: () => 'Read security state',
  }),
  def({
    id: 'security.arm',
    title: 'Arm security',
    description: 'Arm the security panel. Requires confirmation.',
    riskLevel: 2,
    sideEffect: 'security_control',
    confirmationPolicy: 'confirm',
    requiredPermissions: ['security:arm'],
    integration: 'home_assistant',
    inputSchema: z.object({ mode: z.enum(['armed_home', 'armed_away', 'armed_night']) }),
    summarize: (input) => `Arm security (${text(input, 'mode')})`,
  }),
  def({
    id: 'security.disarm',
    title: 'Disarm security',
    description: 'Disarm the security panel. Requires typed confirmation. Do not claim the panel is disarmed until the tool succeeds.',
    riskLevel: 3,
    sideEffect: 'security_control',
    confirmationPolicy: 'strong',
    requiredPermissions: ['security:disarm'],
    integration: 'home_assistant',
    inputSchema: z.object({}),
    summarize: () => 'Disarm security',
  }),
  def({
    id: 'cameras.list',
    title: 'List cameras',
    description: 'List cameras and the capabilities each one actually has. Do not assume live video.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['cameras:read'],
    integration: 'home_assistant',
    inputSchema: z.object({}),
    summarize: () => 'List cameras',
  }),
  def({
    id: 'cameras.getSnapshot',
    title: 'Camera snapshot',
    description: 'Get the latest snapshot reference for one camera. Does not return a live stream.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['cameras:read'],
    integration: 'home_assistant',
    inputSchema: z.object({ cameraId: z.string().min(1).max(200) }),
    summarize: (input) => `Snapshot ${text(input, 'cameraId')}`,
  }),
  def({
    id: 'cameras.getRecentEvents',
    title: 'Camera events',
    description: 'Recent motion and clip events.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['cameras:read'],
    integration: 'home_assistant',
    inputSchema: z.object({
      cameraId: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    summarize: () => 'Recent camera events',
  }),
  def({
    id: 'homeAssistant.getEntities',
    title: 'Home Assistant entities',
    description: 'List Atlas devices projected from Home Assistant. Blink and Vivint appear here, not as separate logins.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['home:read'],
    integration: 'home_assistant',
    inputSchema: z.object({ kind: z.string().max(40).optional() }),
    summarize: () => 'List Home Assistant entities',
  }),
  def({
    id: 'homeAssistant.getEntity',
    title: 'Home Assistant entity',
    description: 'Read one Home Assistant entity by its Atlas external id.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['home:read'],
    integration: 'home_assistant',
    inputSchema: z.object({ externalId: z.string().min(1).max(200) }),
    summarize: (input) => `Read entity ${text(input, 'externalId')}`,
  }),
  def({
    id: 'devices.setState',
    title: 'Set device',
    description: 'Turn a light or switch on or off. Low-risk control, audited.',
    riskLevel: 1,
    sideEffect: 'physical_control',
    confirmationPolicy: none,
    requiredPermissions: ['home:control'],
    integration: 'home_assistant',
    inputSchema: z.object({
      externalId: z.string().min(1).max(200),
      on: z.boolean(),
    }),
    summarize: (input) => `Set ${text(input, 'externalId')} ${bool(input, 'on') ? 'on' : 'off'}`,
  }),
  def({
    id: 'vercel.getProjects',
    title: 'Vercel projects',
    description: 'Read tracked Vercel projects. Cannot deploy or change project settings.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['deployments:read'],
    integration: 'vercel',
    inputSchema: z.object({}),
    summarize: () => 'List Vercel projects',
  }),
  def({
    id: 'vercel.getDeployments',
    title: 'Vercel deployments',
    description: 'Read recent deployments.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['deployments:read'],
    integration: 'vercel',
    inputSchema: z.object({ limit: z.number().int().min(1).max(15).optional() }),
    summarize: () => 'List deployments',
  }),
  def({
    id: 'vercel.getDeploymentStatus',
    title: 'Deployment status',
    description: 'Read one deployment by id.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['deployments:read'],
    integration: 'vercel',
    inputSchema: z.object({ deploymentId: z.string().min(1).max(200) }),
    summarize: (input) => `Deployment ${text(input, 'deploymentId')}`,
  }),
  def({
    id: 'stripe.getSummary',
    title: 'Stripe summary',
    description: 'Read subscription counts and estimated MRR. Cannot move money.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['payments:read'],
    integration: 'stripe',
    inputSchema: z.object({}),
    summarize: () => 'Read Stripe summary',
  }),
  def({
    id: 'stripe.getRecentPayments',
    title: 'Recent payments',
    description: 'Read recent payments, including failures. Read-only.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['payments:read'],
    integration: 'stripe',
    inputSchema: z.object({ limit: z.number().int().min(1).max(15).optional() }),
    summarize: () => 'Read recent payments',
  }),
  def({
    id: 'stripe.getSubscriptions',
    title: 'Subscriptions',
    description: 'Read recent subscriptions. Cannot modify them.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['payments:read'],
    integration: 'stripe',
    inputSchema: z.object({ limit: z.number().int().min(1).max(15).optional() }),
    summarize: () => 'Read subscriptions',
  }),
  def({
    id: 'projects.getStatus',
    title: 'Project status',
    description: 'Status for a tracked project such as Struct: production deployment, recent failures, and revenue if available.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['deployments:read'],
    integration: null,
    inputSchema: z.object({ slug: z.string().max(60).optional().describe('Project slug. Defaults to struct.') }),
    summarize: (input) => `Project status for ${text(input, 'slug') || 'struct'}`,
  }),
  def({
    id: 'conversations.search',
    title: 'Search conversations',
    description: 'Search conversation summaries and transcript snippets.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['conversations:read'],
    integration: 'audio',
    inputSchema: z.object({
      query: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(10).optional(),
    }),
    summarize: () => 'Search conversations',
  }),
  def({
    id: 'conversations.get',
    title: 'Get conversation',
    description: 'Read one conversation summary and a bounded transcript.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['conversations:read'],
    integration: 'audio',
    inputSchema: z.object({ id: z.uuid() }),
    summarize: () => 'Read a conversation',
  }),
  def({
    id: 'conversations.summarizeRange',
    title: 'Summarize conversations',
    description: 'Collect conversation summaries in a local time range. Does not create tasks.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['conversations:read'],
    integration: 'audio',
    inputSchema: z.object({
      preset: z.enum(['today', 'yesterday', 'this_week']).optional(),
      start: localTime.optional(),
      end: localTime.optional(),
    }),
    summarize: () => 'Summarize conversations in a range',
  }),
  def({
    id: 'system.getStatus',
    title: 'System status',
    description: 'Atlas API, worker, database and integration health. Does not return secrets or environment values.',
    riskLevel: 0,
    sideEffect: none,
    confirmationPolicy: none,
    requiredPermissions: ['system:read'],
    integration: null,
    inputSchema: z.object({}),
    summarize: () => 'Read system status',
  }),
]

const BY_ID = new Map(ATLAS_TOOLS.map((tool) => [tool.id, tool]))

export function getTool(id: string): AtlasToolDefinition | undefined {
  return BY_ID.get(id)
}

export function listTools(): AtlasToolDefinition[] {
  return ATLAS_TOOLS
}

/** Provider tool names cannot contain dots. */
export function wireName(id: string): string {
  const dot = id.indexOf('.')
  return dot === -1 ? id : `${id.slice(0, dot)}_${id.slice(dot + 1)}`
}

export function toolIdFromWire(name: string): string {
  const underscore = name.indexOf('_')
  return underscore === -1 ? name : `${name.slice(0, underscore)}.${name.slice(underscore + 1)}`
}

function text(input: unknown, key: string): string {
  if (!input || typeof input !== 'object') return ''
  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

function bool(input: unknown, key: string): boolean {
  if (!input || typeof input !== 'object') return false
  return (input as Record<string, unknown>)[key] === true
}

void RiskLevel
void SideEffect
void ConfirmationPolicy
void Permission
export type { ConfirmationPolicyType, IntegrationId, PermissionType, RiskLevelType, SideEffectType }
