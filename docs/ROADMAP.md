# Atlas OS — Implementation Checklist

Each phase ends with: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Errors are fixed
before the next phase starts.

**Milestone 1** — Atlas runs on the Windows PC with a polished, customizable dashboard populated
with realistic mock data; widgets can be moved/resized and the layout survives reloads; Atlas chat
answers "What's on my agenda?", "What happened between 3 and 5?" and "How is Struct doing?"
through typed tools; Timeline, Conversations, Integrations and System health are viewable.

## Phase 1 — Foundation

- [ ] pnpm workspace, shared TypeScript/ESLint/Prettier config, root scripts
- [ ] `@atlas/shared`: AtlasEvent, tasks, widgets, cameras, devices, presence, integrations, API DTOs, time utilities
- [ ] `@atlas/config`: Zod environment validation (reports missing variable names only), secret registry
- [ ] `@atlas/database`: Drizzle schema for all planned tables, pgvector migration, client, repositories
- [ ] Embedded development database (PGlite socket server) for machines without Docker
- [ ] Authentication: first-run account creation, argon2id, DB sessions, secure cookies, CSRF, rate limits
- [ ] Event system: catalog, ingestion with dedupe, bus, cross-process NOTIFY, timeline queries
- [ ] Mock providers for every integration + realistic seeded mock data (relative to "today")
- [ ] Web shell: design tokens, sidebar, mobile navigation, routing, auth/onboarding screens
- [ ] Customizable dashboard: WidgetDefinition registry, GridStack grid, edit mode, persist per breakpoint
- [ ] Timeline page (filters, grouped/chronological, realtime)
- [ ] Tasks (CRUD, suggestions requiring approval)
- [ ] Basic settings (appearance/accent, developer mock toggle, privacy)

## Phase 2 — Atlas AI

- [ ] Tool registry with Zod input/output schemas and risk metadata
- [ ] Permission engine (levels 0–4, confirmation policies, level 4 disabled)
- [ ] Tool audit log (redacted parameters, status, duration)
- [ ] Model router (fast / reasoning), models from environment
- [ ] Streaming chat (AI SDK v7) with persisted threads, stop, retry, tool cards, sources
- [ ] `timeline.whatHappened` deterministic range resolution and ranking
- [ ] Confirmation flow for LEVEL_2/LEVEL_3 tools

## Phase 3 — Google

- [ ] OAuth 2 (authorization code + PKCE, state protection), encrypted refresh tokens
- [ ] Calendar read/create/update; Gmail read-only (least-privilege scopes)
- [ ] Integrations screen: connect, disconnect, status, last sync, scopes, last error

## Phase 4 — Home Assistant

- [ ] REST client + WebSocket subscription (server-side token only)
- [ ] Entity → Atlas device translation, room state
- [ ] Provider-neutral cameras with capability detection; snapshot proxy
- [ ] Blink / Vivint discovered through Home Assistant

## Phase 5 — Vercel, Stripe, Struct

- [ ] Vercel read-only client (projects, deployments, status) → AtlasEvents
- [ ] Stripe read-only client (restricted key), summary/MRR, webhooks with signature verification + idempotency
- [ ] Struct project dashboard (generic project model)

## Phase 6 — Audio and conversations

- [ ] Privacy states, global privacy switch, visible mic state
- [ ] Browser recording + secure upload, file upload provider
- [ ] Transcription / diarization / summary provider abstractions (AI Gateway transcription)
- [ ] Conversation search, daily summaries, task suggestions
- [ ] Retention policies for raw audio, transcripts, summaries

## Phase 7 — Presence and MQTT

- [ ] PresenceObservation / PresenceSource / PresenceEstimate, fusion skeleton
- [ ] MQTT provider (optional), topic mapping for ESP32 / ring receivers
- [ ] Automation rule model + evaluator routed through the permission engine

## Phase 8 — Production

- [ ] Dockerfiles (api+web, worker), docker-compose with postgres/pgvector, optional mosquitto + caddy
- [ ] Localhost-only bindings for PostgreSQL and MQTT
- [ ] Backup / restore scripts and documentation
- [ ] DEVELOPMENT, PRODUCTION, INTEGRATIONS, SECURITY docs
