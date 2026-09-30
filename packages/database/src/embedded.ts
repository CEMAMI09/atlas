import { mkdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

export interface EmbeddedPostgres {
  port: number
  host: string
  /** Connection URL for postgres.js (credentials are ignored by the embedded server). */
  url: string
  stop: () => Promise<void>
}

export interface EmbeddedPostgresOptions {
  /** Directory for persistent data; omit for an in-memory database (tests). */
  dataDir?: string
  host?: string
  /** 0 picks a free port. */
  port?: number
  maxConnections?: number
}

/**
 * Development-only PostgreSQL (PGlite + pgvector) exposed over the Postgres wire protocol, so the
 * API and worker use exactly the same DATABASE_URL + driver path as production. Not for production.
 */
export async function startEmbeddedPostgres(options: EmbeddedPostgresOptions = {}): Promise<EmbeddedPostgres> {
  if (options.dataDir) mkdirSync(options.dataDir, { recursive: true })
  const db = await PGlite.create({
    ...(options.dataDir ? { dataDir: options.dataDir } : {}),
    extensions: { vector },
  })
  await db.exec('CREATE EXTENSION IF NOT EXISTS vector')
  const host = options.host ?? '127.0.0.1'
  const server = new PGLiteSocketServer({
    db,
    host,
    port: options.port ?? 0,
    maxConnections: options.maxConnections ?? 32,
  })
  await server.start()
  const port = resolvePort(server, options.port ?? 0)
  return {
    port,
    host,
    url: `postgresql://atlas:atlas@${host}:${port}/atlas`,
    stop: async () => {
      await server.stop()
      await db.close()
    },
  }
}

function resolvePort(server: PGLiteSocketServer, requested: number): number {
  const s = server as unknown as { server?: { address?: () => unknown }; port?: number }
  const address = s.server?.address?.()
  if (address && typeof address === 'object' && 'port' in address) return Number((address as { port: number }).port)
  if (typeof s.port === 'number' && s.port > 0) return s.port
  return requested
}
