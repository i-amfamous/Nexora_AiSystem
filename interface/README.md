# Nexora interface

The user interface for Nexora, the unified business operating platform described in `NEXORA.docx` (SRS v2.0). It covers every screen in SRS section 10 and the functional areas behind them. The client ships with an empty data shell; all workspace records come from the authenticated backend.

## Run it

Run the API (`npm start` from the repository root) and open the served client; the static files need no build step.

- Register the first workspace, then sign in with the credentials you created.
- Navigation adapts to the signed-in role: owner, administrator, department manager, sales, support, inventory and finance.
- Press `Ctrl K` (or `Cmd K` on a Mac) to search customers, orders, products and invoices, or to jump to any page.
- Use the moon icon in the top bar to switch between light and dark themes.

## Screens and the SRS requirements they cover

| Screen | Route | SRS |
|---|---|---|
| Sign in, register business, reset password | `#/auth/login`, `#/auth/register`, `#/auth/forgot` | FR-01, FR-02 |
| Overview dashboard with date filter | `#/overview` | 10.2, FR-12.1 to FR-12.3 |
| Unified inbox: channels, assignment, priority, category, AI or human handling, takeover, hand back, internal notes, AI drafts, tool lookups, delivery status, WhatsApp 24 hour window | `#/inbox/:id` | 10.3, FR-04, FR-11 human takeover |
| Customers: search, tag filter, sort, duplicate detection and merge, profile drawer with conversations, orders and notes | `#/customers` | FR-05 |
| Sales pipeline (drag and drop), follow-up activity, sales reports | `#/sales` | FR-06.1 to FR-06.4, FR-06.11 |
| Orders: status filter, multi-line order builder, stock warnings, history, server-calculated totals | `#/orders` | FR-06.5 to FR-06.12 |
| Products, stock movements, suppliers, purchase requests, adjustments that block negative stock | `#/inventory` | FR-07 |
| Invoices, payments (verified by provider vs manually recorded), expenses, summary | `#/finance` | FR-08 |
| People, departments, roles and permissions matrix, invite, revoke access | `#/employees` | FR-03, 3.9, 11.1 |
| Tasks board and list, overdue flags, AI-created tasks | `#/tasks` | FR-09 |
| Workflows (when, if, then), approval gates, run history with retries | `#/automation` | FR-10 |
| AI agents: six predefined agents, three automation levels, tool permissions, locked high-risk actions, usage limits, communication policy, approvals queue, execution history | `#/agents` | 10.4, FR-11, 11.2, 11.3 |
| Analytics with AI summaries traceable to source records | `#/analytics` | FR-12 |
| Integrations by category with connect, reconnect and disconnect | `#/integrations` | FR-13 |
| Notifications panel and preferences | Bell icon, `#/settings/notifications` | FR-14 |
| Audit log (read only), sessions across web, Windows and macOS, desktop apps, data export and retention | `#/settings/*` | FR-15, 5.1, NFR-37 to NFR-40 |

Navigation adapts to the signed-in role (SRS 10.1), and pages a role cannot use show a clear message instead of the content. The interface notes throughout that the server enforces permissions (SRS 11.1).

## Design system

All tokens live at the top of `assets/css/nexora.css` as CSS custom properties, with a separately tuned dark theme.

- Colour: neutral surfaces, one forest green accent (`#1E5B45`), status colours used only for state (success, warning, error, info) and a muted violet that always means "AI". No gradients.
- Type: system UI font stack, 14 px base, tabular figures for every number and amount.
- Shape: 8 px controls, 12 px cards, hairline borders, shadows only on floating layers (menus, dialogs, drawers).
- Charts: drawn at real pixel size with a hover tooltip, one y axis, legends for multi-series charts.
- Accessibility: keyboard focus rings, Escape closes overlays, Enter opens focused rows, labelled controls, reduced motion respected, responsive down to tablet and narrow widths.

## Moving to the production stack

The SRS specifies Next.js, Tailwind CSS and Electron (7.2, 5.4). This prototype has no dependencies so it runs anywhere today, and it maps cleanly onto that stack:

- `assets/css/nexora.css` tokens become the Tailwind theme (`colors`, `borderRadius`, `fontFamily`).
- Each `A.views.*` function in `assets/js/views-*.js` becomes a Next.js route; `ui.js` helpers become shared components (Modal, Drawer, Menu, Toast, Field, Chart).
- `assets/js/data.js` defines the empty client shell for the entity groups in SRS 8.2/9.2; `NXApi.applyBootstrap` fills it in place from `/api/v1/...` without replacing `window.NX`.
- The same pages load inside Electron for the Windows and macOS apps.

## Files

```
interface/
  index.html
  assets/css/nexora.css        design tokens and components
  assets/js/icons.js           line icon set
  assets/js/data.js            empty client shell (bootstrap-populated)
  assets/js/ui.js              formatting, dialogs, drawers, menus, toasts, charts
  assets/js/app.js             shell, routing, roles, search, notifications
  assets/js/views-core.js      sign in, overview, inbox, customers
  assets/js/views-ops.js       sales, orders, inventory, finance, employees, tasks
  assets/js/views-ai.js        automation, AI agents, analytics, integrations, settings
```
