# SRS v2.0 coverage (detailed)

Companion to the 19-row summary in `README.md`. Statuses are deliberately conservative:
**Implemented** = behaviour exists in this repository today, **Partial** = scaffolding or a
substitute exists but a production requirement is not fully met, **Planned** = no implementation yet.

Runtime truth for this release: development (`NODE_ENV !== 'production'`) uses `DATA_STORE=file`
with `FileStore`, an in-process store-persisted queue and a seeded demo workspace. Production is
fail-fast and requires `DATA_STORE=postgres` with `DATABASE_URL`, `QUEUE_DRIVER=redis` with
`REDIS_URL`, SMTP, real secrets, `PUBLIC_URL` and `CORS_ORIGIN`; demo seeding and demo credential
prefill are disabled. `db/schema.sql` (RLS, indexes, functions), `npm run migrate`, BullMQ workers,
scheduled backups, structured JSON logs and a CI workflow exist. PostgreSQL, Redis and SMTP have
not been exercised against live services in this environment, so validate them in staging. The
Electron wrapper loads the backend-served UI via `PUBLIC_URL` and is unsigned unless signing
credentials are supplied. Verification in this repository is automated at the Node/jsdom level
(10 test files, 17 tests): exact router/OpenAPI parity, an HTTP sweep of every documented
operation, CRUD for every creatable resource, UI trigger/handler and `NXApi` export parity, a
jsdom render sweep of all routes, and production config fail-fast checks.

## Functional requirements (FR-01 .. FR-15)

| ID | Status | Note |
|---|---|---|
| FR-01 Business workspace management | Implemented | Register workspace, unique ID, settings, tenant-scoped reads/writes, production PostgreSQL store and clean structural defaults for new tenants. |
| FR-02 Authentication and access control | Implemented | scrypt passwords, login, production SMTP reset links/invitations, signed sessions, session revocation, RBAC and fail-fast secrets; reset tokens are never returned in production. |
| FR-03 Department and employee management | Implemented | Departments, employee accounts, roles/permission matrix, invite, role change and access revocation with audit records. Invitations are emailed in production. |
| FR-04 Unified communication | Partial | Unified inbox, normalisation, assignment, takeover, attachments, channel status and HMAC-verified webhooks; live provider credentials/templates are not configured. |
| FR-05 Customer management | Implemented | CRUD, internal notes, conversation notes, tags, phone/email identifiers, conversation/order linkage, search/filter and duplicate detection. |
| FR-06 Sales and order management | Implemented | Leads, activities, multi-line orders, server-calculated totals, status history, customer linkage and sales reports. |
| FR-07 Inventory management | Implemented | Products, stock quantities/movements, thresholds, notifications, suppliers, purchase requests, permission checks and negative-stock blocks. |
| FR-08 Finance management | Implemented | Invoices, payments, expenses, categories, balances, summaries, histories and a verified provider-webhook payment path; no live gateway is configured. |
| FR-09 Employee and task management | Implemented | Task creation, assignment, deadlines, priority, status changes, overdue flags, activity and notifications. |
| FR-10 Workflow automation engine | Implemented | Triggers/conditions/actions, activation, dry runs, execution history, failures, retries, approvals and idempotency; BullMQ/Redis in production, in-process queue in development. |
| FR-11 Predefined AI agent system | Implemented | Six agents, tool allowlists, automation levels, locked actions, limits, policies, approvals, logs and a replaceable mock/HTTP provider abstraction. |
| FR-12 Business analytics and reporting | Implemented | Overview, date ranges, sales/inventory/finance/communication/AI/workflow metrics, charts, authoritative dataset CSV exports, monitoring endpoint, structured logs and data-traceable AI summaries. |
| FR-13 Integration management | Partial | Connect/disconnect/sync/status APIs and UI with AES-GCM helper, production encryption key and webhook verification; no OAuth flows or managed secret store. |
| FR-14 Notification management | Partial | In-app notifications, preferences, read-all, OS notifications through Electron and production SMTP for resets/invitations; no SMS or general broadcast delivery. |
| FR-15 Audit and activity management | Implemented | Audit records for auth, people, customer/product/order/finance changes, AI/workflow actions and approvals, with read/export API; not cryptographically immutable. |

## Non-functional requirements (NFR-01 .. NFR-41)

