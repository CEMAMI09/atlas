# Atlas OS — Database

PostgreSQL 18 with the `vector` extension (pgvector). Schema and migrations are managed with
Drizzle ORM / drizzle-kit in `packages/database`. The connection string always comes from
`DATABASE_URL` — `localhost` during Windows development, the Compose service name (`postgres`)
in production. No hostname is hard-coded.

## Conventions

- Primary keys are UUIDs (`gen_random_uuid()` default).
- Every timestamp is `timestamp with time zone`, stored in UTC. Conversion to the user's time zone
  happens at the edges (API formatting helpers, UI).
- JSON payloads use `jsonb` and are validated with Zod before insert.
- Full-text search uses generated `tsvector` columns with GIN indexes.
- All queries are parameterised (Drizzle query builder / `sql` template tags). No string-built SQL.
- Sensitive credentials are encrypted at rest (AES-256-GCM with `ATLAS_ENCRYPTION_KEY`), in columns
  suffixed `_enc`. Session tokens are stored only as SHA-256 hashes.
- `is_mock` marks rows produced by mock providers so they can be filtered or purged.

## Tables

### Identity and sessions

| Table                  | Purpose / key columns |
| ---------------------- | --------------------- |
| `users`                | `email` (unique, lower-case), `display_name`, `password_hash` (argon2id, nullable for future passkey-only accounts), `role` (`owner`/`member`), `timezone`, `preferences` jsonb (appearance, accent intensity), `last_login_at` |
| `sessions`             | `user_id`, `token_hash` (unique), `csrf_secret_enc`, `client_type` (`web`/`native`), `user_agent`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at` |
| `webauthn_credentials` | Reserved for passkeys: `user_id`, `credential_id`, `public_key`, `sign_count`, `transports`, `last_used_at` |
| `people`               | Known people for actors / speakers / presence: `name`, `kind` (`owner`/`household`/`guest`/`unknown`), optional `user_id` |

### Dashboard

| Table               | Purpose / key columns |
| ------------------- | --------------------- |
| `dashboard_layouts` | `user_id`, `name` (`overview`), `breakpoint` (`desktop`/`tablet`/`mobile`), `columns`, `version` (optimistic concurrency). Unique `(user_id, name, breakpoint)` |
| `dashboard_widgets` | `layout_id`, `type` (widget definition id, e.g. `calendar.agenda`), `x`, `y`, `w`, `h`, `settings` jsonb, `sort_order` |

### Integrations

| Table                     | Purpose / key columns |
| ------------------------- | --------------------- |
| `integration_connections` | One row per integration: `provider` (unique), `mode_override` (`auto`/`mock`/`live`/`disabled`), `status`, `config` jsonb (non-secret), `granted_scopes`, `account_label`, `last_sync_at`, `last_success_at`, `last_error`, `last_error_at` |
| `oauth_tokens`            | `provider`, `user_id`, `account_email`, `access_token_enc`, `refresh_token_enc`, `scope`, `expires_at` |
| `oauth_states`            | CSRF/state protection for OAuth: `provider`, `state_hash`, `code_verifier_enc` (PKCE), `user_id`, `session_id`, `expires_at`, `consumed_at` |
| `integration_sync_state`  | Incremental sync cursors: `provider`, `key`, `cursor`, `updated_at` (e.g. Gmail history id) |
| `webhook_events`          | Idempotent webhook ingestion: unique `(provider, external_id)`, `type`, `livemode`, `status`, `received_at`, `processed_at`, `error` |

### Events and timeline

| Table           | Purpose / key columns |
| --------------- | --------------------- |
| `event_sources` | Registry of event sources: `key` (`vercel`, `stripe`, `home_assistant`, `google.calendar`, `mock`, …), `name`, `kind` |
| `events`        | Universal `AtlasEvent` store: `occurred_at`, `ingested_at`, `source`, `category`, `type`, `title`, `summary`, `severity`, `actor` jsonb, `location`, `room_id`, `entity_id`, `metadata` jsonb, `correlation_id`, `dedupe_key` (unique), `is_mock`, `search` tsvector |
| `camera_events` | Camera-specific detail: `device_id`, `kind` (`motion`/`clip`/`snapshot`/`person`/`doorbell`), `occurred_at`, `clip_ref`, `snapshot_ref`, `event_id` |
| `security_events` | Security-specific detail: `kind` (`armed`/`disarmed`/`triggered`/`door`…), `mode`, `occurred_at`, `actor`, `event_id` |

Indexes: `events(occurred_at desc)`, `events(category, occurred_at)`, `events(source, occurred_at)`,
GIN on `events.search`, unique `events.dedupe_key`.

### Tasks

| Table              | Purpose / key columns |
| ------------------ | --------------------- |
| `tasks`            | `user_id`, `title`, `description`, `status` (`todo`/`in_progress`/`done`/`canceled`), `priority` (`low`/`normal`/`high`/`urgent`), `due_at`, `source` (`manual`/`atlas`/`conversation`/`email`/`calendar`), `source_ref`, `project`, `tags` text[], `completed_at`, `search` tsvector |
| `task_suggestions` | Extracted, **unapproved** tasks: `source`, `source_ref`, `title`, `description`, `suggested_due_at`, `confidence`, `status` (`pending`/`accepted`/`dismissed`), `created_task_id` |
| `projects`         | Tracked projects (Struct and future ones): `key`, `name`, `vercel_project_ids`, `stripe_enabled`, `health_url`, `settings` |

### Conversations and audio

| Table                    | Purpose / key columns |
| ------------------------ | --------------------- |
| `conversations`          | `started_at`, `ended_at`, `room_id`, `location`, `title`, `status` (`recording`/`processing`/`ready`/`failed`), `source` (`browser`/`upload`/`room_mic`/`mock`), `speakers` jsonb, `confidence`, `audio_asset_id`, `is_mock`, `search` tsvector |
| `conversation_segments`  | Transcript segments: `conversation_id`, `seq`, `speaker_label`, `person_id`, `start_ms`, `end_ms`, `text`, `confidence`, `search` tsvector |
| `conversation_summaries` | `conversation_id` (nullable for daily/range summaries), `kind` (`conversation`/`daily`/`range`), `range_start`, `range_end`, `summary`, `topics`, `decisions` jsonb, `possible_tasks` jsonb, `model`, `search` tsvector |
| `audio_assets`           | `storage_key`, `mime_type`, `size_bytes`, `duration_ms`, `sha256`, `retention`, `expires_at`, `deleted_at` |

The spec's `conversation_messages` concept is implemented as `conversation_segments`
(transcript segments). Atlas assistant chat history lives separately in `chat_threads` /
`chat_messages` so the two retention policies stay independent.

### Atlas AI

| Table                | Purpose / key columns |
| -------------------- | --------------------- |
| `chat_threads`       | `user_id`, `title`, `last_message_at`, `archived_at` |
| `chat_messages`      | `thread_id`, `role`, `parts` jsonb (AI SDK UI message parts incl. tool calls), `model`, `model_tier`, `usage` jsonb, `metadata` jsonb |
| `tool_audit_log`     | `request_id`, `correlation_id`, `user_id`, `tool`, `risk_level`, `side_effect`, `parameters` (redacted jsonb), `result_status`, `error_code`, `confirmation_state`, `confirmation_id`, `duration_ms`, `invocation_source` (`chat`/`api`/`automation`/`widget`), `thread_id`, `created_at` |
| `tool_confirmations` | Pending approvals: `user_id`, `tool`, `parameters` jsonb, `params_hash`, `risk_level`, `status` (`pending`/`approved`/`rejected`/`expired`/`executed`/`failed`), `preview` jsonb, `result` jsonb, `expires_at`, `decided_at` |
| `memories`           | Deliberate persistent facts: `user_id`, `content`, `kind`, `source`, `source_ref`, `confidence`, `status`, `last_confirmed_at`, `search` tsvector |
| `embeddings`         | pgvector store: `owner_type`, `owner_id`, `model`, `dimensions`, `content_hash`, `embedding vector(1536)`; unique `(owner_type, owner_id, model)` |

### Home, devices, presence, automation

| Table                   | Purpose / key columns |
| ----------------------- | --------------------- |
| `rooms`                 | `key` (unique, e.g. `bedroom`), `name`, `floor` |
| `devices`               | Atlas device projection: `provider`, `external_id` (unique per provider), `name`, `kind`, `room_id`, `capabilities` jsonb, `state` jsonb, `online`, `last_seen_at`, `is_mock` |
| `presence_observations` | Raw evidence (short retention): `source` (`ring_ble`/`esp32_ble`/`door_contact`/`mmwave`/`phone`/`mock`), `person_id`, `room_id`, `signal` jsonb, `observed_at` |
| `presence_states`       | Fused estimates: `person_id`, `room_id`, `state` (`present`/`absent`/`uncertain`), `confidence`, `evidence` jsonb, `estimated_at`, `is_mock` |
| `automation_rules`      | `name`, `enabled`, `trigger` jsonb, `conditions` jsonb, `actions` jsonb, `for_seconds`, `cooldown_seconds`, `max_risk_level`, `last_triggered_at` |
| `automation_runs`       | `rule_id`, `triggered_at`, `status`, `details` jsonb |

### System

| Table                | Purpose / key columns |
| -------------------- | --------------------- |
| `system_settings`    | Key/value jsonb settings: mock toggle, privacy/mic state, retention policies, tool enablement, level-4 kill switch |
| `service_heartbeats` | `service` (`api`/`worker`), `instance_id`, `version`, `started_at`, `last_beat_at`, `details` jsonb |

## Retention

Retention policies live in `system_settings.retention` and are enforced by the worker. Each
category is configured independently:

| Category               | Default          |
| ---------------------- | ---------------- |
| Raw camera media       | 7 days (references only; media stays in Home Assistant) |
| Raw audio              | never retain     |
| Transcripts            | 90 days          |
| Conversation summaries | keep             |
| Atlas events           | keep             |
| AI chat history        | keep             |
| System logs            | 14 days (container log rotation) |

User-generated data (tasks, memories, summaries) is never deleted unless a policy is configured.

## Migrations

- `pnpm db:generate` — generate SQL from schema changes (drizzle-kit).
- `pnpm db:migrate` — apply pending migrations (also run by the API container on start).
- The first migration enables `vector` (pgvector). It is idempotent (`CREATE EXTENSION IF NOT EXISTS`).
