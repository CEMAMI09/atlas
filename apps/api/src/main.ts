import { buildServer } from './server'
import { createRuntime } from '@atlas/core'

const runtime = await createRuntime('api')
const app = await buildServer(runtime)
const host = runtime.config.env.ATLAS_API_HOST
const port = runtime.config.env.ATLAS_API_PORT

const shutdown = async () => {
  await app.close()
  await runtime.close()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())

await app.listen({ host, port })
runtime.log.info({ host, port }, 'Atlas API listening')
setInterval(() => {
  void runtime.heartbeat()
}, 15_000)
