import 'server-only'
import pino from 'pino'

/**
 * Structured JSON logs to stdout; the hosting platform ships them to the log store.
 * Secrets and personal data are redacted at the logger, not left to each call site.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { service: process.env.SERVICE_NAME ?? 'kineticscout-web' },
  redact: {
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      'authorization',
      '*.authorization',
      'cookie',
      '*.cookie',
      'headers.cookie',
      'headers.authorization',
      'email',
      '*.email',
      'guardianEmail',
      '*.guardianEmail',
      'dateOfBirth',
      '*.dateOfBirth',
      'apiKey',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

export type Logger = typeof logger

/** Error fields that are safe to log (no request bodies or user input). */
export function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { err: { name: error.name, message: error.message, stack: error.stack } }
  }
  return { err: { message: String(error) } }
}
