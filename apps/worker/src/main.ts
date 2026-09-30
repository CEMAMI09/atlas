import { createRuntime } from '@atlas/core'

const runtime = await createRuntime('worker')
runtime.log.info('Atlas worker started')

const timer = setInterval(() => {
  void runtime.heartbeat()
}, 15_000)

const shutdown = async () => {
  clearInterval(timer)
  await runtime.close()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
