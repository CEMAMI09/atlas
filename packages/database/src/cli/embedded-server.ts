import { createConnection } from 'node:net'
import { join } from 'node:path'
import { ConfigError, loadConfig } from '@atlas/config'
import { startEmbeddedPostgres } from '../embedded'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function portInUse(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.setTimeout(1000, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function main(): Promise<void> {
  const config = loadConfig({ service: 'cli' })
  if (config.isProduction) {
    console.error('The embedded database is for development only. Use PostgreSQL + pgvector in production.')
    process.exitCode = 1
    return
  }
  const url = new URL(config.env.DATABASE_URL)
  if (!LOCAL_HOSTS.has(url.hostname)) {
    console.error('DATABASE_URL does not point at localhost; the embedded database only serves local development.')
    process.exitCode = 1
    return
  }
  const port = Number(url.port || 5432)
  if (await portInUse(port, '127.0.0.1')) {
    console.error(`Port ${port} is already in use — a PostgreSQL server (or another embedded instance) is already running.`)
    process.exitCode = 1
    return
  }
  const dataDir = join(config.dataDir, 'pglite')
  const server = await startEmbeddedPostgres({ dataDir, port, host: '127.0.0.1' })
  console.log(`Embedded PostgreSQL (PGlite + pgvector) listening on 127.0.0.1:${server.port}`)
  console.log(`Data directory: ${dataDir}`)
  console.log('Development only. Press Ctrl+C to stop.')

  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    console.log('Stopping embedded PostgreSQL...')
    await server.stop()
    process.exit(0)
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) console.error(error.message)
  else console.error('Embedded database failed to start:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
