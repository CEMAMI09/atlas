import { z } from 'zod'

export const AtlasErrorCode = z.enum([
  // generic
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CSRF_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
  // integrations
  'NOT_CONFIGURED',
  'DISCONNECTED',
  'AUTH_FAILED',
  'UNSUPPORTED',
  'PROVIDER_ERROR',
  'PROVIDER_TIMEOUT',
  'INVALID_PROVIDER_RESPONSE',
  // permissions / tools
  'TOOL_DISABLED',
  'PERMISSION_DENIED',
  'CONFIRMATION_REQUIRED',
  'CONFIRMATION_INVALID',
  'PRIVACY_MODE',
  // ai
  'AI_NOT_CONFIGURED',
  'AI_PROVIDER_ERROR',
])
export type AtlasErrorCode = z.infer<typeof AtlasErrorCode>

export const ApiErrorBody = z.object({
  error: z.object({
    code: AtlasErrorCode,
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
})
export type ApiErrorBody = z.infer<typeof ApiErrorBody>

/** Error with a stable, typed code that is safe to show to users and to the model. */
export class AtlasError extends Error {
  readonly code: AtlasErrorCode
  readonly status: number
  readonly details: unknown

  constructor(code: AtlasErrorCode, message: string, options: { status?: number; details?: unknown; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'AtlasError'
    this.code = code
    this.status = options.status ?? defaultStatusFor(code)
    this.details = options.details
  }
}

export function defaultStatusFor(code: AtlasErrorCode): number {
  switch (code) {
    case 'BAD_REQUEST':
    case 'VALIDATION_FAILED':
      return 400
    case 'UNAUTHENTICATED':
      return 401
    case 'FORBIDDEN':
    case 'CSRF_FAILED':
    case 'PERMISSION_DENIED':
    case 'TOOL_DISABLED':
    case 'PRIVACY_MODE':
      return 403
    case 'NOT_FOUND':
      return 404
    case 'CONFLICT':
    case 'CONFIRMATION_INVALID':
      return 409
    case 'CONFIRMATION_REQUIRED':
      return 428
    case 'RATE_LIMITED':
      return 429
    case 'NOT_CONFIGURED':
    case 'DISCONNECTED':
    case 'AI_NOT_CONFIGURED':
      return 503
    case 'AUTH_FAILED':
    case 'PROVIDER_ERROR':
    case 'PROVIDER_TIMEOUT':
    case 'INVALID_PROVIDER_RESPONSE':
    case 'AI_PROVIDER_ERROR':
      return 502
    case 'UNSUPPORTED':
      return 501
    case 'INTERNAL':
      return 500
  }
}

export function isAtlasError(value: unknown): value is AtlasError {
  return value instanceof AtlasError
}
