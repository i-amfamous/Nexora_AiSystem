# Nexora — Unified Business Operating Platform

Nexora is a modular Node.js/TypeScript backend plus one shared web frontend for workspace
management, people, customers, sales, inventory, finance, tasks, the unified inbox, workflow
automation, six predefined AI agents, analytics, integrations, notifications and audit. The web
browser and the Windows/macOS Electron wrappers all load the **same backend-served UI**; there is
no second client database.

## Architecture

* `src/` — one deployable modular monolith: `core/` (auth, RBAC, store, queue, crypto, events,
  webhooks, AI orchestrator), `modules/` (business domains) and `api/` (versioned REST router and
  OpenAPI generator). `src/server.ts` listens on port 4000 by default.
* `interface/` — dependency-free responsive UI served by `src/app.ts`; the same files are loaded
  by Electron from `PUBLIC_URL`. It is never copied into the desktop package.
* Persistence — development uses `DATA_STORE=file` (`FileStore`, `.data/nexora.json`) and an
  in-process store-persisted queue. Production is fail-fast: `DATA_STORE=postgres` with
  `DATABASE_URL` selects the tenant-scoped `PostgresStore`, and `QUEUE_DRIVER=redis` selects the
  BullMQ worker while mirroring job state into the Store for monitoring/retry. `db/schema.sql` and
  `npm run migrate` define the PostgreSQL schema (RLS, indexes, functions). The PostgreSQL,
  Redis and SMTP integrations have not been exercised against live services in this environment
  (no local `psql`, Redis, SMTP credentials or Docker daemon), so validate them in staging.
* Realtime — WebSocket events are attached to the same HTTP server, so authorised changes can be
  broadcast to connected clients.
* Packaging — multi-stage `Dockerfile`, `docker-compose.yml` (backend healthcheck, file-store
  volume, PostgreSQL container and optional one-shot migration), and `desktop/` Electron wrappers.

## Quick start

```bash
npm ci
npm run build
npm start
```

Open <http://localhost:4000>. With no `NODE_ENV`, the server runs in development with zero setup.
`npm run dev` runs TypeScript in watch mode; rebuild and restart to pick up changes.

### Production

Production refuses to start unless real backing services and unique secrets are configured. Copy
`.env.example` to `.env`, replace every placeholder, apply the schema, then start the stack:

```bash
cp .env.example .env
# set POSTGRES_PASSWORD, SESSION_SECRET, WEBHOOK_SECRET, FILE_ENCRYPTION_KEY,
# SMTP_URL, PUBLIC_URL and CORS_ORIGIN to real values
npm run build
npm run migrate -- --check
docker compose --profile migrate run --rm migrate
docker compose up -d
```

Required production settings: `DATA_STORE=postgres`, `DATABASE_URL`, `QUEUE_DRIVER=redis`,
`REDIS_URL`, `SMTP_URL`, `PUBLIC_URL`, `CORS_ORIGIN`, `SESSION_SECRET` (32+ chars),
`WEBHOOK_SECRET` (24+ chars) and `FILE_ENCRYPTION_KEY` (32+ chars). Placeholder secrets are
rejected, `REQUIRE_HTTPS=true` is forced and demo seeding is disabled. Newly registered
workspaces receive structural defaults (roles, departments, channels, agents, integrations) but
no demo customers, users, conversations or statistics. The public `/api/v1/config` endpoint reports
`demoMode:false`, and the web login form does not prefill demo credentials.

### Development-only demo credentials

`owner@example.test` / `redacted-password`

The demo workspace is seeded from `interface/assets/js/data.js` on first run only when
`NODE_ENV !== 'production'`. `SEED_PASSWORD` applies only when the data file is created; delete
`.data/nexora.json` to re-seed. Reset tokens are returned/printed locally instead of emailed.

### API documentation

* Machine-readable OpenAPI 3.1 specification: [`docs/openapi.json`](docs/openapi.json)
  (also served at `/openapi.json`).
* Regenerate after changing routes with `npm run openapi` (run `npm run build` first).
* All business endpoints are under `/api/v1`; `GET /api/v1/health` and `GET /api/v1/config` are public.

### Tests

```bash
npm test
```

Runs `npm run build` then `node --test tests/*.test.js` — API/auth/RBAC/tenant isolation,
durable queue behaviour, endpoint contracts, customer notes, CSV exports, file encryption,
monitoring, and signed-webhook/realtime/AI-approval security tests.

### Migrations

```bash
npm run build
npm run migrate                 # prints SQL when DATABASE_URL is unset
DATABASE_URL=postgresql://... npm run migrate   # applies schema via host psql
npm run migrate -- --check      # verifies required schema statements
```

Apply the migration before setting `DATA_STORE=postgres`; the adapter seed step assumes the schema
exists. In Docker, use the one-shot service below so `psql` runs inside the postgres image, not on
the host.

### Backups and recovery

```bash
npm run backup                         # writes .data/backups/<UTC stamp>/
npm run restore -- .data/backups/<stamp> --confirm
```

`scripts/backup.sh` copies the file store and, when `DATABASE_URL` is set, creates a `pg_dump`
custom-format dump if `pg_dump` is available. `scripts/restore.sh` takes a pre-restore copy of the
file store and requires `--confirm`. In production the backend starts a scheduler using
`BACKUP_INTERVAL_HOURS` (default 24; set `0` to disable) that runs this same script. Backup
ACLs and a formal recovery drill remain deployment work.

### Docker

