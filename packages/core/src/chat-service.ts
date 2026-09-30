import { and, desc, eq } from 'drizzle-orm'
import { pipeUIMessageStreamToResponse } from 'ai'
import type { ServerResponse } from 'node:http'
import type { UIMessageChunk } from 'ai'
import { chatMessages, chatThreads, toolAuditLog, toolConfirmations, type Database } from '@atlas/database'
import {
  createAtlasUiStream,
  executeRegisteredTool,
  forcedTool,
  getTool,
  lastUserText,
  routeModel,
  type AuditDraft,
  type ToolRunner,
} from '@atlas/ai'
import {
  ALL_PERMISSIONS,
  AtlasError,
  ConfirmationRecord,
  ToolOutput,
  type ChatThread,
  type ConfirmationDecisionInput,
  type Permission,
  type ToolInvocationSource,
} from '@atlas/shared'
import type { UIMessage as AiUIMessage } from 'ai'
import { randomToken } from './crypto'
import { runDomainTool } from './run-tool'
import type { Domain } from './domain'

export async function listThreads(db: Database, userId: string): Promise<ChatThread[]> {
  const rows = await db.select().from(chatThreads).where(eq(chatThreads.userId, userId)).orderBy(desc(chatThreads.lastMessageAt)).limit(40)
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messageCount: 0,
    preview: null,
  }))
}

export async function threadMessages(db: Database, userId: string, threadId: string): Promise<AiUIMessage[]> {
  const thread = await ownedThread(db, userId, threadId)
  if (!thread) return []
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.threadId, threadId)).orderBy(chatMessages.seq)
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: (row.parts as AiUIMessage['parts']) ?? [],
    metadata: row.metadata ?? {},
  }))
}

export async function ensureThread(db: Database, userId: string, threadId: string | undefined, title: string): Promise<string> {
  if (threadId) {
    const existing = await ownedThread(db, userId, threadId)
    if (existing) return existing.id
  }
  const inserted = await db
    .insert(chatThreads)
    .values({ ...(threadId ? { id: threadId } : {}), userId, title: title.slice(0, 80) || 'New conversation' })
    .returning({ id: chatThreads.id })
  const id = inserted[0]?.id
  if (!id) throw new AtlasError('INTERNAL', 'Could not start a conversation.')
  return id
}

export async function writeChatStream(response: ServerResponse, stream: ReadableStream<UIMessageChunk>, threadId: string): Promise<void> {
  await pipeUIMessageStreamToResponse({ response, stream, headers: { 'x-atlas-thread': threadId } })
}

export function openChatStream(options: {
  db: Database
  domain: Domain
  userId: string
  threadId: string
  messages: AiUIMessage[]
  models: { fast: string | null; reasoning: string | null }
  routerMode: 'auto' | 'fast' | 'reasoning'
  maxSteps: number
  requestId: string
  abortSignal?: AbortSignal
  disabledTools: string[]
  privacyMode: boolean
}) {
  const text = lastUserText(options.messages)
  const route = routeModel(text, options.routerMode)
  const modelId = (route.tier === 'reasoning' ? options.models.reasoning : options.models.fast) ?? options.models.fast ?? options.models.reasoning
  const runner = createRunner({
    db: options.db,
    domain: options.domain,
    userId: options.userId,
    threadId: options.threadId,
    requestId: options.requestId,
    source: 'chat',
    disabledTools: options.disabledTools,
    privacyMode: options.privacyMode,
    confirmed: false,
  })
  const local = new Date().toLocaleString('en-US', { timeZone: options.domain.timeZone, dateStyle: 'full', timeStyle: 'short' })
  return createAtlasUiStream({
    messages: options.messages,
    modelId,
    route,
    runner,
    abortSignal: options.abortSignal,
    maxSteps: options.maxSteps,
    forceToolId: forcedTool(text),
    system: [
      'You are Atlas, the assistant inside Atlas OS.',
      `The user's local time is ${local} (${options.domain.timeZone}).`,
      'Call Atlas tools for calendar, email, timeline, tasks, room, cameras, Struct, Vercel, and Stripe questions.',
      'Never invent events, messages, payments, deployments, or camera video.',
      'If a tool status is not success, say what failed. Mock sources must be described as mock.',
      'If a tool returns confirmation_required, tell the user to approve the card. Do not claim the action happened.',
      'Keep answers concise and cite times from the tool data.',
    ].join('\n'),
    onAssistantMessage: async (message) => {
      await saveMessage(options.db, options.threadId, message, { modelId, modelTier: route.tier })
    },
  })
}

export async function saveUserMessage(db: Database, threadId: string, message: AiUIMessage): Promise<void> {
  const existing = await db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.id, message.id)).limit(1)
  if (existing.length > 0) return
  await saveMessage(db, threadId, message, {})
  const text = lastUserText([message])
  if (text) {
    await db.update(chatThreads).set({ title: text.slice(0, 80), lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(chatThreads.id, threadId))
  }
}

