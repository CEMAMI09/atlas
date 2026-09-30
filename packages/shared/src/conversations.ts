import { z } from 'zod'
import { IsoDateTime } from './common'

export const ConversationStatus = z.enum(['recording', 'processing', 'complete', 'failed'])
export type ConversationStatus = z.infer<typeof ConversationStatus>

export const ConversationSource = z.enum(['mock', 'browser', 'file_upload', 'room_microphone'])
export type ConversationSource = z.infer<typeof ConversationSource>

export const TranscriptSegment = z.object({
  id: z.uuid(),
  speaker: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
})
export type TranscriptSegment = z.infer<typeof TranscriptSegment>

export const ConversationSummary = z.object({
  summary: z.string(),
  topics: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(z.string()),
  model: z.string().nullable(),
  createdAt: IsoDateTime,
})
export type ConversationSummary = z.infer<typeof ConversationSummary>

export const Conversation = z.object({
  id: z.uuid(),
  title: z.string(),
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.nullable(),
  durationSeconds: z.number().int().nullable(),
  source: ConversationSource,
  status: ConversationStatus,
  roomName: z.string().nullable(),
  participants: z.array(z.string()),
  summary: ConversationSummary.nullable(),
  segmentCount: z.number().int(),
  pendingSuggestions: z.number().int(),
  isMock: z.boolean(),
})
export type Conversation = z.infer<typeof Conversation>

export const ConversationDetail = Conversation.extend({
  segments: z.array(TranscriptSegment),
  transcriptAvailable: z.boolean(),
})
export type ConversationDetail = z.infer<typeof ConversationDetail>

export const DailySummary = z.object({
  date: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()),
  conversationCount: z.number().int(),
  createdAt: IsoDateTime,
})
export type DailySummary = z.infer<typeof DailySummary>

/**
 * MIC_DISABLED           — nothing is captured
 * TRANSCRIPTION_ENABLED  — ambient transcription is allowed (always visibly indicated)
 * ATLAS_VOICE_ACTIVE     — push-to-talk / voice command capture in progress
 * PRIVACY_MODE           — global privacy switch: all capture and ambient processing stopped
 */
export const MicState = z.enum(['MIC_DISABLED', 'TRANSCRIPTION_ENABLED', 'ATLAS_VOICE_ACTIVE', 'PRIVACY_MODE'])
export type MicState = z.infer<typeof MicState>

export const PrivacyStatus = z.object({
  micState: MicState,
  privacyMode: z.boolean(),
  /** Reserved for the future hardware kill switch — reported, never overridable in software. */
  hardwareKillSwitch: z.enum(['absent', 'engaged', 'released']),
  recording: z.boolean(),
  changedAt: IsoDateTime.nullable(),
})
export type PrivacyStatus = z.infer<typeof PrivacyStatus>
