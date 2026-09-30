import type { IntegrationId } from '@atlas/shared'

/**
 * Which integration governs the mock data of each event source. Mock events from a source are
 * hidden once its integration runs live (or is disabled), so mock and real data never mix.
 */
export const SOURCE_INTEGRATION: Record<string, IntegrationId | null> = {
  google: 'google',
  vercel: 'vercel',
  stripe: 'stripe',
  home_assistant: 'home_assistant',
  presence: 'home_assistant',
  audio: 'audio',
  mqtt: 'mqtt',
  weather: 'weather',
  atlas: null,
  system: null,
}

export interface MockVisibility {
  /** Sources whose mock rows are currently visible. Empty = hide all mock rows. */
  mockSources: string[]
}

export function mockSourcesFor(mockIntegrations: ReadonlySet<IntegrationId>, globalMock: boolean): string[] {
  if (!globalMock) return []
  return Object.entries(SOURCE_INTEGRATION)
    .filter(([, integration]) => integration === null || mockIntegrations.has(integration))
    .map(([source]) => source)
}
