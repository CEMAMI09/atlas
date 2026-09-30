import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import type { Database } from './client'

/**
 * Locate the SQL migrations. Works from source (tsx/vitest), from esbuild bundles (which copy the
 * folder next to the bundle) and inside containers (ATLAS_MIGRATIONS_DIR).
 */
export function resolveMigrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    process.env.ATLAS_MIGRATIONS_DIR,
    join(here, '..', 'migrations'),
    join(here, 'migrations'),
    join(process.cwd(), 'migrations'),
  ].filter((v): v is string => Boolean(v))
  for (const candidate of candidates) {
    const abs = resolve(candidate)
    if (existsSync(join(abs, 'meta', '_journal.json'))) return abs
  }
  throw new Error(`Could not find database migrations (looked in: ${candidates.join(', ')})`)
}

export async function runMigrations(db: Database, migrationsFolder = resolveMigrationsFolder()): Promise<void> {
  await migrate(db, { migrationsFolder, migrationsSchema: 'drizzle', migrationsTable: '__atlas_migrations' })
}
