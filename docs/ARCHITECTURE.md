# Atlas OS — Architecture

Atlas OS is a local-first personal intelligence and smart-room platform. **Atlas** is its
conversational assistant. Atlas Core runs entirely on hardware you own (a Windows desktop
during development, an old Linux Chromebook in production). Nothing in the runtime depends
on Vercel hosting, Cursor, or MCP.

## Core principles

1. **The LLM never touches systems directly.** Every capability is a typed Atlas tool with a
   validated input schema, a validated output schema, a risk level and a confirmation policy.

   ```
   User → Atlas assistant → typed Atlas tool → permission engine → service → integration → external system
   ```

2. **Targeted retrieval, not context dumps.** Tools return the smallest structured result that
   answers the question (bounded result counts, snippets instead of bodies, summaries instead of
   transcripts). Whole mailboxes, databases or event histories are never placed into model context.
3. **Honesty over completeness.** If an integration is disconnected, unsupported or failing, Atlas
   says so. Provider failures are typed errors (`AtlasIntegrationError`) that both the UI and the
   model understand. Nothing is reported as successful unless the provider confirmed it.
4. **Mock mode is a first-class mode.** Every integration is `CONNECTED`, `DISCONNECTED`, `ERROR`
   or `MOCK`. Mock results are always labelled as mock data in tool output and in the UI.
5. **Secrets stay server-side.** The browser bundle never receives server secrets, OAuth tokens or
   integration credentials. Only `VITE_`-prefixed values can reach browser code, and none are secret.
6. **Provider-neutral core.** Provider payloads are translated at the integration boundary into
   Atlas types (`AtlasEvent`, `Camera`, `Device`, `CalendarEvent`, …). The UI and Atlas Core never
   depend on provider-specific formats.

## Repository layout

```
atlas/
├─ apps/
│  ├─ web/                 Vue 3 + Vite PWA (primary client)
│  ├─ api/                 Fastify HTTP + WebSocket server (Atlas Core API)
│  └─ worker/              Background jobs: sync, simulators, retention, pipelines
├─ packages/
│  ├─ shared/              Browser-safe Zod schemas, types, constants, time utilities
│  ├─ config/              Server-only environment schema, loader, secret registry
│  ├─ database/            Drizzle schema, migrations, client, repositories
│  ├─ permissions/         Risk levels, permission engine, confirmation policy, redaction
│  ├─ events/              AtlasEvent catalog, event bus, timeline queries, ranking
│  ├─ integrations/        Integration contract, typed errors, live + mock providers
│  ├─ ai/                  Model router, Atlas tool registry/executor, chat orchestration
│  └─ core/                Atlas Core runtime: wires services, integrations, AI, audit
├─ infrastructure/
│  ├─ docker-compose.yml   Production stack (api+web, worker, postgres, optional mosquitto/caddy)
│  ├─ docker-compose.dev.yml  Development database for Docker Desktop on Windows
│  ├─ docker/              Dockerfiles
│  ├─ caddy/               Reverse proxy configuration (HTTPS)
│  ├─ mosquitto/           MQTT broker configuration
│  └─ scripts/             Backup / restore helpers
├─ docs/                   Architecture, database, development, production, integrations, security
├─ scripts/                Repository tooling (bundle secret scan, embedded dev database)
├─ .env.example            Variable names with safe placeholder values (committed)
└─ .env.local              Real development credentials (gitignored, never committed)
```

### Package dependency rules

```
apps/web      → @atlas/shared                      (never config/database/integrations/ai/core)
apps/api      → @atlas/core (+ shared, config)
apps/worker   → @atlas/core (+ shared, config)
core          → ai, events, integrations, permissions, database, config, shared
ai            → permissions, shared                (services are injected, see "Tool services")
events        → database, shared
integrations  → permissions, shared                (no database access; stores are injected)
permissions   → shared
database      → shared
config        → shared
shared        → zod only (must stay browser-safe)
```

