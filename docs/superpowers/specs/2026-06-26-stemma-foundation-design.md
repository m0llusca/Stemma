# Stemma Foundation Design

## Status

Approved in conversation on 2026-06-26.

This spec defines the first implementation phase for Stemma after selecting the "Foundation first" route. The phase builds the platform primitives that later integration, QA workflow, and visual redesign work will depend on.

## Goals

- Make the product open to the explicit login entry point by default.
- Move every authenticated page to a consistent fast app shell and data-loading boundary.
- Add a workspace-aware localization system with online administration.
- Add semantic data color tokens so good, risky, bad, and neutral metrics are visually distinct.
- Preserve the LDAP/runtime split by adding regression guards around route bundles and enqueue-only code.
- Prepare the integration install contract for a later one-click OAuth and webhook phase without implementing every connector in this phase.

## Non-Goals

- Full one-click OAuth for every declared source.
- Automatic webhook provisioning for every declared source.
- Complete visual redesign of every page.
- Full product-wide translation coverage in a single pass.
- Translation approval workflow, reviewer roles, machine suggestions, or bulk import/export in the first release.
- Live certification of external systems without real customer sandbox credentials.

## Current Context

The app is a Next.js App Router application in `apps/web`. The root route has already been changed to redirect to `/auth/login`, metadata now uses the Stemma name, and the app has an SVG favicon. The codebase has many hard-coded Russian UI strings, no existing localization model, and several authenticated pages that currently fetch page-specific data during server render.

The previous runtime issue was that enqueue-only routes could pull LDAP/worker modules through shared imports. Recent local changes introduced enqueue-specific modules, but this foundation phase must make that protection permanent with tests.

Next.js 16 App Router i18n guidance uses route or proxy-level locale detection and dictionary loading in Server Components. Intercom current stable OpenAPI uses `Intercom-Version: 2.15` for conversations. HubSpot CRM tickets and associated activity data remain part of the supported API surface. These references shape later implementation, but this phase only prepares the contract for deeper integrations.

## Phase Scope

### 1. Login-First Entry

`/` redirects to `/auth/login`. The login page remains the only default entry point when the service starts, including demo-enabled local development. Authenticated users who explicitly open a protected page keep the existing auth behavior.

### 2. Fast App Shell For All Authenticated Pages

Every authenticated page must use the same shell/data-loading pattern:

- `/dashboard`
- `/reviews`
- `/reviews/[conversationId]`
- `/self-review`
- `/calibration`
- `/coaching`
- `/reports`
- `/admin`
- `/admin/access`
- `/admin/appearance`
- `/admin/audit`
- `/admin/integrations`
- `/admin/integrations/new`
- `/admin/integrations/[integrationId]`
- `/admin/sampling`
- `/admin/scorecards`
- `/admin/system`
- `/admin/system/jobs/[jobId]`
- `/admin/tokens`
- `/admin/users`

`/auth/login` is not an authenticated shell page, but it must stay lightweight and use the localization runtime for visible strings.

The app shell must render stable navigation, topbar, theme, density, locale, and user/workspace context without waiting for heavy page data. Page-specific data loads behind Suspense/loading states or equivalent page-local boundaries. Large filters and quick views must keep stable dimensions so repeated toggles cannot create large blank gaps.

### 3. Workspace-Aware Localization

The localization system supports arbitrary BCP-47-style locale codes such as `ru`, `en`, `kk`, or `tr`. The first seeded and tested locales are `ru` and `en`.

Data model:

- `Locale`
  - `id`
  - `workspaceId`
  - `code`
  - `name`
  - `isDefault`
  - `isEnabled`
  - timestamps
- `TranslationKey`
  - `id`
  - `namespace`
  - `key`
  - `defaultText`
  - `description`
  - `ownerArea`
  - timestamps
- `TranslationValue`
  - `id`
  - `workspaceId`
  - `localeId`
  - `keyId`
  - `draftText`
  - `publishedText`
  - `publishedAt`
  - `publishedById`
  - `version`
  - timestamps
