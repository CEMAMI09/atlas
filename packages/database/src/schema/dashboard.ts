import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, updatedAt } from './_columns'
import { users } from './identity'

export const dashboardLayouts = pgTable(
  'dashboard_layouts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('overview'),
    breakpoint: text('breakpoint').$type<'desktop' | 'tablet' | 'mobile'>().notNull(),
    columns: integer('columns').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('dashboard_layouts_user_name_bp_uq').on(t.userId, t.name, t.breakpoint)],
)

export const dashboardWidgets = pgTable(
  'dashboard_widgets',
  {
    id: id(),
    layoutId: uuid('layout_id')
      .notNull()
      .references(() => dashboardLayouts.id, { onDelete: 'cascade' }),
    /** Client-facing widget instance id (stable across saves). */
    instanceId: text('instance_id').notNull(),
    type: text('type').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    w: integer('w').notNull(),
    h: integer('h').notNull(),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('dashboard_widgets_layout_idx').on(t.layoutId),
    uniqueIndex('dashboard_widgets_layout_instance_uq').on(t.layoutId, t.instanceId),
  ],
)
