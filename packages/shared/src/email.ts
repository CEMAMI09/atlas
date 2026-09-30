import { z } from 'zod'
import { IsoDateTime } from './common'

export const EmailAddress = z.object({
  name: z.string().nullable(),
  email: z.string(),
})
export type EmailAddress = z.infer<typeof EmailAddress>

/** A message summary — never includes the full body. */
export const EmailSummary = z.object({
  id: z.string(),
  threadId: z.string(),
  from: EmailAddress,
  subject: z.string(),
  snippet: z.string(),
  receivedAt: IsoDateTime,
  unread: z.boolean(),
  important: z.boolean(),
  labels: z.array(z.string()),
  hasAttachments: z.boolean(),
  importanceReason: z.string().nullable(),
})
export type EmailSummary = z.infer<typeof EmailSummary>

export const EmailMessage = EmailSummary.extend({
  to: z.array(EmailAddress),
  cc: z.array(EmailAddress),
  /** Plain-text body, truncated. HTML is never passed through. */
  bodyText: z.string(),
  bodyTruncated: z.boolean(),
  webLink: z.string().nullable(),
})
export type EmailMessage = z.infer<typeof EmailMessage>

export const EmailSearchInput = z.object({
  query: z.string().trim().max(300).default(''),
  from: z.string().trim().max(200).optional(),
  after: IsoDateTime.optional(),
  before: IsoDateTime.optional(),
  unreadOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(25).default(10),
})
export type EmailSearchInput = z.input<typeof EmailSearchInput>