- `TranslationAudit`
  - `id`
  - `workspaceId`
  - `localeId`
  - `keyId`
  - `actorId`
  - `action`
  - `beforeText`
  - `afterText`
  - timestamp

Runtime behavior:

- `getDictionary(workspaceId, localeCode)` returns published values only.
- Fallback order is requested locale, workspace default locale, built-in `ru`, then key.
- Draft text never appears in normal product UI.
- Missing database values do not break pages because built-in dictionaries remain available.
- Translation keys are stable and namespaced, for example `dashboard.focus.title`.

Admin editor behavior:

- Admins can create arbitrary locale codes and enable or disable a locale.
- Admins can filter keys by namespace, missing translation, draft changed, and published state.
- Admins can edit draft text inline.
- Admins can publish a draft value.
- Admins can roll back a published value to the previous audited value.
- Admins can open a compact audit drawer for a translation key.

Future localization work is explicitly tracked outside this phase:

- Approval workflow with submit, approve, reject, and publish states.
- Translator and translation reviewer roles.
- Bulk JSON/CSV import and export.
- Side-by-side diff view between locales.
- Machine translation suggestions.
- Page preview in a selected locale and workspace theme.

### 4. Semantic Status Colors

Introduce one semantic status layer for data display:

- `positive`: healthy source, successful import, high score, SLA in range.
- `warning`: queue growth, soon-to-expire SLA, partial sync, limited support, no live certification.
- `negative`: failed import, overdue SLA, disconnected source, low score, blocking error.
- `neutral`: no data, no run yet, unassigned task, optional detail.
- `info`: learning state, planned job, system notice.

The semantic layer is used by metric formatters, badges, chips, compact table status cells, and source health indicators. It must replace one-off color choices on migrated surfaces.

First migrated surfaces:

- Dashboard focus and activity blocks.
- Review metadata chips.
- Integration cards and connected-source rows.
- Admin system health rows.

Chip typography and alignment must use a shared component or shared CSS tokens so label and value text share the same visual centerline.

### 5. Integration Install Contract

This phase prepares integration architecture without implementing all one-click flows.

Add or formalize an `IntegrationInstallContract` with:

- source id
- source family
- supported auth modes
- required scopes
- optional OAuth callback path
- webhook support flags
- health check operations
- test import operation
- certification state
- limitations shown to the user

The UI must distinguish:

- `available`
- `token-only`
- `oauth-ready`
- `webhook-ready`
- `live-certified`
- `limited`

If a source is not truly one-click yet, the UI must say so. It should not present token-only or limited-support sources as complete one-click integrations.

Phase 2 integration priority is:

1. Zendesk, Freshdesk, Intercom, HubSpot, Jira.
2. Salesforce, ServiceNow, Dynamics 365.
3. OTRS-family, YDB, YTsaurus.

Telegram, WhatsApp, Slack, and Microsoft Teams notification or conversation integrations are not part of this foundation phase. They belong to a later differentiator phase.

### 6. Performance And Runtime Guards

Add tests that prevent regressions where lightweight routes import heavy runtimes.

Required guards:

- Root and login entry behavior.
- Authenticated route smoke for all page routes listed in this spec.
- Bundle/import tests that fail if enqueue-only routes import LDAP modules, worker modules, or other disallowed runtime paths.
- Playwright regression for repeated quick-view toggles so the page cannot produce a large blank gap.
- Visual sanity screenshots for dashboard focus, review chips, integration list, and admin/system health.

The implementation plan should keep these guards close to the code they protect and use existing Vitest and Playwright patterns.

## Architecture Boundaries

### Localization Runtime

The runtime dictionary loader is server-first. It must avoid client-side global translation stores for normal page render. Client components receive already-resolved strings or narrow dictionaries for their local UI.

