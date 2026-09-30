import { createDatabase, type DatabaseHandle } from '../client'
import { startEmbeddedPostgres, type EmbeddedPostgres } from '../embedded'
import { runMigrations } from '../migrate'

export interface TestDatabase extends DatabaseHandle {
  url: string
  server: EmbeddedPostgres
  /** Stop the connection pool and the embedded server. */
  destroy: () => Promise<void>
}

/** In-memory PGlite + pgvector over the wire protocol, migrated to the latest schema. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const server = await startEmbeddedPostgres({ port: 0 })
  const handle = createDatabase(server.url, { max: 4, applicationName: 'atlas-test' })
  await runMigrations(handle.db)
  return {
    ...handle,
    url: server.url,
    server,
    destroy: async () => {
      await handle.close()
      await server.stop()
    },
  }
}

export { startEmbeddedPostgres, type EmbeddedPostgres } from '../embedded'
