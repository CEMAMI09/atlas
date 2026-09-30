import type { AiRouterMode, ModelTier } from '@atlas/shared'

export interface RouteDecision {
  tier: ModelTier
  reason: string
}

const REASONING = [
  /what happened/i,
  /between\s+\d/i,
  /summar/i,
  /while i was/i,
  /compare/i,
  /correlat/i,
  /\bplan\b/i,
  /across/i,
  /why did/i,
  /figure out/i,
]

/** Picks a model tier. Model ids stay in the environment; this only chooses fast or reasoning. */
export function routeModel(text: string, mode: AiRouterMode): RouteDecision {
  if (mode === 'fast') return { tier: 'fast', reason: 'Router is set to fast.' }
  if (mode === 'reasoning') return { tier: 'reasoning', reason: 'Router is set to reasoning.' }
  if (text.length > 500) return { tier: 'reasoning', reason: 'Long request.' }
  if (REASONING.some((pattern) => pattern.test(text))) {
    return { tier: 'reasoning', reason: 'The question needs multi-source analysis.' }
  }
  return { tier: 'fast', reason: 'Routine lookup.' }
}

/** Known questions that should call a specific tool on the first step. */
export function forcedTool(text: string): string | null {
  const q = text.toLowerCase()
  if (/what happened|between\s+\d|while i was|everything that happened/.test(q)) return 'timeline.whatHappened'
  if (/agenda|calendar|what'?s on|on my schedule|tomorrow/.test(q) && /agenda|calendar|schedule|tomorrow|today/.test(q)) {
    return 'calendar.getEvents'
  }
  if (/struct/.test(q)) return 'projects.getStatus'
  if (/important email|inbox|email/.test(q)) return 'email.getImportant'
  if (/secure|alarm|armed/.test(q)) return 'security.getState'
  if (/conversation|what did i say|talk about/.test(q)) return 'conversations.search'
  return null
}