The runtime must not import Prisma into middleware/proxy. Any locale detection at proxy level uses cookies, path segments, headers, or a small static locale list. Workspace-specific database dictionaries are loaded only in server components, route handlers, or server actions.

### Localization Admin

The editor lives under admin routes and uses server actions or route handlers with existing permission checks. The editor should be compact and operational, not a marketing-style localization dashboard.

### Shell And Page Data

The shell loader returns a small `ShellSnapshot`. Page loaders are independent. A page can render shell, filters, and skeletons while its data resolves. Error states should be local to the content panel and must not collapse page layout.

### Semantic Colors

Semantic colors live in theme tokens and helper functions, not one-off Tailwind classes scattered across pages. Threshold decisions live in metric-specific helpers so the same value is treated consistently across dashboard, reports, and reviews.

### Integration Contracts

Install contracts live near existing integration capability/source-contract modules. The contract is typed and testable without live network calls. Live API behavior remains in adapter modules.

## User Experience Requirements

- The default first screen is the login page with real login and demo login choices.
- Authenticated navigation feels immediate because the shell remains stable.
- Loading states preserve layout size.
- Empty states explain what is missing without exposing internal codes.
- Localization admin can be used by non-engineers who understand product copy.
- Status colors improve scanning but do not rely on color alone; labels and icons still communicate state.
- Integration pages show honest readiness and limitations for each source.

## Testing Requirements

Unit tests:

- Locale creation validation, including arbitrary valid locale codes.
- Dictionary fallback order.
- Draft save, publish, rollback, and audit records.
- Semantic metric tone helpers.
- Chip alignment component output or CSS class contract.
- Integration install contract registry sanity.
- LDAP/worker import guards for enqueue-only routes.

Server/action tests:

- Permission checks for localization admin actions.
- Publishing uses only draft text for the targeted locale/key.
- Rollback creates audit and restores the previous published value.
- Disabled locale cannot be selected as active runtime locale.

E2E tests:

- `/` redirects to `/auth/login`.
- Login page renders without dashboard auto-entry.
- Authenticated navigation covers every page listed in this spec.
- Localization editor creates a locale, edits draft, publishes, and shows the translated value in a migrated UI surface.
- Quick-view toggling does not create a large blank vertical gap.

Visual checks:

- Dashboard focus block.
- Review chips.
- Integration list.
- Admin system health.

## Documentation Requirements

The implementation plan must create or update concise docs for:

- Localization architecture and fallback rules.
- Translation admin workflow and future work.
- App shell/data-loading pattern.
- Semantic status color usage.
- Integration install contract and Phase 2 source priority.

## Definition Of Done

- The root route and login behavior are covered by tests.
- Every authenticated page listed in this spec uses the shared shell/data-loading boundary.
- The localization database model exists and is migrated.
- `ru` and `en` are seeded and tested.
- Admins can create locales, edit drafts, publish values, roll back values, and see audit history.
- Built-in dictionary fallback prevents missing translations from breaking pages.
- Semantic status colors are used on the first migrated surfaces.
- Bundle/import guards prevent LDAP and worker runtime regressions.
- The integration install contract exists and makes readiness/limitations explicit in UI.
- `npm run test`, targeted Playwright checks, and `npm run typecheck` pass for the implemented scope.
- Local service still runs on `localhost:4000`.

## References

- Next.js App Router internationalization guidance: https://nextjs.org/docs/app/guides/internationalization
- Intercom OpenAPI conversation versioning: https://github.com/intercom/intercom-openapi
- HubSpot CRM tickets API: https://developers.hubspot.com/docs/api-reference/latest/crm/objects/tickets/guide
- Zendesk Ticketing API: https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/
- Freshdesk API: https://developers.freshdesk.com/api/
- Jira Service Management REST API: https://developer.atlassian.com/cloud/jira/service-desk/rest/
- Microsoft Dataverse Web API: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview
- Telegram Bot API: https://core.telegram.org/bots/api
- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
