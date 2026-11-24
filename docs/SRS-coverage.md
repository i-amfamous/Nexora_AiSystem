# SRS v2.0 coverage (detailed)

Companion to the 19-row summary in `README.md`. Statuses are deliberately conservative:
**Implemented** = behaviour exists in this repository today, **Partial** = scaffolding or a
substitute exists but a production requirement is not met, **Planned** = no implementation yet.

Runtime truth for this release: `DATA_STORE=file` uses `FileStore`; `DATA_STORE=postgres` with
`DATABASE_URL` uses the tenant-scoped `PostgresStore` adapter. Both paths use the store-persisted
in-process `JobQueue`. `db/schema.sql` (RLS, indexes, functions) and `npm run migrate` exist; the
PostgreSQL adapter has not been exercised against a live server here. No Redis adapter, SMTP
transport, Sentry/OTel SDK, backup scheduler or auto-updater is wired. The Electron wrapper loads
the backend-served UI via `PUBLIC_URL` and is unsigned.

## Functional requirements (FR-01 .. FR-15)

| ID | Status | Note |
|---|---|---|
| FR-01 Business workspace management | Implemented | Register workspace, unique ID, settings, tenant-scoped reads/writes and audit events; file or PostgreSQL store is selected by `DATA_STORE`. |
| FR-02 Authentication and access control | Implemented | scrypt passwords, login, reset flow, signed sessions, session revocation and RBAC; reset tokens are console-logged outside production (no email delivery). |
| FR-03 Department and employee management | Implemented | Departments, employee accounts, roles/permission matrix, invite, role change and access revocation with audit records. |
| FR-04 Unified communication | Partial | Unified inbox, normalisation, assignment, takeover, attachments, channel status and HMAC-verified webhooks; live provider credentials/templates are not configured. |
| FR-05 Customer management | Implemented | CRUD, internal notes, conversation notes, tags, phone/email identifiers, conversation/order linkage, search/filter and duplicate detection. |
| FR-06 Sales and order management | Implemented | Leads, activities, multi-line orders, server-calculated totals, status history, customer linkage and sales reports. |
| FR-07 Inventory management | Implemented | Products, stock quantities/movements, thresholds, notifications, suppliers, purchase requests, permission checks and negative-stock blocks. |
| FR-08 Finance management | Implemented | Invoices, payments, expenses, categories, balances, summaries, histories and a verified provider-webhook payment path; no live gateway is configured. |
| FR-09 Employee and task management | Implemented | Task creation, assignment, deadlines, priority, status changes, overdue flags, activity and notifications. |
| FR-10 Workflow automation engine | Implemented | Triggers/conditions/actions, activation, dry runs, execution history, failures, retries, approvals and idempotency; the queue is in-process, not Redis/BullMQ. |
| FR-11 Predefined AI agent system | Implemented | Six agents, tool allowlists, automation levels, locked actions, limits, policies, approvals, logs and a replaceable mock/HTTP provider abstraction. |
| FR-12 Business analytics and reporting | Implemented | Overview, date ranges, sales/inventory/finance/communication/AI/workflow metrics, charts, authoritative dataset CSV exports, monitoring endpoint and data-traceable AI summaries. |
| FR-13 Integration management | Partial | Connect/disconnect/sync/status APIs and UI with AES-GCM helper and webhook verification; no OAuth flows, secret manager or real provider catalogue. |
| FR-14 Notification management | Partial | In-app notifications, preferences, read-all and OS notifications through the new Electron wrapper; no email/SMS/SMTP delivery. |
| FR-15 Audit and activity management | Implemented | Audit records for auth, people, customer/product/order/finance changes, AI/workflow actions and approvals, with read/export API; not cryptographically immutable. |

## Non-functional requirements (NFR-01 .. NFR-41)

