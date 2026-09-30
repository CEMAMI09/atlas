import pino, { type Logger } from 'pino'
import { REDACTED, REDACTED_LOG_PATHS, type AtlasConfig } from '@atlas/config'

export function createLogger(config: AtlasConfig): Logger {
  return pino({
    level: config.env.LOG_LEVEL,
    base: { service: config.service },
    redact: { paths: [...REDACTED_LOG_PATHS], censor: REDACTED },
    timestamp: pino.stdTimeFunctions.isoTime,
  })
}

export type AtlasLogger = Logger