The dependency direction is enforced by package manifests: a package can only import what it
declares. `@atlas/shared` is the only workspace package the web app may depend on.

## Runtime topology

```
┌────────────── Browser / PWA (Vue) ──────────────┐
│ REST (fetch, cookie session + CSRF header)       │
│ WebSocket /ws (realtime events, device state)    │
│ Chat stream (AI SDK UI message stream)           │
└──────────────────────┬───────────────────────────┘
                       │ same origin (Vite proxy in dev, Caddy/API in prod)
┌──────────────────────▼───────────────────────────┐
│ apps/api (Fastify)                                │
│  auth · dashboard · timeline · tasks · chat ·     │
│  integrations · OAuth callbacks · webhooks · ws   │
│            │                                      │
│        @atlas/core runtime                        │
└────────────┬──────────────────────┬───────────────┘
             │ SQL                  │ LISTEN/NOTIFY (atlas_realtime)
┌────────────▼──────────┐   ┌──────▼────────────────┐
│ PostgreSQL + pgvector │◄──┤ apps/worker            │
└───────────────────────┘   │ sync · simulators ·    │
                            │ retention · pipelines  │
                            └──────┬─────────────────┘
                                   │
         Home Assistant (REST+WS) · Google · Vercel · Stripe · MQTT · AI Gateway
```

- **API** owns user-facing requests, sessions, chat streaming and WebSocket fan-out.
- **Worker** owns long-running connections (Home Assistant WebSocket, MQTT), periodic syncs,
  the mock-data simulator, retention enforcement and audio/conversation processing.
- Both processes build the same `AtlasRuntime` from `@atlas/core`; they differ only in which jobs
  and servers they start.
- Cross-process realtime uses PostgreSQL `LISTEN/NOTIFY` on the `atlas_realtime` channel, so no
  extra broker (Redis) is required on the Chromebook.

## Request flows

### Atlas chat with tool calling

1. The client posts **only the new user message** and a thread id to `POST /api/chat`.
   The server loads prior history from PostgreSQL, so clients cannot inject fabricated tool results.
2. The **model router** chooses the `fast` or `reasoning` tier (heuristics + explicit user choice).
   Model identifiers come from `ATLAS_AI_FAST_MODEL` / `ATLAS_AI_REASONING_MODEL`, never from code.
3. `streamText` (AI SDK) runs with the Atlas tool set. Each tool call goes through the
   **tool executor**:
   - Zod validation of the input (model output is untrusted input).
   - Permission engine decision: enabled? permitted? risk level? confirmation needed?
   - Audit record written for every invocation (including denials).
   - Service call → integration → provider.
   - Zod validation of the output, compaction (bounded lists/strings), source metadata attached
     (`provider`, `mode: live|mock`, `fetchedAt`).
4. The UI message stream is piped to the client. Tool parts render as expandable
   "Atlas tools" cards; text parts are labelled as model output. When no tool was used, the
   answer is marked as model reasoning.
5. On finish, the assistant message (including tool parts) is persisted to `chat_messages`.

### Confirmation for risky actions

```
model calls calendar.createEvent
  → executor: risk LEVEL_2, policy "confirm"
  → pending tool_confirmation (params hash, user, expiry) + audit(pending_confirmation)
  → tool output { status: "confirmation_required", confirmationId, preview }
  → UI shows an approval card → POST /api/confirmations/:id/approve
  → executor re-validates, executes once, audits(confirmed → success|error)
  → result stored on the thread; Atlas reports only the provider-confirmed outcome
```

LEVEL_3 requires an explicit typed confirmation (designed to accept biometric / physical
confirmation later). LEVEL_4 is disabled globally.

### "What happened?" queries

A first-class tool, `timeline.whatHappened`, performs deterministic retrieval:

1. Resolve the requested **local** time range in the user's time zone
   (`resolveLocalRange` in `@atlas/shared`, DST-safe) or a preset (`today`, `while_away`, …).
