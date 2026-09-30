import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Schema = typeof schema
export type Database = PostgresJsDatabase<Schema>
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
/** Either the root database or a transaction — repositories accept both. */
export type Executor = Database | Transaction

export interface DatabaseHandle {
  db: Database
  sql: postgres.Sql
  close: () => Promise<void>
}

export interface CreateDatabaseOptions {
  max?: number
  applicationName?: string
  /** Connection attempts time out after this many seconds. */
  connectTimeout?: number
}

export function createDatabase(url: string, options: CreateDatabaseOptions = {}): DatabaseHandle {
  const sql = postgres(url, {
    max: options.max ?? 10,
    idle_timeout: 30,
    connect_timeout: options.connectTimeout ?? 10,
    prepare: false,
    onnotice: () => {},
    connection: { application_name: options.applicationName ?? 'atlas' },
  })
  const db = drizzle({ client: serializeQueries(sql), schema })
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 })
    },
  }
}

/**
 * PGlite's wire protocol reuses one unnamed prepared statement across pipelined queries, so
 * concurrent statements get each other's parameters. Queue them. Transactions stay re-entrant.
 */
function serializeQueries(sql: postgres.Sql): postgres.Sql {
  const scope = new AsyncLocalStorage<true>()
  let tail: Promise<void> = Promise.resolve()
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    if (scope.getStore()) return fn()
    const run = tail.then(() => scope.run(true, fn))
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  const originalUnsafe = sql.unsafe.bind(sql)
  const unsafe = (query: string, params?: postgres.ParameterOrJSON<never>[], queryOptions?: postgres.UnsafeQueryOptions) => {
    let mode: 'rows' | 'values' | 'execute' = 'rows'
    let started: Promise<unknown> | null = null
    const go = () => {
      if (!started) {
        started = enqueue(() => {
          const pending = originalUnsafe(query, params ?? [], queryOptions)
          if (mode === 'values') return pending.values()
          if (mode === 'execute') return pending.execute()
          return pending
        })
      }
      return started
    }
    return {
      then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return go().then(onFulfilled, onRejected)
      },
      catch(onRejected?: (reason: unknown) => unknown) {
        return go().catch(onRejected)
      },
      finally(onFinally?: () => void) {
        return go().finally(onFinally)
      },
      values() {
        mode = 'values'
        return go()
      },
      execute() {
        mode = 'execute'
        return go()
      },
    }
  }
  sql.unsafe = unsafe as typeof sql.unsafe

  const originalBegin = sql.begin.bind(sql)
  sql.begin = ((callback, options) => enqueue(() => originalBegin(callback, options))) as typeof sql.begin
  return sql
}
