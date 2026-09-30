# Security

Atlas stores calendars, mail snippets, home state, and payment summaries. The model never receives credentials or a full mailbox.

- Server secrets are not prefixed with `VITE_` and are not returned by the API.
- Sessions are httpOnly cookies. Mutations require the CSRF token from `/api/auth/session`.
- Passwords are hashed with argon2id.
- OAuth refresh tokens and other stored credentials use AES-256-GCM with `ATLAS_ENCRYPTION_KEY`.
- Tool calls are audited with parameters redacted.
- Level 3 actions need an explicit confirmation. Level 4 (money movement) is disabled.
- Stripe and Vercel clients reject non-GET calls.
- Webhook signatures will be verified before a live Stripe endpoint accepts events.
- Markdown from the model is sanitized in the browser.
- PostgreSQL and MQTT bind to localhost in Compose.
- Logs go through pino redaction and a scrubber for known secret values.

Passkeys are reserved in `webauthn_credentials` and are not enabled yet.

Use Tailscale or another VPN instead of exposing the API on the public internet.
