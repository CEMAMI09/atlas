import { z } from 'zod'

/** ISO-8601 timestamp with an explicit offset (the API always emits UTC `Z`). */
export const IsoDateTime = z.iso.datetime({ offset: true })
export type IsoDateTime = z.infer<typeof IsoDateTime>

export const Uuid = z.uuid()

/** http(s) URLs only — never javascript:, data:, file: or other schemes. */
export const HttpUrl = z.url({ protocol: /^https?$/ })

export const JsonRecord = z.record(z.string(), z.unknown())
export type JsonRecord = z.infer<typeof JsonRecord>

export const SourceLink = z.object({
  label: z.string().min(1).max(120),
  url: HttpUrl,
})
export type SourceLink = z.infer<typeof SourceLink>

export const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
})
export type Pagination = z.infer<typeof Pagination>

export const DataMode = z.enum(['live', 'mock'])
export type DataMode = z.infer<typeof DataMode>

/**
 * Provenance attached to every piece of integration-derived data so the UI and Atlas can say where
 * a value came from and whether it is mock data.
 */
export const DataSource = z.object({
  provider: z.string(),
  mode: DataMode,
  fetchedAt: IsoDateTime,
})
export type DataSource = z.infer<typeof DataSource>