| ID | Status | Note |
|---|---|---|
| NFR-01 Prompt navigation | Partial | Dependency-free static UI feels responsive locally; no measured p95 navigation benchmark. |
| NFR-02 API < 500 ms p95 | Partial | Small in-memory/file-backed API is fast in tests; no load test or SLO evidence exists. |
| NFR-03 Efficient dashboard data | Implemented | Dedicated aggregated analytics endpoints and one bootstrap call avoid per-widget round trips. |
| NFR-04 Background processing | Implemented | Durable `JobQueue` handles message delivery, workflows, schedules and reminders. |
| NFR-05 Pagination and filtering | Implemented | Generic list endpoints support query-based filter/sort/pagination; paging happens in the process, not in SQL. |
| NFR-06 99.5% availability | Planned | No production SLA, redundancy, health-based failover or availability reporting. |
| NFR-07 Isolate integration failures | Implemented | Adapters return local queued status or throw per module; unrelated modules keep working. |
| NFR-08 Controlled job retries | Implemented | Exponential backoff, `maxAttempts`, dead-letter status and manual retry endpoint. |
| NFR-09 Duplicate execution guards | Implemented | Idempotency keys, `If-Match` version checks and webhook nonce replay rejection. |
| NFR-10 Recoverable backups | Partial | `npm run backup`/`npm run restore` cover the file store and optional `pg_dump`; no scheduler, ACLs or recovery drill. |
| NFR-11 Password hashing | Implemented | Salted `scrypt` with constant-time verification. |
| NFR-12 HTTPS/TLS | Partial | `REQUIRE_HTTPS` redirect and HSTS headers exist; TLS termination is left to a proxy and local/compose runs are HTTP. |
| NFR-13 Authentication and RBAC | Implemented | Signed sessions and permission checks on API routes, including resource-level enforcement. |
| NFR-14 Tenant isolation | Implemented | Every store call is tenant-filtered by `businessId`; the schema also defines RLS (not active in the file runtime). |
| NFR-15 Secret encryption/management | Partial | AES-256-GCM helpers and env-based secrets; development fallback keys and no managed vault. |
| NFR-16 Sensitive-action authorisation | Implemented | Dedicated permissions plus human approval gates for agent actions and workflow steps. |
| NFR-17 Web vulnerability protection | Partial | CSP, `nosniff`, frame/permissions policies, path-traversal guard and validation; no independent penetration test. |
| NFR-18 Input validation | Implemented | Shared validation helpers, typed request bodies and JSON parse errors returned as 400. |
| NFR-19 Rate limits | Implemented | Per-IP in-process limits for auth, webhooks and general API; not shared across replicas. |
| NFR-20 Webhook verification | Implemented | HMAC signatures, timestamp window and one-time nonce checks; requires `WEBHOOK_SECRET` to be configured. |
| NFR-21 More businesses/employees | Partial | Modular code, tenant model and a PostgreSQL store option support growth; default file store is for local use. |
| NFR-22 More communication volume | Partial | Adapter registry exists; no provider load tests or throughput tuning. |
| NFR-23 Modular backend | Implemented | Separate `core/`, `modules/` and `api/` boundaries in one deployable monolith. |
| NFR-24 Indexes and query tuning | Partial | `db/schema.sql` defines tenant, JSON and join indexes; list filtering is still applied after fetching tenant rows. |
| NFR-25 Independently scalable workers | Partial | Queue persists jobs through the Store but polls inside the API process; no Redis/BullMQ adapter. |
| NFR-26 Modular architecture | Implemented | Business modules, core services and router are separated by directory and interface. |
| NFR-27 Logic vs presentation | Implemented | Backend owns calculations/permissions; the UI renders API data and backend responses. |
| NFR-28 Coding standards | Partial | Strict TypeScript and consistent file layout; no lint/format configuration or enforcement. |
| NFR-29 API documentation | Implemented | `npm run openapi` generates `docs/openapi.json` (OpenAPI 3.1, 120 documented paths) also served at `/openapi.json`. |
| NFR-30 Automated critical tests | Partial | Eight Node test files cover API/RBAC/tenant, endpoints, queue, notes, CSV, storage and security; browser and cross-platform E2E are not automated. |
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
| NFR-41 Protected backups | Partial | `npm run backup`/`npm run restore` add file-store and optional `pg_dump` recovery with a destructive-restore confirmation; no scheduler, ACLs or recovery drill. |

## SRS sections 5 .. 15

| Section | Status | Note |
|---|---|---|
| 5 Cross-platform requirements | Partial | Web plus new Windows/macOS Electron wrappers share one backend via `PUBLIC_URL`; no signing, auto-update or offline mode. |
| 6 Non-functional requirements | Partial | Security, modularity and API documentation are addressed; SLO measurement, backups and observability are not. |
| 7 Technical architecture | Partial | Modular monolith, Node/TypeScript, REST/OpenAPI, WebSockets and Electron match the intent; stack substitutes FileStore/memory queue/plain JS for PostgreSQL/Redis/Next.js/NestJS. |
| 8 Database requirements | Partial | RLS-enabled schema, migration CLI and a tenant-scoped `PostgresStore` adapter exist; the adapter still needs staging validation against a live server. |
| 9 API requirements | Implemented | Versioned `/api/v1` REST API with consistent envelopes, errors, idempotency, RBAC and generated OpenAPI document. |
| 10 User interface requirements | Implemented | Single responsive interface covers all SRS 10 screens and role-adaptive navigation for web and desktop. |
| 11 Security and governance | Partial | RBAC, AI tool boundaries, approvals, audit log and untrusted-content policy text exist; no external security review or immutable audit store. |
| 12 Deployment and infrastructure | Partial | Multi-stage Dockerfile, compose stack, healthcheck, non-root runtime, backup/restore scripts and a monitoring endpoint exist; managed DB/Redis and alerting are not configured. |
| 13 Testing requirements | Partial | Eight Node test files run via `npm test`; no E2E, browser or cross-platform test automation. |
| 14 MVP and release strategy | Partial | Phases 1-6 capabilities are represented in the demo and wrappers exist; Windows/macOS installers are unsigned and Phase 7 expansion is out of scope. |
| 15 Acceptance criteria | Partial | Most functional criteria are demoable; backup/recovery, security test sign-off and real cross-client update verification remain open. |

## Explicitly not claimed

* `DATA_STORE=postgres` is wired through `PostgresStore`, but could not be validated against a live
  PostgreSQL server in this environment; validate in staging before production.
* No Redis/BullMQ adapter: the queue is persisted through the Store but polled in-process.
* No OAuth/provider credentials, SMTP delivery, Sentry or OpenTelemetry SDK integration.
* No code-signed or notarised Electron installers, and no auto-update mechanism.
* No scheduled backups, staging/production pipelines or cross-platform CI.
