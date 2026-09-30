# Atlas OS on Windows

Atlas Core runs on your machine. The browser talks to the Vite dev server, which proxies `/api` and `/ws` to the API.

## Requirements

- Node.js 24
- pnpm 12 (`corepack enable`)
- PostgreSQL with pgvector, or Docker Desktop

## Database

`DATABASE_URL` comes from the repository root `.env.local`. During Windows development it should point at localhost:

`postgresql://atlas:<password>@localhost:5432/atlas`

Start only the database:

```powershell
docker compose -f infrastructure/docker-compose.dev.yml up -d
pnpm db:migrate
```

PostgreSQL and MQTT are bound to `127.0.0.1`. They are not published on your LAN.

## App

```powershell
pnpm install
pnpm dev
```

- Web: http://localhost:5173
- API: http://127.0.0.1:4000

The first launch asks you to create the local account. Integrations are optional. With **Use mock integrations** on (the development default), the dashboard, timeline, and Atlas chat work without Home Assistant, Google, Vercel, or Stripe.

## Checks

```powershell
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

## Secrets

Real values stay in `.env.local`, which is gitignored. `.env.example` has names and placeholders only. The API logs missing variable names, never values.
