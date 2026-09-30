import { AtlasError, type CalendarEvent, type EmailMessage, type EmailSummary } from '@atlas/shared'

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
export const GOOGLE_SCOPES = [CALENDAR_SCOPE, GMAIL_SCOPE]

export function googleAuthUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  return url.toString()
}

export async function exchangeGoogleCode(input: {
  clientId: string
  clientSecret: string
  redirectUri: string
  code: string
  codeVerifier: string
}): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string; scope: string }> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
    code: input.code,
    code_verifier: input.codeVerifier,
  })
  return tokenRequest(body)
}

export async function refreshGoogleAccessToken(input: { clientId: string; clientSecret: string; refreshToken: string }): Promise<{ accessToken: string; expiresAt: string; scope: string }> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
  })
  const token = await tokenRequest(body)
  return { accessToken: token.accessToken, expiresAt: token.expiresAt, scope: token.scope }
}

export async function googleAccountEmail(accessToken: string): Promise<string | null> {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) return null
  const body = (await response.json()) as { emailAddress?: string }
  return body.emailAddress ?? null
}

export async function fetchGoogleEvents(accessToken: string, start: Date, end: Date, limit: number): Promise<CalendarEvent[]> {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', start.toISOString())
  url.searchParams.set('timeMax', end.toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', String(Math.min(limit, 20)))
  const body = await googleGet(accessToken, url)
  const items = Array.isArray(body.items) ? body.items : []
  return items.flatMap((item) => {
    const event = toCalendarEvent(asRecord(item))
    return event ? [event] : []
  })
}

export async function createGoogleEvent(accessToken: string, input: { title: string; start: string; end: string; description?: string; location?: string }): Promise<CalendarEvent> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: input.title,
      description: input.description,
      location: input.location,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new AtlasError('PROVIDER_ERROR', `Google Calendar create returned ${response.status}.`)
  const event = toCalendarEvent(asRecord(await response.json()))
  if (!event) throw new AtlasError('INVALID_PROVIDER_RESPONSE', 'Google Calendar did not confirm the new event.')
  return event
}

export async function updateGoogleEvent(accessToken: string, eventId: string, changes: Record<string, string | undefined>): Promise<CalendarEvent> {
  if (!/^[\w@.-]+$/.test(eventId)) throw new AtlasError('VALIDATION_FAILED', 'Calendar event id is not valid.')
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(changes.title ? { summary: changes.title } : {}),
      ...(changes.description ? { description: changes.description } : {}),
      ...(changes.location ? { location: changes.location } : {}),
      ...(changes.start ? { start: { dateTime: changes.start } } : {}),
      ...(changes.end ? { end: { dateTime: changes.end } } : {}),
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new AtlasError('PROVIDER_ERROR', `Google Calendar update returned ${response.status}.`)
  const event = toCalendarEvent(asRecord(await response.json()))
  if (!event) throw new AtlasError('INVALID_PROVIDER_RESPONSE', 'Google Calendar did not confirm the update.')
  return event
}

export async function fetchImportantMail(accessToken: string, limit: number): Promise<EmailSummary[]> {
  const messages = await searchGmail(accessToken, 'is:important newer_than:7d', limit)
  return messages.map(toSummary)
}

export async function searchGmailMessages(accessToken: string, query: string, limit: number): Promise<EmailSummary[]> {
  const safe = query.replace(/[^\w\s:@._+-]/g, ' ').trim()
  const messages = await searchGmail(accessToken, safe || 'newer_than:7d', limit)
  return messages.map(toSummary)
}

