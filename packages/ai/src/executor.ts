import { evaluatePermission, hashParameters, redactParameters, LEVEL_4_ENABLED } from '@atlas/permissions'
import {
  AtlasError,
  isAtlasError,
  type ConfirmationRequest,
  type ConfirmationState,
  type DataSource,
  type Permission,
  type ToolInvocationSource,
  type ToolOutput,
  type ToolResultStatus,
} from '@atlas/shared'
import { getTool } from './registry'

export interface ToolRunResult {
  data: unknown
  sources: DataSource[]
  note?: string
}

export interface ConfirmationDraft {
  toolId: string
  summary: string
  policy: 'confirm' | 'strong'
  parameters: unknown
  paramsHash: string
  riskLevel: number
}

export interface AuditDraft {
  tool: string
  riskLevel: number
  sideEffect: string
  parameters: Record<string, unknown>
  resultStatus: ToolResultStatus
  errorCode: string | null
  confirmationState: ConfirmationState
  confirmationId: string | null
  durationMs: number
  source: ToolInvocationSource
  dataMode: 'live' | 'mock' | null
}

export interface ToolRunner {
  source: ToolInvocationSource
  granted: ReadonlySet<Permission>
  privacyMode: boolean
  confirmed: boolean
  toolEnabled(toolId: string): boolean
  run(toolId: string, input: unknown): Promise<ToolRunResult>
  beginConfirmation(draft: ConfirmationDraft): Promise<ConfirmationRequest>
  audit(draft: AuditDraft): Promise<string | null>
}

export async function executeRegisteredTool(toolId: string, rawInput: unknown, runner: ToolRunner): Promise<ToolOutput> {
  const started = Date.now()
  const tool = getTool(toolId)
  if (!tool) {
    return envelope(toolId, started, {
      status: 'error',
      error: { code: 'NOT_FOUND', message: `Unknown tool ${toolId}.` },
      sources: [],
      auditId: null,
    })
  }

  const parsed = tool.inputSchema.safeParse(rawInput ?? {})
  if (!parsed.success) {
    const auditId = await runner.audit(audit(tool, parsedInput(rawInput), 'error', 'VALIDATION_FAILED', 'not_required', null, started, runner, null))
    return envelope(toolId, started, {
      status: 'error',
      error: { code: 'VALIDATION_FAILED', message: 'Tool input did not match the schema.' },
      sources: [],
      auditId,
    })
  }

  const decision = evaluatePermission(tool, {
    granted: runner.granted,
    toolEnabled: runner.toolEnabled(tool.id),
    source: runner.source,
    privacyMode: runner.privacyMode,
    level4Enabled: LEVEL_4_ENABLED,
    confirmed: runner.confirmed,
  })

  if (decision.outcome === 'deny') {
    const auditId = await runner.audit(
      audit(tool, parsed.data, 'denied', decision.code, 'not_required', null, started, runner, null),
    )
    return envelope(toolId, started, {
      status: decision.code === 'TOOL_DISABLED' ? 'disabled' : 'denied',
      error: { code: decision.code, message: decision.reason },
      sources: [],
      auditId,
    })
  }

  if (decision.outcome === 'confirm') {
    const confirmation = await runner.beginConfirmation({
      toolId: tool.id,
      summary: tool.summarize(parsed.data),
      policy: decision.confirmation,
      parameters: parsed.data,
      paramsHash: hashParameters(tool.id, parsed.data),
      riskLevel: tool.riskLevel,
    })
    const auditId = await runner.audit(
      audit(tool, parsed.data, 'pending_confirmation', null, 'required', confirmation.id, started, runner, null),
    )
    return envelope(toolId, started, {
      status: 'pending_confirmation',
      confirmation,
      sources: [],
      auditId,
      note: 'The action has not run. The user must approve it.',
    })
  }

  try {
    const result = await runner.run(tool.id, parsed.data)
    const mode = result.sources.some((source) => source.mode === 'mock') ? 'mock' : result.sources[0]?.mode ?? null
    const auditId = await runner.audit(
      audit(tool, parsed.data, 'success', null, runner.confirmed ? 'approved' : 'not_required', null, started, runner, mode),
    )
    return envelope(toolId, started, {
      status: 'success',
      data: result.data,
      sources: result.sources,
      auditId,
      ...(result.note ? { note: result.note } : {}),
    })
  } catch (error) {
    const coded = isAtlasError(error) ? error : new AtlasError('INTERNAL', 'The tool failed.')
    const auditId = await runner.audit(
      audit(tool, parsed.data, 'error', coded.code, runner.confirmed ? 'approved' : 'not_required', null, started, runner, null),
    )
    return envelope(toolId, started, {
      status: 'error',
      error: { code: coded.code, message: coded.message },
      sources: [],
      auditId,
    })
  }
}

function envelope(toolId: string, started: number, partial: Omit<ToolOutput, 'toolId' | 'durationMs'>): ToolOutput {
  return { toolId, durationMs: Date.now() - started, ...partial }
}

function audit(
  tool: { id: string; riskLevel: number; sideEffect: string },
  parameters: unknown,
  resultStatus: ToolResultStatus,
  errorCode: string | null,
  confirmationState: ConfirmationState,
  confirmationId: string | null,
  started: number,
  runner: ToolRunner,
  dataMode: 'live' | 'mock' | null,
): AuditDraft {
  return {
    tool: tool.id,
    riskLevel: tool.riskLevel,
    sideEffect: tool.sideEffect,
    parameters: redactParameters(parameters),
    resultStatus,
    errorCode,
    confirmationState,
    confirmationId,
    durationMs: Date.now() - started,
    source: runner.source,
    dataMode,
  }
}

function parsedInput(raw: unknown): unknown {
  return raw && typeof raw === 'object' ? raw : { value: raw }
}