| ID | Status | Note |
|---|---|---|
| NFR-01 Prompt navigation | Partial | Dependency-free static UI feels responsive locally; no measured p95 navigation benchmark. |
| NFR-02 API < 500 ms p95 | Partial | Small file-backed API is fast in tests; no load test or SLO evidence exists. |
| NFR-03 Efficient dashboard data | Implemented | Dedicated aggregated analytics endpoints and one bootstrap call avoid per-widget round trips. |
| NFR-04 Background processing | Implemented | Development uses a durable store-persisted queue; production uses BullMQ/Redis workers with job state mirrored into the Store. |
| NFR-05 Pagination and filtering | Implemented | Generic list endpoints support query-based filter/sort/pagination; paging happens in the process, not in SQL. |
| NFR-06 99.5% availability | Planned | No production SLA, redundancy, health-based failover or availability reporting. |
| NFR-07 Isolate integration failures | Implemented | Adapters return local queued status or throw per module; unrelated modules keep working. |
| NFR-08 Controlled job retries | Implemented | Exponential backoff, `maxAttempts`, dead-letter status and manual retry endpoint in both queue drivers. |
| NFR-09 Duplicate execution guards | Implemented | Idempotency keys, `If-Match` version checks, BullMQ job IDs and webhook nonce replay rejection. |
| NFR-10 Recoverable backups | Partial | `npm run backup`/`npm run restore` and a production scheduler (`BACKUP_INTERVAL_HOURS`) cover the file store and optional `pg_dump`; no ACLs or recovery drill. |
| NFR-11 Password hashing | Implemented | Salted `scrypt` with constant-time verification. |
| NFR-12 HTTPS/TLS | Partial | `REQUIRE_HTTPS=true` and HSTS are forced in production; TLS termination is still a proxy/deployment responsibility. |
| NFR-13 Authentication and RBAC | Implemented | Signed sessions and permission checks on API routes, including resource-level enforcement. |
| NFR-14 Tenant isolation | Implemented | Every store call is tenant-filtered by `businessId`; the schema also defines RLS (not active in the file runtime). |
| NFR-15 Secret encryption/management | Partial | AES-256-GCM helpers plus production fail-fast for session/webhook/encryption secrets; development fallback keys exist and no managed vault is used. |
| NFR-16 Sensitive-action authorisation | Implemented | Dedicated permissions plus human approval gates for agent actions and workflow steps. |
| NFR-17 Web vulnerability protection | Partial | CSP, `nosniff`, frame/permissions policies, path-traversal guard and validation; no independent penetration test. |
| NFR-18 Input validation | Implemented | Shared validation helpers, typed request bodies and JSON parse errors returned as 400. |
| NFR-19 Rate limits | Partial | Per-IP in-process limits for auth, webhooks and general API; not shared across replicas. |
| NFR-20 Webhook verification | Implemented | HMAC signatures, timestamp window and one-time nonce checks; production requires `WEBHOOK_SECRET`, and a missing secret is rejected as `401 UNAUTHENTICATED` rather than a server error. |
| NFR-21 More businesses/employees | Partial | Modular code, tenant model and required production PostgreSQL store support growth; no load test. |
| NFR-22 More communication volume | Partial | Adapter registry exists; no provider load tests or throughput tuning. |
| NFR-23 Modular backend | Implemented | Separate `core/`, `modules/` and `api/` boundaries in one deployable monolith. |
| NFR-24 Indexes and query tuning | Partial | `db/schema.sql` defines tenant, JSON and join indexes; list filtering is still applied after fetching tenant rows. |
| NFR-25 Independently scalable workers | Implemented | BullMQ/Redis workers are decoupled from request handling and can be scaled by running more instances; not load-tested. |
| NFR-26 Modular architecture | Implemented | Business modules, core services and router are separated by directory and interface. |
| NFR-27 Logic vs presentation | Implemented | Backend owns calculations/permissions; the UI renders API data and backend responses. |
| NFR-28 Coding standards | Partial | Strict TypeScript and consistent layout; CI enforces typecheck/tests, but no lint/format configuration exists. |
| NFR-29 API documentation | Implemented | `npm run openapi` generates an OpenAPI 3.1 document, including the public `/api/v1/config` endpoint, also served at `/openapi.json`. |
| NFR-30 Automated critical tests | Partial | Ten Node test files / 17 tests cover API/RBAC/tenant, endpoints, queue, notes, CSV, storage, security, production fail-fast, exact API/UI inventory parity, an HTTP sweep of all 180 operations and jsdom rendering of every route; CI runs build/tests/OpenAPI/migration/syntax/smoke checks, but no real-browser, cross-platform or live-service automation. |
| NFR-31 Understandable interface | Implemented | Plain-language business screens, clear states and role-aware navigation. |
| NFR-32 Consistent navigation | Implemented | The same UI bundle is served to browsers and the Electron wrapper. |
| NFR-33 Responsive screen sizes | Implemented | Responsive CSS down to narrow/tablet widths. |
| NFR-34 Useful validation messages | Implemented | Field and server validation errors are surfaced in dialogs/toasts. |
| NFR-35 Clear dashboards | Implemented | Tabular figures, labelled charts, legends and status colours used only for state. |
| NFR-36 Accessibility practices | Partial | Focus rings, labels, Escape handling and reduced-motion support; no formal audit or screen-reader testing. |
| NFR-37 Restrict personal/business data | Implemented | RBAC plus per-tenant filtering on reads, writes, exports and file access. |
| NFR-38 Configurable retention | Implemented | `GET/PUT /api/v1/data/retention` backed by workspace settings. |
| NFR-39 Authorised data export | Implemented | `GET /api/v1/data/export`, tenant-scoped analytics CSV exports and audit-log JSON export. |
| NFR-40 Controlled deletion | Implemented | `POST /api/v1/data/delete` with permission check and scoped record deletion. |
| NFR-41 Protected backups | Partial | Backup/restore helpers, a production scheduler and destructive-restore confirmation exist; no ACLs or recovery drill. |