export async function fetchGmailMessage(accessToken: string, id: string): Promise<EmailMessage> {
  if (!/^[\w]+$/.test(id)) throw new AtlasError('VALIDATION_FAILED', 'Message id is not valid.')
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`)
  url.searchParams.set('format', 'full')
  const body = await googleGet(accessToken, url)
  const message = toEmail(asRecord(body))
  if (!message) throw new AtlasError('INVALID_PROVIDER_RESPONSE', 'Gmail did not return that message.')
  return message
}

async function searchGmail(accessToken: string, query: string, limit: number): Promise<EmailMessage[]> {
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  listUrl.searchParams.set('q', query)
  listUrl.searchParams.set('maxResults', String(Math.min(limit, 15)))
  const list = await googleGet(accessToken, listUrl)
  const ids = (Array.isArray(list.messages) ? list.messages : [])
    .map((row) => stringField(asRecord(row), 'id'))
    .filter((id): id is string => Boolean(id))
  const messages: EmailMessage[] = []
  for (const id of ids) {
    const message = await fetchGmailMessage(accessToken, id).catch(() => null)
    if (message) messages.push(message)
  }
  return messages
}

async function tokenRequest(body: URLSearchParams): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string; scope: string }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new AtlasError('AUTH_FAILED', `Google token exchange returned ${response.status}.`)
  const json = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string }
  if (!json.access_token) throw new AtlasError('AUTH_FAILED', 'Google did not return an access token.')
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
    scope: json.scope ?? '',
  }
}

async function googleGet(accessToken: string, url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(12_000) })
  if (response.status === 401) throw new AtlasError('AUTH_FAILED', 'Google rejected the access token. Reconnect Google in Integrations.')
  if (!response.ok) throw new AtlasError('PROVIDER_ERROR', `Google returned ${response.status}.`)
  return asRecord(await response.json())
}

function toCalendarEvent(record: Record<string, unknown>): CalendarEvent | null {
  const id = stringField(record, 'id')
  const title = stringField(record, 'summary')
  if (!id || !title) return null
  const start = asRecord(record.start)
  const end = asRecord(record.end)
  const startTime = stringField(start, 'dateTime') ?? (stringField(start, 'date') ? `${stringField(start, 'date')}T00:00:00.000Z` : null)
  const endTime = stringField(end, 'dateTime') ?? (stringField(end, 'date') ? `${stringField(end, 'date')}T00:00:00.000Z` : null)
  if (!startTime || !endTime) return null
  const status = stringField(record, 'status')
  return {
    id,
    calendarId: 'primary',
    calendarName: 'Primary',
    title,
    description: stringField(record, 'description'),
    location: stringField(record, 'location'),
    start: new Date(startTime).toISOString(),
    end: new Date(endTime).toISOString(),
    allDay: Boolean(stringField(start, 'date') && !stringField(start, 'dateTime')),
    startDate: stringField(start, 'date'),
    endDate: stringField(end, 'date'),
    status: status === 'tentative' || status === 'cancelled' ? status : 'confirmed',
    attendees: [],
    meetingUrl: stringField(record, 'hangoutLink'),
    htmlLink: stringField(record, 'htmlLink'),
    organizer: stringField(asRecord(record.organizer), 'email'),
    updatedAt: stringField(record, 'updated'),
  }
}

function toEmail(record: Record<string, unknown>): EmailMessage | null {
  const id = stringField(record, 'id')
  const threadId = stringField(record, 'threadId')
  if (!id || !threadId) return null
  const payload = asRecord(record.payload)
  const headers = Array.isArray(payload.headers) ? payload.headers : []
  const header = (name: string) => {
    const found = headers.map(asRecord).find((item) => stringField(item, 'name')?.toLowerCase() === name)
    return found ? stringField(found, 'value') : null
  }
  const from = parseAddress(header('from') ?? 'unknown')
  const labels = Array.isArray(record.labelIds) ? record.labelIds.filter((item): item is string => typeof item === 'string') : []
  const internal = typeof record.internalDate === 'string' ? Number(record.internalDate) : null
  const receivedAt = internal ? new Date(internal).toISOString() : new Date().toISOString()
  const bodyText = extractText(payload).slice(0, 4000)
  return {
    id,
    threadId,
    from,
    to: [],
    cc: [],
    subject: header('subject') ?? '(no subject)',
    snippet: stringField(record, 'snippet') ?? '',
    bodyText,
    bodyTruncated: bodyText.length >= 4000,
    receivedAt,
    unread: labels.includes('UNREAD'),
    important: labels.includes('IMPORTANT'),
    labels,
    hasAttachments: false,
    importanceReason: labels.includes('IMPORTANT') ? 'Marked important in Gmail.' : null,
    webLink: `https://mail.google.com/mail/u/0/#inbox/${id}`,
  }
}

function toSummary(message: EmailMessage): EmailSummary {
  const { bodyText: _body, bodyTruncated: _truncated, to: _to, cc: _cc, webLink: _link, ...summary } = message
  return summary
}

function extractText(payload: Record<string, unknown>): string {
  const mime = stringField(payload, 'mimeType')
  const body = asRecord(payload.body)
  const data = stringField(body, 'data')
  if (mime === 'text/plain' && data) return decodeBase64Url(data)
  const parts = Array.isArray(payload.parts) ? payload.parts : []
  for (const part of parts) {
    const text = extractText(asRecord(part))
    if (text) return text
  }
  return ''
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function parseAddress(value: string): { name: string | null; email: string } {
  const match = /^(.*)<([^>]+)>$/.exec(value.trim())
  if (!match) return { name: null, email: value }
  return { name: match[1]?.replace(/"/g, '').trim() || null, email: match[2]?.trim() || value }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : null
}