2. Query Atlas events in range.
3. Retrieve conversation summaries overlapping the range.
4. Retrieve security / camera events.
5. Retrieve external service events (deployments, payments, email, calendar).
6. Rank (severity, category weight, novelty, clustering of correlated events).
7. Return a compact structured digest with timestamps and source references.
8. The model writes the human summary and cites timestamps; the UI links each cited event.

## Event system

`AtlasEvent` (in `@atlas/shared`) is the universal timeline record:

```ts
{
  id, timestamp, source, category, type, title, summary, severity,
  actor, location, entityId, metadata, correlationId
}
```

- The **event catalog** (`@atlas/events`) lists every known type (`vercel.deployment.failed`,
  `room.presence.enter`, `camera.motion.detected`, …) with its category and default severity.
- Integrations translate provider payloads into `AtlasEvent` drafts. Only the integration layer
  knows provider formats.
- `EventService.ingest()` validates, de-duplicates (`dedupeKey`), stores and publishes events.
  Idempotency is enforced by a unique index on `dedupe_key`.
- `EventBus` publishes in-process and across processes (`NOTIFY atlas_realtime`). The API relays
  to WebSocket subscribers.
- Timeline queries run in PostgreSQL with full-text search (`tsvector`) and composable filters.

## Integrations

Every integration implements the common contract:

```ts
interface AtlasIntegration {
  id; displayName; mode;               // live | mock | disabled
  connect(); disconnect();
  healthCheck(); sync(ctx);
  getStatus();                         // CONNECTED | DISCONNECTED | ERROR | MOCK (+ last sync/error)
  getCapabilities();
}
```

plus domain interfaces (`CalendarProvider`, `EmailProvider`, `HomeProvider`, `CameraProvider`,
`SecurityProvider`, `DeploymentProvider`, `PaymentsProvider`, `TranscriptionProvider`,
`PresenceSource`, `WeatherProvider`, …). Each domain has a mock implementation and, where
available, a live one. The **integration registry** resolves the effective mode per integration:

| Setting                             | Effective state                    |
| ----------------------------------- | ---------------------------------- |
| Integration disabled                | `DISCONNECTED`                     |
| Mock forced, or global mock toggle  | `MOCK`                             |
| Credentials present, health OK      | `CONNECTED`                        |
| Credentials present, health failing | `ERROR` (typed, with last error)   |
| No credentials                      | `DISCONNECTED` (no scary errors)   |

Read-only integrations (Gmail, Vercel, Stripe) are read-only **by construction**: their HTTP
clients only issue `GET` requests to an explicit path allowlist, and no write methods exist.
Tests assert that prohibited endpoints cannot be reached.

Home Assistant is the smart-home compatibility layer. Blink and Vivint are discovered as Home
Assistant entities — Atlas never stores Blink or Vivint credentials. Cameras are exposed through
a provider-neutral `Camera` model with explicit capabilities, so a Blink camera without live video
shows its latest snapshot instead of a broken player.

## Permissions and risk

| Level     | Meaning                         | Default confirmation         | Examples                                  |
| --------- | ------------------------------- | ---------------------------- | ----------------------------------------- |
| `LEVEL_0` | Read-only, no side effects      | none                         | `calendar.getEvents`, `stripe.getSummary` |
| `LEVEL_1` | Low-risk, reversible            | none                         | `tasks.create`, `lights.set`              |
| `LEVEL_2` | Meaningful modification         | confirm                      | `calendar.createEvent`, `security.arm`    |
| `LEVEL_3` | Security-sensitive              | explicit typed confirmation  | `security.disarm`, `door.unlock`          |
| `LEVEL_4` | Financial / destructive         | disabled globally            | `stripe.refund` (not implemented)         |

Every tool declares `riskLevel`, `requiredPermissions`, `sideEffect` and `confirmationPolicy`.
The engine is pure and unit-tested; the audit sink persists to `tool_audit_log` with secrets
removed from parameters. Automations use the same executor and cannot run LEVEL_3+ actions.

## AI