## SRS sections 5 .. 15

| Section | Status | Note |
|---|---|---|
| 5 Cross-platform requirements | Partial | Web plus Windows/macOS Electron wrappers share one backend via `PUBLIC_URL`; signing env support exists, but no credentials, auto-update or offline mode. |
| 6 Non-functional requirements | Partial | Security, modularity, docs, fail-fast config, Redis workers, scheduled backups and structured logs are addressed; SLO measurement and live validation remain. |
| 7 Technical architecture | Partial | Modular monolith, Node/TypeScript, REST/OpenAPI, WebSockets, PostgreSQL and Electron match the intent; the UI is dependency-free plain JS rather than Next.js/NestJS. |
| 8 Database requirements | Partial | RLS-enabled schema, migration CLI and a tenant-scoped `PostgresStore` adapter exist; the adapter still needs staging validation against a live server. |
| 9 API requirements | Implemented | Versioned `/api/v1` REST API with consistent envelopes, errors, idempotency, RBAC and generated OpenAPI document. |
| 10 User interface requirements | Implemented | Single responsive interface covers all SRS 10 screens, role-adaptive navigation and production-safe auth forms for web and desktop. |
| 11 Security and governance | Partial | RBAC, AI tool boundaries, approvals, audit log, untrusted-content policy, fail-fast secrets and require-HTTPS exist; no external security review or immutable audit store. |
| 12 Deployment and infrastructure | Partial | Production Dockerfile/compose with PostgreSQL and Redis, healthchecks, non-root runtime, scheduled backups, structured logs and a monitoring endpoint exist; alerting and live validation are not configured. |
| 13 Testing requirements | Partial | Node/jsdom tests now sweep every documented API operation, creatable resource, UI trigger and route, plus CI typecheck/test/OpenAPI/migration/syntax/smoke checks; no real-browser, cross-platform or live-service test automation. |
| 14 MVP and release strategy | Partial | Phases 1-6 capabilities and wrappers exist; installers are unsigned unless credentials are supplied and Phase 7 expansion is out of scope. |
| 15 Acceptance criteria | Partial | Most functional criteria are demonstrable; live service validation, recovery drills, security sign-off and real cross-client update verification remain open. |

## Explicitly not claimed

* PostgreSQL, Redis and SMTP are wired and enforced in production but were not validated against
  live services here; validate in staging before release.
* No channel-provider credentials, SMS delivery, Sentry/OpenTelemetry SDK exporters or managed
  secret store are bundled.
* No signed/notarised Electron installers without organisation credentials, and no auto-update mechanism.
* No formal recovery drill, staging environment, measured SLOs, penetration test or real-browser/E2E/cross-platform CI.
