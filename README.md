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
* Persistence — `DATA_STORE=file` (the default) uses `FileStore` (`.data/nexora.json`); setting
  `DATA_STORE=postgres` with `DATABASE_URL` selects the tenant-scoped `PostgresStore` adapter and
  applies the same `Store` contract to every module. `db/schema.sql` and `npm run migrate` define
  the PostgreSQL schema (RLS, indexes, functions). The queue remains store-persisted and in-process;
  Redis/BullMQ is not wired. The PostgreSQL adapter has not been exercised against a live server in
  this environment (no local `psql`/Docker daemon), so validate it in staging before production.
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

Open <http://localhost:4000>. `npm run dev` runs TypeScript in watch mode; rebuild and restart to
pick up changes. Copy `.env.example` to `.env` to override defaults (secrets must be changed for
any shared environment).

### Demo credentials

`owner@example.test` / `redacted-password`

The demo workspace is seeded from `interface/assets/js/data.js` on first run. `SEED_PASSWORD`
applies only when the data file is created; delete `.data/nexora.json` to re-seed.

### API documentation

* Machine-readable OpenAPI 3.1 specification: [`docs/openapi.json`](docs/openapi.json)
  (also served at `/openapi.json`).
* Regenerate after changing routes with `npm run openapi` (run `npm run build` first).
* All business endpoints are under `/api/v1`; `GET /api/v1/health` is public.

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
file store and requires `--confirm`. Scheduling, backup ACLs and recovery drills remain deployment
work.

### Docker

```bash
npm run docker:build            # docker compose build backend
npm run docker:up               # starts backend on :4000 (and a healthy postgres container)
npm run docker:down             # stops the stack; named volumes are retained

docker compose --profile migrate run --rm migrate   # render and apply db/schema.sql
```

The backend image is non-root, uses production dependencies only, includes `interface/`,
`docs/` and `db/`, exposes 4000 and healthchecks `/api/v1/health`. Compose sets
`DATA_STORE=file` by default: the app persists to the `nexora-data` volume. To use the PostgreSQL
container as the live store, run the one-shot migration first, then start with
`DATA_STORE=postgres docker compose up -d backend`. Change `SESSION_SECRET` and `WEBHOOK_SECRET`
before using the stack beyond localhost.

### Desktop

Start the backend first, then:

```bash
npm run desktop:dev              # Electron window pointed at PUBLIC_URL
npm run desktop:build:win        # unsigned NSIS installer in desktop/dist/
npm run desktop:build:mac        # unsigned .dmg/.zip in desktop/dist/
```

`PUBLIC_URL` defaults to `http://localhost:4000` and can point at any hosted backend (or be passed
as `--public-url=https://...`). The wrapper has native window/menu behaviour, reload/back/forward,
origin-checked `http:`/`https:` external links opened in the OS browser, and a documented preload
allowlist. It does not bundle `interface/` or a database. Code signing, notarisation and
auto-update require the organisation's credentials and are **not configured**; see
[`desktop/README.md`](desktop/README.md).

## SRS v2.0 coverage — 19-row checklist

The detailed FR-01..FR-15, NFR-01..NFR-41 and section-by-section matrix is in
[`docs/SRS-coverage.md`](docs/SRS-coverage.md). Statuses are intentionally conservative.

| # | Area | Status | Note |
|---|---|---|---|
| 1 | FR-01 Business workspace | Implemented | Registration, settings and tenant-scoped data; file or PostgreSQL store selected by `DATA_STORE`. |
| 2 | FR-02 Authentication | Implemented | scrypt passwords, sessions, RBAC and reset flow; no email delivery. |
| 3 | FR-03 Departments/employees | Implemented | Invite, roles, permissions, status changes and audit events. |
| 4 | FR-04 Unified communication | Partial | Inbox, adapters and signed webhooks work; live provider credentials/templates are not configured. |
| 5 | FR-05 Customers | Implemented | CRUD, conversation and internal notes, tags, identifiers, history and duplicate detection. |
| 6 | FR-06 Sales/orders | Implemented | Leads, activities, server-calculated order totals, history and reports. |
| 7 | FR-07 Inventory | Implemented | Products, movements, thresholds, suppliers, purchase requests and stock guards. |
| 8 | FR-08 Finance | Implemented | Invoices, payments, expenses, summaries and provider-webhook verification path. |
| 9 | FR-09 Tasks | Implemented | Assignment, deadlines, priority, statuses, overdue flags and activity. |
| 10 | FR-10 Workflow engine | Implemented | Triggers, conditions, actions, approvals, retries and idempotency on an in-process queue. |
| 11 | FR-11 AI agents | Implemented | Six agents with tool allowlists, limits, escalation, logs and a replaceable provider. |
| 12 | FR-12 Analytics | Implemented | Dashboards, date filters, charts, authoritative dataset CSV exports, monitoring and traceable AI summaries. |
| 13 | FR-13 Integrations | Partial | Connect/disconnect/sync UI and APIs exist; no OAuth flows or secret manager. |
| 14 | FR-14 Notifications | Partial | In-app and OS desktop notifications; no SMTP/SMS delivery. |
| 15 | FR-15 Audit | Implemented | Broad activity coverage with read/export API; not an immutable audit store. |
| 16 | NFR-01..NFR-41 | Partial | Security, validation, modularity, docs, responsive UI, backup scripts and monitoring endpoint are covered; SLOs, managed DB/Redis, backup scheduling and formal accessibility testing remain. |
| 17 | SRS §§5-7 Cross-platform, NFRs, architecture | Partial | Shared backend UI plus Electron wrappers and WebSockets; unsigned/no auto-update and an in-process queue remain. |
| 18 | SRS §§8-11 Database, API, UI, security | Partial | RLS schema, a tenant-scoped PostgreSQL adapter, OpenAPI REST API, complete UI and RBAC exist; the adapter still needs staging validation. |
| 19 | SRS §§12-15 Deployment, testing, MVP, acceptance | Partial | Docker/compose, backup/restore scripts and eight automated test suites added; no staging/production pipeline, recovery drill, E2E/cross-platform CI or signed installers. |

## Known limitations

* `DATA_STORE=postgres` is wired but has not been validated against a live PostgreSQL server in this
  environment; no Redis/BullMQ adapter exists.
* Electron installers are unsigned and have no auto-update mechanism.
* No external provider credentials, SMTP delivery, Sentry/OpenTelemetry wiring, backup scheduler
  or managed secret store.
* Production TLS/HTTPS termination, staging/production environments and E2E/cross-platform test
  automation remain deployment work.
