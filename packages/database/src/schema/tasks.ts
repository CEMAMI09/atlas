import { sql } from 'drizzle-orm'
import { boolean, index, jsonb, pgTable, real, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, tsvector, tz, updatedAt } from './_columns'
import { users } from './identity'

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('todo'),
    priority: text('priority').notNull().default('normal'),
    dueAt: tz('due_at'),
    source: text('source').notNull().default('manual'),
    sourceRef: text('source_ref'),
    project: text('project'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    completedAt: tz('completed_at'),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("description", '')), 'B')`,
    ),
  },
  (t) => [
    index('tasks_user_status_idx').on(t.userId, t.status),
    index('tasks_due_idx').on(t.dueAt),
    index('tasks_search_idx').using('gin', t.search),
  ],
)

export const taskSuggestions = pgTable(
  'task_suggestions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceKind: text('source_kind').$type<'conversation' | 'email' | 'calendar'>().notNull(),
    sourceId: text('source_id'),
    sourceLabel: text('source_label'),
    title: text('title').notNull(),
    detail: text('detail'),
    suggestedDueAt: tz('suggested_due_at'),
    confidence: real('confidence').notNull().default(0.5),
    status: text('status').$type<'pending' | 'accepted' | 'dismissed'>().notNull().default('pending'),
    createdTaskId: uuid('created_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    dedupeKey: text('dedupe_key'),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: createdAt(),
    decidedAt: tz('decided_at'),
  },
  (t) => [index('task_suggestions_status_idx').on(t.userId, t.status), uniqueIndex('task_suggestions_dedupe_uq').on(t.dedupeKey)],
)

export const projects = pgTable(
  'projects',
  {
    id: id(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    vercelProjectIds: text('vercel_project_ids').array().notNull().default(sql`'{}'::text[]`),
    stripeEnabled: boolean('stripe_enabled').notNull().default(false),
    healthUrls: jsonb('health_urls').$type<{ name: string; url: string }[]>().notNull().default([]),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    isMock: boolean('is_mock').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('projects_slug_uq').on(t.slug)],
)
