# Atlas OS on a Linux server

The production target is a Debian or Ubuntu machine on your LAN, such as the Chromebook that also runs Pi-hole. Atlas is not hosted on Vercel. Reach it through the LAN or Tailscale. Do not publish PostgreSQL or MQTT to the internet.

## Layout

```bash
docker compose -f infrastructure/docker-compose.yml up -d --build
```

Services:

- `atlas-api` serves the API and the built web app
- `atlas-worker` runs heartbeats and background jobs
- `postgres` (pgvector) on the Docker network only
- `mosquitto` only with the `mqtt` profile
- `caddy` only with the `proxy` profile, for HTTPS

Set `DATABASE_URL` to the Compose service name:

`postgresql://atlas:<password>@postgres:5432/atlas`

The API container reads `.env.local` via `env_file`. Do not copy secrets into the Compose file.

## HTTPS

Microphone capture and an installable PWA need a secure origin. Use Caddy on the Chromebook, or a Tailscale HTTPS name, and set `ATLAS_BASE_URL` to that origin.

## Backups

PostgreSQL data lives in the `atlas-postgres` volume. A logical backup:

```bash
docker compose -f infrastructure/docker-compose.yml exec postgres pg_dump -U atlas atlas > atlas.sql
```

Restore with `psql` against the same database. Audio files, when retention allows them, live under `ATLAS_DATA_DIR`.

## Updates

Pull the repo, rebuild the images, and run migrations. The API applies migrations on startup.
