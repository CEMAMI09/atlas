import { AtlasError, type Deployment, type DeploymentProject } from '@atlas/shared'
import { vercelReadPath } from '../readonly'

const HOST = 'https://api.vercel.com'

export async function fetchVercelProjects(token: string, teamId: string | undefined, projectIds: string[]): Promise<DeploymentProject[]> {
  const payload = await vercelGet(token, '/v9/projects', teamId, { limit: '20' })
  const wanted = new Set(projectIds)
  const projects: DeploymentProject[] = []
  for (const project of asArray(payload.projects)) {
    const record = asRecord(project)
    const id = stringField(record, 'id')
    const name = stringField(record, 'name')
    if (!id || !name) continue
    if (wanted.size > 0 && !wanted.has(id) && !wanted.has(name)) continue
    const targets = asRecord(record.targets)
    const production = asRecord(targets.production)
    const alias = Array.isArray(production.alias) ? production.alias.find((item) => typeof item === 'string') : null
    projects.push({
      id,
      name,
      framework: stringField(record, 'framework'),
      productionUrl: typeof alias === 'string' ? `https://${alias}` : null,
      latestDeployment: null,
      latestProductionDeployment: null,
      updatedAt: millisToIso(record.updatedAt),
    })
  }
  return projects
}

export async function fetchVercelDeployments(token: string, teamId: string | undefined, projectIds: string[], limit: number): Promise<Deployment[]> {
  const params: Record<string, string> = { limit: String(Math.min(limit, 20)) }
  if (projectIds.length === 1) params.projectId = projectIds[0]!
  const payload = await vercelGet(token, '/v6/deployments', teamId, params)
  const rows = asArray(payload.deployments)
  const wanted = new Set(projectIds)
  return rows
    .map((row) => toDeployment(asRecord(row)))
    .filter((deployment): deployment is Deployment => deployment !== null)
    .filter((deployment) => wanted.size === 0 || wanted.has(deployment.projectId) || wanted.has(deployment.projectName))
    .slice(0, limit)
}

async function vercelGet(token: string, path: string, teamId: string | undefined, params: Record<string, string>): Promise<Record<string, unknown>> {
  vercelReadPath(path)
  const url = new URL(path, HOST)
  if (teamId) url.searchParams.set('teamId', teamId)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new AtlasError('PROVIDER_ERROR', `Vercel returned ${response.status} for ${path}.`)
  }
  const body = (await response.json()) as unknown
  return asRecord(body)
}

function toDeployment(record: Record<string, unknown>): Deployment | null {
  const id = stringField(record, 'uid') ?? stringField(record, 'id')
  const name = stringField(record, 'name')
  if (!id || !name) return null
  const meta = asRecord(record.meta)
  const creator = asRecord(record.creator)
  const state = mapState(stringField(record, 'readyState') ?? stringField(record, 'state'))
  const created = millisToIso(record.createdAt ?? record.created)
  if (!created) return null
  const ready = millisToIso(record.ready)
  const createdMs = Date.parse(created)
  const readyMs = ready ? Date.parse(ready) : null
  return {
    id,
    projectId: stringField(record, 'projectId') ?? name,
    projectName: name,
    url: stringField(record, 'url') ? `https://${stringField(record, 'url')}` : null,
    state,
    target: mapTarget(stringField(record, 'target')),
    branch: stringField(meta, 'githubCommitRef') ?? stringField(meta, 'gitBranch'),
    commitMessage: stringField(meta, 'githubCommitMessage'),
    commitSha: stringField(meta, 'githubCommitSha'),
    creator: stringField(creator, 'username'),
    createdAt: created,
    readyAt: ready,
    buildDurationMs: readyMs && createdMs ? Math.max(0, readyMs - createdMs) : null,
    errorMessage: stringField(record, 'errorMessage'),
    inspectorUrl: stringField(record, 'inspectorUrl'),
  }
}

function mapState(value: string | null): Deployment['state'] {
  switch ((value ?? '').toUpperCase()) {
    case 'READY':
      return 'ready'
    case 'ERROR':
      return 'error'
    case 'CANCELED':
    case 'CANCELLED':
      return 'canceled'
    case 'QUEUED':
      return 'queued'
    case 'BUILDING':
    case 'INITIALIZING':
      return 'building'
    default:
      return 'unknown'
  }
}

function mapTarget(value: string | null): Deployment['target'] {
  if (value === 'production') return 'production'
  if (value === 'preview' || value === 'staging') return 'preview'
  return 'unknown'
}

function millisToIso(value: unknown): string | null {
  const millis = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null
  if (!millis) return null
  const date = new Date(millis)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : null
}
