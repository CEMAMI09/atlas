import { z } from 'zod'
import { DataSource, IsoDateTime } from './common'
import { AtlasErrorCode } from './errors'
import { ConfirmationPolicy, RiskLevel, ToolResultStatus } from './risk'

export const ModelTier = z.enum(['fast', 'reasoning'])
export type ModelTier = z.infer<typeof ModelTier>

/** Metadata attached to UI messages by the server. */
export const ChatMessageMetadata = z.object({
  createdAt: z.number().optional(),
  modelTier: ModelTier.optional(),
  modelId: z.string().optional(),
  routeReason: z.string().optional(),
  requestId: z.string().optional(),
  durationMs: z.number().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  finishReason: z.string().optional(),
})
export type ChatMessageMetadata = z.infer<typeof ChatMessageMetadata>

export const ConfirmationRequest = z.object({
  id: z.uuid(),
  toolId: z.string(),
  summary: z.string(),
  riskLevel: RiskLevel,
  policy: ConfirmationPolicy,
  /** For `strong` confirmations the user must type this phrase. */
  phrase: z.string().nullable(),
  expiresAt: IsoDateTime,
})
export type ConfirmationRequest = z.infer<typeof ConfirmationRequest>

/**
 * The envelope every Atlas tool returns. The model sees this exact object, so success is only ever
 * claimed when `status === 'success'`, and provenance (`sources`) is always explicit.
 */
export const ToolOutput = z.object({
  toolId: z.string(),
  status: ToolResultStatus,
  data: z.unknown().optional(),
  error: z.object({ code: AtlasErrorCode, message: z.string() }).optional(),
  sources: z.array(DataSource),
  confirmation: ConfirmationRequest.optional(),
  auditId: z.uuid().nullable(),
  durationMs: z.number(),
  note: z.string().optional(),
})
export type ToolOutput = z.infer<typeof ToolOutput>

export const ChatThread = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  messageCount: z.number().int(),
  preview: z.string().nullable(),
})
export type ChatThread = z.infer<typeof ChatThread>

export const ConfirmationDecisionInput = z.object({
  approve: z.boolean(),
  phrase: z.string().max(100).optional(),
})
export type ConfirmationDecisionInput = z.infer<typeof ConfirmationDecisionInput>

export const ConfirmationRecord = ConfirmationRequest.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'expired', 'failed']),
  result: ToolOutput.nullable(),
  decidedAt: IsoDateTime.nullable(),
})
export type ConfirmationRecord = z.infer<typeof ConfirmationRecord>

export const SUGGESTED_QUERIES = [
  "What's on my agenda?",
  'What happened between 3 and 5?',
  'How is Struct doing?',
  'Any important email?',
  'Is the room secure?',
  'What did I talk about today?',
] as const
