import {
  convertToModelMessages,
  gateway,
  isStepCount,
  streamText,
  tool,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from 'ai'
import type { ToolOutput } from '@atlas/shared'
import { executeRegisteredTool, type ToolRunner } from './executor'
import { planFallback, renderFallback } from './fallback'
import { ATLAS_TOOLS, toolIdFromWire, wireName } from './registry'
import type { RouteDecision } from './router'

export interface AtlasChatRequest {
  messages: UIMessage[]
  system: string
  modelId: string | null
  route: RouteDecision
  runner: ToolRunner
  abortSignal?: AbortSignal
  maxSteps: number
  forceToolId?: string | null
  /** Called with the final assistant UI message so the server can persist it. */
  onAssistantMessage?: (message: UIMessage) => Promise<void>
}

export async function atlasModelMessages(messages: UIMessage[]): Promise<ModelMessage[]> {
  const converted = await convertToModelMessages(messages.filter((message) => message.role === 'user' || message.role === 'assistant'))
  return converted.slice(-20)
}

export async function createAtlasUiStream(request: AtlasChatRequest): Promise<ReadableStream<UIMessageChunk>> {
  if (!request.modelId) {
    return fallbackStream(request, 'Atlas AI is not configured. The language model was not called. Tool results below are from Atlas.')
  }

  const tools = Object.fromEntries(
    ATLAS_TOOLS.map((definition) => [
      wireName(definition.id),
      tool({
        description: `${definition.description} Risk level ${definition.riskLevel}.`,
        inputSchema: definition.inputSchema,
        execute: async (input) => executeRegisteredTool(definition.id, input, request.runner),
      }),
    ]),
  )

  try {
    const modelMessages = await atlasModelMessages(request.messages)
    const result = streamText({
      model: gateway(request.modelId),
      system: request.system,
      messages: modelMessages,
      tools,
      stopWhen: isStepCount(request.maxSteps),
      abortSignal: request.abortSignal,
      prepareStep: ({ stepNumber }) => {
        if (stepNumber === 0 && request.forceToolId) {
          return { toolChoice: { type: 'tool' as const, toolName: wireName(request.forceToolId) } }
        }
        return { toolChoice: 'auto' as const }
      },
    })

    return toUIMessageStream({
      stream: result.stream,
      sendReasoning: false,
      originalMessages: request.messages,
      messageMetadata: () => ({
        createdAt: Date.now(),
        modelTier: request.route.tier,
        modelId: request.modelId,
        routeReason: request.route.reason,
      }),
      onError: (error) => safeModelError(error),
      onEnd: async ({ messages, isAborted }) => {
        if (isAborted || !request.onAssistantMessage) return
        const assistant = [...messages].reverse().find((message) => message.role === 'assistant')
        if (assistant) await request.onAssistantMessage(assistant)
      },
    })
  } catch (error) {
    return fallbackStream(request, `The language model could not be reached (${safeModelError(error)}). Atlas tools still ran.`)
  }
}

function fallbackStream(request: AtlasChatRequest, note: string): ReadableStream<UIMessageChunk> {
  const text = lastUserText(request.messages)
  return new ReadableStream({
    async start(controller) {
      const id = crypto.randomUUID()
      const outputs: ToolOutput[] = []
      try {
        for (const step of planFallback(text)) {
          const callId = crypto.randomUUID()
          const output = await executeRegisteredTool(step.toolId, step.input, request.runner)
          outputs.push(output)
          controller.enqueue({ type: 'tool-input-available', toolCallId: callId, toolName: wireName(step.toolId), input: step.input })
          controller.enqueue({ type: 'tool-output-available', toolCallId: callId, output })
        }
        const answer = renderFallback(text, outputs, note)
        controller.enqueue({ type: 'text-start', id })
        controller.enqueue({ type: 'text-delta', id, delta: answer })
        controller.enqueue({ type: 'text-end', id })
        controller.enqueue({ type: 'finish', finishReason: 'stop' })
        if (request.onAssistantMessage) {
          const assistant = {
            id,
            role: 'assistant' as const,
            parts: [
              ...outputs.map((output, index) => ({
                type: `tool-${wireName(output.toolId)}` as const,
                toolCallId: `fallback-${index}`,
                state: 'output-available' as const,
                input: planFallback(text)[index]?.input ?? {},
                output,
              })),
              { type: 'text' as const, text: answer },
            ],
          }
          await request.onAssistantMessage(assistant as UIMessage)
        }
        controller.close()
      } catch (error) {
        controller.enqueue({ type: 'error', errorText: safeModelError(error) })
        controller.close()
      }
    },
  })
}

export function lastUserText(messages: UIMessage[]): string {
  const user = [...messages].reverse().find((message) => message.role === 'user')
  if (!user) return ''
  return user.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim()
}

export function safeModelError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'The model request failed.'
  return message.replace(/sk-[a-zA-Z0-9_-]+/g, '[redacted]').replace(/[A-Za-z0-9_-]{24,}/g, (token) => (token.includes(' ') ? token : '[redacted]')).slice(0, 240)
}

export { toolIdFromWire }
