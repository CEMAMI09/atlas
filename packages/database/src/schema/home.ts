import { boolean, index, integer, jsonb, pgTable, real, smallint, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, tz, updatedAt } from './_columns'

export const rooms = pgTable(
  'rooms',
  {
    id: id(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    floor: text('floor'),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('rooms_key_uq').on(t.key)],
)

export const devices = pgTable(
  'devices',
  {
    id: id(),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    /** Detected capabilities (e.g. camera: snapshot/live_stream/motion_detection). */
    capabilities: text('capabilities').array().notNull().default([]),
    state: text('state'),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    online: boolean('online'),
    battery: real('battery'),
    lastSeenAt: tz('last_seen_at'),
    lastChangedAt: tz('last_changed_at'),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('devices_provider_external_uq').on(t.provider, t.externalId, t.isMock), index('devices_kind_idx').on(t.kind)],
)

export const presenceObservations = pgTable(
  'presence_observations',
  {
    id: id(),
    personId: text('person_id').notNull(),
    roomKey: text('room_key'),
    source: text('source').notNull(),
    sourceId: text('source_id'),
    signal: text('signal').notNull(),
    strength: real('strength'),
    observedAt: tz('observed_at').notNull(),
    isMock: boolean('is_mock').notNull().default(false),
  },
  (t) => [index('presence_observations_time_idx').on(t.observedAt)],
)

export const presenceStates = pgTable(
  'presence_states',
  {
    id: id(),
    personId: text('person_id').notNull(),
    personName: text('person_name').notNull(),
    roomKey: text('room_key'),
    roomName: text('room_name'),
    status: text('status').$type<'PRESENT' | 'ABSENT' | 'UNCERTAIN'>().notNull(),
    confidence: real('confidence').notNull(),
    evidence: jsonb('evidence').$type<unknown[]>().notNull().default([]),
    estimatedAt: tz('estimated_at').notNull(),
    isMock: boolean('is_mock').notNull().default(false),
  },
  (t) => [index('presence_states_person_time_idx').on(t.personId, t.estimatedAt)],
)

export const automationRules = pgTable('automation_rules', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  enabled: boolean('enabled').notNull().default(false),
  trigger: jsonb('trigger').$type<Record<string, unknown>>().notNull(),
  conditions: jsonb('conditions').$type<unknown[]>().notNull().default([]),
  actions: jsonb('actions').$type<unknown[]>().notNull().default([]),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(300),
  maxRiskLevel: smallint('max_risk_level').notNull().default(1),
  lastRunAt: tz('last_run_at'),
  lastRunStatus: text('last_run_status'),
  isMock: boolean('is_mock').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const automationRuns = pgTable(
  'automation_runs',
  {
    id: id(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => automationRules.id, { onDelete: 'cascade' }),
    triggeredAt: tz('triggered_at').notNull().defaultNow(),
    status: text('status').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('automation_runs_rule_idx').on(t.ruleId, t.triggeredAt)],
)