```bash
cp .env.example .env            # then replace every required placeholder
npm run docker:build            # docker compose build backend
docker compose --profile migrate run --rm migrate   # apply db/schema.sql
npm run docker:up               # starts backend, PostgreSQL and Redis on :4000
npm run docker:down             # stops the stack; named volumes are retained
```

The backend image is non-root, uses production dependencies only, includes `interface/`,
`docs/` and `db/`, exposes 4000 and healthchecks `/api/v1/health`. Compose runs in production
mode with PostgreSQL (`postgres-data`), Redis (`redis-data`) and the file/backup volume
(`nexora-data`). It refuses to start unless `POSTGRES_PASSWORD`, `PUBLIC_URL`, `CORS_ORIGIN`,
`SESSION_SECRET`, `WEBHOOK_SECRET`, `FILE_ENCRYPTION_KEY` and `SMTP_URL` are set in `.env`.

### Desktop

Start the backend first, then:

```bash
npm run desktop:dev              # Electron window pointed at PUBLIC_URL
npm run desktop:build:win        # unsigned NSIS installer in desktop/dist/
npm run desktop:build:mac        # unsigned .dmg/.zip in desktop/dist/
```

`PUBLIC_URL` can point at any hosted backend (or be passed as `--public-url=https://...`). The
wrapper has native window/menu behaviour, reload/back/forward, origin-checked `http:`/`https:`
external links opened in the OS browser, and a documented preload allowlist. It does not bundle
`interface/` or a database. Production installers require the organisation's signing/notarisation
credentials (`CSC_LINK`/`CSC_KEY_PASSWORD`, `APPLE_ID`/`APPLE_TEAM_ID`/
`APPLE_APP_SPECIFIC_PASSWORD`); unsigned local builds remain the default. Auto-update is not
configured; see [`desktop/README.md`](desktop/README.md).

## SRS v2.0 coverage — 19-row checklist

The detailed FR-01..FR-15, NFR-01..NFR-41 and section-by-section matrix is in
[`docs/SRS-coverage.md`](docs/SRS-coverage.md). Statuses are intentionally conservative.

| # | Area | Status | Note |
|---|---|---|---|
| 1 | FR-01 Business workspace | Implemented | Registration, settings and tenant-scoped data; development file store or required production PostgreSQL store. |
| 2 | FR-02 Authentication | Implemented | scrypt passwords, signed sessions, RBAC, SMTP reset links/invitations in production and clean new workspaces. |
| 3 | FR-03 Departments/employees | Implemented | Invite, roles, permissions, status changes and audit events. |
| 4 | FR-04 Unified communication | Partial | Inbox, adapters and signed webhooks work; live provider credentials/templates are not configured. |
| 5 | FR-05 Customers | Implemented | CRUD, conversation and internal notes, tags, identifiers, history and duplicate detection. |
| 6 | FR-06 Sales/orders | Implemented | Leads, activities, server-calculated order totals, history and reports. |
| 7 | FR-07 Inventory | Implemented | Products, movements, thresholds, suppliers, purchase requests and stock guards. |
| 8 | FR-08 Finance | Implemented | Invoices, payments, expenses, summaries and provider-webhook verification path. |
| 9 | FR-09 Tasks | Implemented | Assignment, deadlines, priority, statuses, overdue flags and activity. |
| 10 | FR-10 Workflow engine | Implemented | Triggers, conditions, actions, approvals, retries and idempotency; BullMQ/Redis queue in production, in-process queue in development. |
| 11 | FR-11 AI agents | Implemented | Six agents with tool allowlists, limits, escalation, logs and a replaceable provider. |
| 12 | FR-12 Analytics | Implemented | Dashboards, date filters, charts, authoritative dataset CSV exports, structured logs, monitoring and traceable AI summaries. |
| 13 | FR-13 Integrations | Partial | Connect/disconnect/sync UI and APIs exist with encryption helpers; no OAuth flows or managed secret store. |
| 14 | FR-14 Notifications | Partial | In-app and OS desktop notifications plus production SMTP for resets/invitations; no SMS or general broadcast delivery. |
| 15 | FR-15 Audit | Implemented | Broad activity coverage with read/export API; not an immutable audit store. |
| 16 | NFR-01..NFR-41 | Partial | Security, validation, modularity, docs, responsive UI, fail-fast config, Redis queue, scheduled backups, structured logs and monitoring are covered; SLOs, managed infrastructure, recovery drills and formal accessibility testing remain. |
| 17 | SRS §§5-7 Cross-platform, NFRs, architecture | Partial | Shared backend UI, Electron wrappers, WebSockets and production Redis/BullMQ workers; unsigned/no auto-update and no measured SLOs remain. |
| 18 | SRS §§8-11 Database, API, UI, security | Partial | RLS schema, tenant-scoped PostgreSQL adapter, OpenAPI REST API, complete UI, RBAC and require-HTTPS enforcement exist; adapter needs staging validation. |
| 19 | SRS §§12-15 Deployment, testing, MVP, acceptance | Partial | Production compose with PostgreSQL/Redis, CI workflow, backups/restore and eight automated test suites added; no live staging validation, recovery drill, E2E/cross-platform CI or signed installers. |

## Known limitations

* PostgreSQL, Redis/BullMQ and SMTP delivery are implemented and fail-fast in production, but have
  not been validated against live services in this environment. Validate them in staging.
* Electron installers remain unsigned unless signing credentials are supplied, and auto-update is
  not configured.
* No external channel-provider credentials, Sentry/OpenTelemetry SDK exporters or managed secret
  store are bundled. Structured JSON logs and `/api/v1/config` are available.
* Production TLS termination, staging environments, a recovery drill, measured SLOs and
  E2E/cross-platform test automation remain deployment work.
