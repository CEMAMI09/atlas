import { customType, timestamp, uuid } from 'drizzle-orm/pg-core'

/** Postgres `tsvector` (read-only generated search columns). */
export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector'
  },
})

export const id = () => uuid('id').primaryKey().defaultRandom()

export const tz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const createdAt = () => tz('created_at').notNull().defaultNow()

export const updatedAt = () =>
  tz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