export async function decideConfirmation(
  db: Database,
  domain: Domain,
  userId: string,
  confirmationId: string,
  decision: ConfirmationDecisionInput,
  requestId: string,
): Promise<ConfirmationRecord> {
  const rows = await db.select().from(toolConfirmations).where(and(eq(toolConfirmations.id, confirmationId), eq(toolConfirmations.userId, userId))).limit(1)
  const row = rows[0]
  if (!row || row.status !== 'pending') throw new AtlasError('NOT_FOUND', 'That confirmation is no longer pending.')
  if (row.expiresAt.getTime() < Date.now()) {
    await db.update(toolConfirmations).set({ status: 'expired', decidedAt: new Date() }).where(eq(toolConfirmations.id, row.id))
    throw new AtlasError('CONFIRMATION_INVALID', 'That confirmation expired.')
  }
  if (!decision.approve) {
    await db.update(toolConfirmations).set({ status: 'rejected', decidedAt: new Date() }).where(eq(toolConfirmations.id, row.id))
    const output = emptyOutput(row.tool, 'rejected')
    return record(row, 'rejected', output)
  }
  if (row.policy === 'strong' && decision.phrase?.trim().toUpperCase() !== (row.phrase ?? 'DISARM')) {
    throw new AtlasError('CONFIRMATION_INVALID', `Type ${row.phrase ?? 'DISARM'} to confirm.`)
  }
  const runner = createRunner({
    db,
    domain,
    userId,
    threadId: row.threadId,
    requestId,
    source: row.invocationSource as ToolInvocationSource,
    disabledTools: [],
    privacyMode: false,
    confirmed: true,
  })
  const output = await executeRegisteredTool(row.tool, row.parameters, runner)
  const status = output.status === 'success' ? 'approved' : 'failed'
  await db.update(toolConfirmations).set({ status, result: output, decidedAt: new Date() }).where(eq(toolConfirmations.id, row.id))
  return record(row, status, output)
}

function createRunner(options: {
  db: Database
  domain: Domain
  userId: string
  threadId: string | null
  requestId: string
  source: ToolInvocationSource
  disabledTools: string[]
  privacyMode: boolean
  confirmed: boolean
}): ToolRunner {
  const granted = new Set<Permission>(ALL_PERMISSIONS)
  return {
    source: options.source,
    granted,
    privacyMode: options.privacyMode,
    confirmed: options.confirmed,
    toolEnabled: (toolId) => !options.disabledTools.includes(toolId),
    run: (toolId, input) => runDomainTool(options.domain, toolId, input),
    beginConfirmation: async (draft) => {
      const tool = getTool(draft.toolId)
      const phrase = draft.policy === 'strong' ? 'DISARM' : null
      const expiresAt = new Date(Date.now() + 5 * 60_000)
      const inserted = await options.db
        .insert(toolConfirmations)
        .values({
          userId: options.userId,
          tool: draft.toolId,
          parameters: asJson(draft.parameters),
          paramsHash: draft.paramsHash,
          riskLevel: draft.riskLevel,
          policy: draft.policy,
          summary: draft.summary,
          phrase,
          requestId: options.requestId,
          threadId: options.threadId,
          invocationSource: options.source,
          expiresAt,
        })
        .returning()
      const row = inserted[0]
      if (!row) throw new AtlasError('INTERNAL', 'Could not request confirmation.')
      return {
        id: row.id,
        toolId: row.tool,
        summary: row.summary,
        riskLevel: tool?.riskLevel ?? 2,
        policy: draft.policy,
        phrase,
        expiresAt: expiresAt.toISOString(),
      }
    },
    audit: async (draft: AuditDraft) => {
      const inserted = await options.db
        .insert(toolAuditLog)
        .values({
          requestId: options.requestId,
          userId: options.userId,
          tool: draft.tool,
          riskLevel: draft.riskLevel,
          sideEffect: draft.sideEffect,
          parameters: draft.parameters,
          resultStatus: draft.resultStatus,
          errorCode: draft.errorCode,
          confirmationState: draft.confirmationState,
          confirmationId: draft.confirmationId,
          durationMs: draft.durationMs,
          invocationSource: draft.source,
          threadId: options.threadId,
          dataMode: draft.dataMode,
        })
        .returning({ id: toolAuditLog.id })
      return inserted[0]?.id ?? null
    },
  }
}

async function saveMessage(db: Database, threadId: string, message: AiUIMessage, extra: { modelId?: string | null; modelTier?: string | null }) {
  const seqRows = await db.select({ seq: chatMessages.seq }).from(chatMessages).where(eq(chatMessages.threadId, threadId)).orderBy(desc(chatMessages.seq)).limit(1)
  const seq = (seqRows[0]?.seq ?? 0) + 1
  await db.insert(chatMessages).values({
    id: message.id || randomToken(12),
    threadId,
    seq,
    role: message.role === 'assistant' ? 'assistant' : 'user',
    parts: message.parts as unknown[],
    metadata: (message.metadata as Record<string, unknown>) ?? {},
    modelId: extra.modelId ?? null,
    modelTier: extra.modelTier ?? null,
  })
  await db.update(chatThreads).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(chatThreads.id, threadId))
}

async function ownedThread(db: Database, userId: string, threadId: string) {
  const rows = await db.select().from(chatThreads).where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId))).limit(1)
  return rows[0] ?? null
}

function record(row: typeof toolConfirmations.$inferSelect, status: ConfirmationRecord['status'], output: ToolOutput): ConfirmationRecord {
  return {
    id: row.id,
    toolId: row.tool,
    summary: row.summary,
    riskLevel: row.riskLevel as ConfirmationRecord['riskLevel'],
    policy: row.policy,
    phrase: row.phrase,
    expiresAt: row.expiresAt.toISOString(),
    status,
    result: output,
    decidedAt: new Date().toISOString(),
  }
}

function emptyOutput(toolId: string, status: ToolOutput['status']): ToolOutput {
  return { toolId, status, sources: [], auditId: null, durationMs: 0 }
}

function asJson(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : { value }
}
