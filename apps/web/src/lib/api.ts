export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

let csrf: string | null = null

export function setCsrfToken(token: string | null) {
  csrf = token
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('content-type', 'application/json')
  const method = (init.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && csrf) headers.set('x-csrf-token', csrf)
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    throw new ApiError(response.status, body?.error?.code ?? 'INTERNAL', body?.error?.message ?? 'Request failed')
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
