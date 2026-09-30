import { ConfigError, loadConfig } from '@atlas/config'
import { createDatabase } from '../client'
import { runMigrations } from '../migrate'

async function main(): Promise<void> {
  const config = loadConfig({ service: 'cli' })
  const handle = createDatabase(config.env.DATABASE_URL, { max: 1, applicationName: 'atlas-migrate' })
  try {
    await runMigrations(handle.db)
    console.log('Database migrations are up to date.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Migration failed: ${config.scrub(message)}`)
    process.exitCode = 1
  } finally {
    await handle.close()
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) console.error(error.message)
  else console.error('Migration failed:', error instanceof Error ? error.name : 'unknown error')
  process.exitCode = 1
})