- **AI SDK v7** (`ai`), models addressed through **Vercel AI Gateway** (`AI_GATEWAY_API_KEY`).
- **Model router** (`ModelRouter` interface): `fast` for routine lookups and simple tool use,
  `reasoning` for multi-source analysis, long summaries, planning and ambiguous multi-step work.
  Replaceable without touching tools or chat code.
- Tool names use dotted Atlas ids (`calendar.getEvents`); they are mapped to provider-safe wire
  names (`calendar_getEvents`) at the AI SDK boundary.
- If `AI_GATEWAY_API_KEY` is missing, chat reports that Atlas AI is not configured; all non-AI
  features keep working.

## Realtime

One authenticated WebSocket per client (`/ws`). Server messages are typed
(`@atlas/shared` `RealtimeMessage`): `event.created`, `device.updated`, `integration.status`,
`task.updated`, `camera.motion`, `system.metrics`, `privacy.changed`, `ai.status`. Clients subscribe
to topics; components never poll each other every second.

## Audio and conversations

```
audio → voice activity segmentation → transcription → diarization → conversation
      → structured summary → topics → decisions → possible tasks (suggestions)
      → embeddings → Atlas timeline
```

Interfaces: `AudioProvider` (Mock, Browser, FileUpload; later RoomMicrophone),
`TranscriptionProvider`, `DiarizationProvider`, `SummaryProvider`. Extracted tasks are stored as
`task_suggestions` and require approval. Microphone state (`MIC_DISABLED`,
`TRANSCRIPTION_ENABLED`, `ATLAS_VOICE_ACTIVE`, `PRIVACY_MODE`) is always visible; a global
software privacy switch exists and a physical kill switch can override it later. There is no
covert recording path.

## Presence

`PresenceObservation` (raw evidence: ring RSSI, door contact, mmWave, phone) →
`PresenceEstimate` (`personId`, `roomId`, `state: PRESENT|ABSENT|UNCERTAIN`, `confidence`,
`evidence`). Estimation fuses multiple observations with decay instead of trusting one RSSI value.
BLE scanning is not implemented yet; the MQTT topic layout (`atlas/rooms/<room>/…`) is prepared.

## Frontend

Vue 3 + TypeScript + Vite PWA, Vue Router, Pinia, GridStack.js for the dashboard grid, uPlot for
realtime charts, Lucide line icons, markdown-it + DOMPurify for sanitized markdown. Custom design
tokens (CSS variables) — near-black surfaces, subtle borders, restrained purple accent with
adjustable intensity. Dashboard widgets come from a `WidgetDefinition` registry; widget
instances (type, position, size, settings) are persisted per breakpoint in PostgreSQL.

## Technology choices

| Concern            | Choice                                                    |
| ------------------ | --------------------------------------------------------- |
| Runtime            | Node.js 24 LTS                                            |
| Package manager    | pnpm 12 workspaces                                        |
| Language           | TypeScript 6.0 (TS 7 is not yet supported by typescript-eslint) |
| HTTP / WebSocket   | Fastify 5, @fastify/websocket                             |
| Database           | PostgreSQL 18 + pgvector 0.8 (Docker: `pgvector/pgvector`) |
| ORM / migrations   | Drizzle ORM + drizzle-kit, postgres.js driver             |
| Validation         | Zod 4                                                     |
| AI                 | AI SDK 7 + Vercel AI Gateway                              |
| Password hashing   | Argon2id (`@node-rs/argon2`)                              |
| Logging            | pino (structured, redacted)                               |
| Frontend           | Vue 3.5, Vite 8, Vue Router 5, Pinia 4, GridStack 14, uPlot |
| Tests              | Vitest 5, @vue/test-utils, happy-dom, PGlite for DB tests |
| Containers         | Docker Compose, Caddy for HTTPS                           |

See [DATABASE.md](DATABASE.md) for the schema, [ROADMAP.md](ROADMAP.md) for the phased checklist,
and [SECURITY.md](SECURITY.md) for the threat model.
