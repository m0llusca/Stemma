# Enterprise Production Hardening Design

## Context

The app is already a working support quality control platform with a Next.js web app in `apps/web`, PostgreSQL and Prisma, admin sections for integrations, users, access/SSO, scorecards, reports, review workflow, API tokens, jobs, and audit logs.

The current working tree already contains an admin redesign and auth/demo changes. This design must build on that state without reverting unrelated local work.

The requested target is not a demo or pilot. The target is an enterprise-ready production platform with polished UI, certified integrations, point-based quality language, and complete enterprise identity support.

## Goals

1. Add contextual help in the interface through question-mark help triggers with hover and keyboard focus behavior.
2. Polish UI alignment across admin, review, reports, integrations, and access pages so headers, tabs, tables, forms, actions, and cards are consistent and do not overlap or overflow.
3. Recheck all integrations against official documentation and harden backend, API, and frontend behavior.
4. Rename quality score presentation from percent to points while keeping the existing normalized `0..100` numeric model.
5. Deliver enterprise identity support for Entra/OIDC, SAML 2.0, SCIM 2.0 inbound provisioning, and direct Active Directory over LDAPS.
6. Make every production claim explicit through certification gates.

## Non-Goals

- Do not silently change the meaning of `Review.totalScore`. It remains a normalized `0..100` number.
- Do not label a connector or identity provider as production-ready unless its required gates pass.
- Do not require live secrets for ordinary local test runs. Live certification stays opt-in and protected.
- Do not treat Windows Group Policy Objects as a direct product integration. In this app, group policy means directory groups, app roles, provisioning groups, and application authorization policy.

## Recommended Approach

Use one umbrella enterprise release with independent certification gates.

All requested capabilities are in target scope, but every adapter and provider has a visible readiness state. A source can be implemented and contract-certified before it is live-certified. The UI must be honest: if live access is missing, the status is "Ожидает доступы" or "Готово к живой сертификации", not "Готово к промышленной эксплуатации".

This avoids a fragile big-bang release while still designing the complete production architecture.

## Architecture

### Certification Registry

Create a typed registry for integration and identity capabilities. The current `integrationCapabilities` should evolve from a UI catalog into a production registry.

Each registry entry should include:

- stable internal key;
- Russian display name;
- adapter type;
- supported auth modes;
- supported operations;
- supported webhook events;
- required secret slots;
- official documentation references;
- normalized payload contract;
- fixture coverage;
- stub coverage;
- contract test status;
- live certification status;
- last certification timestamp;
- known limitations;
- UI actions allowed for the current state.

Internal machine keys remain ASCII. User-facing status labels are Russian.

### Adapter Boundary

Every external system should use a consistent adapter boundary:

- `capabilities`
- `diagnose`
- `search` or `preview`
- `normalize`
- `import` or `provision`
- `webhookIngest`, where supported
- `redact`
- `buildExternalUrl`
- `certificationChecks`

Unsupported operations should return explicit structured results, not generic runtime failures.

### Verification Harness

Each adapter must have:

- official-docs checklist;
- typed fixtures;
- contract tests;
- local stub server or stub route;
- API route tests;
- redaction tests;
- UI readiness rendering tests;
- optional live smoke test gated by environment variables.

Live smoke jobs must never run by default and must use protected credentials.

## UI and Interaction Design

### Help Tooltip Primitive

Add a shared help component for labels, headings, metrics, and potentially dangerous actions.

Behavior:

- render a compact question-mark trigger;
- use a lucide icon where possible;
- work on hover and focus;
- support keyboard users;
- use `aria-describedby`;
- avoid layout shift;
- wrap safely inside tables and forms;
- support short Russian help copy;
- never cover the related control in a way that blocks interaction.

Initial high-value placements:

- integration certification states;
- integration credentials and secret refs;
- OTRS/Znuny/OTOBO route variants;
- API token scopes and expiration;
- SSO provider fields;
- group mapping priority;
- SCIM provisioning token;
- LDAPS bind/search settings;
- scorecard weights versus score points;
- report score deltas.

### Layout Contract

Introduce a consistent admin layout contract for:

- `command-center`;
- `ops-panel__header`;
- section tabs;
- `ops-table` headers and rows;
- form grids;
- action groups;
- metric cards;
- status strips.

Requirements:

- headers align consistently across pages;
- border radii and header borders line up;
- long Russian labels wrap without overlap;
- long IDs, URLs, group names, ticket IDs, and provider names do not break layout;
- action buttons do not squeeze table content;
- mobile pages do not create horizontal overflow except intentional code/table scroll areas;
- tabs remain readable and aligned on narrow screens.

### Russian Certification Statuses

Use Russian labels in the admin UI. Suggested mapping:

- `docs_checked`: "Документация проверена"
- `contract_certified`: "Контрактные тесты пройдены"
- `stub_certified`: "Сертификация на заглушке пройдена"
- `live_certified`: "Живая сертификация пройдена"
- `ready_for_live_certification`: "Готово к живой сертификации"
- `waiting_for_access`: "Ожидает доступы"
- `limited`: "Есть ограничения"
- `not_production_ready`: "Не готово к промышленной эксплуатации"
- `configuration_required`: "Нужна настройка"
- `secret_required`: "Ожидает секрет"
- `certificate_required`: "Ожидает сертификат"

The UI may show grouped progress, but it must not collapse these into ambiguous "готово".

## Quality Score Language

The score model remains normalized:

- `Review.totalScore` remains a number from `0` to `100`;
- existing database range constraints remain valid;
- existing API clients can continue reading `totalScore`;
- no score migration is needed.

Presentation changes:

- final quality score is shown as "баллы", not "%";
- examples: "92 балла", "Средняя оценка: 88 баллов";
- chart suffixes for quality score use "баллов";
- deltas use "п." or "балла" depending on context;
- report exports use point language;
- OpenAPI and API examples describe `totalScore` as normalized points.

Scorecard weights can remain weights. The UI must distinguish:

- criterion weight: "Вес критерия";
- final score: "Итоговая оценка в баллах".

This prevents confusion without changing score math.

## Integration Backend and API Design

### Source Coverage

The target source list is:

- OTRS CE 6;
- Znuny;
- OTOBO;
- Custom API;
- Generic webhooks;
- Zendesk;
- Freshdesk;
- Intercom;
- HubSpot Service Hub;
- Salesforce Service Cloud;
- ServiceNow CSM;
- Dynamics 365 Customer Service.

OTRS-family remains the deepest current production slice. Other sources must become real adapters with documentation checks, fixtures, stubs, API routes where needed, and honest certification states.

### Official Documentation Rule

Before implementing or changing a connector, fetch current official documentation. Prefer Context7 when it has the source. If Context7 lacks useful coverage for a product, use the vendor's official docs directly.

Initial docs signals already checked during design:

- Zendesk ticket import should verify ticket and comment endpoints, including `GET /api/v2/tickets/{ticket_id}/comments`, auth behavior, pagination, attachments, private comments, and webhooks.
- Freshdesk should verify ticket view with conversations, the dedicated ticket conversations endpoint, API-key auth, conversation pagination, private notes, and attachments.
- Microsoft Graph/Entra should verify group claims, app roles, provisioning APIs, Graph group permissions, and least-privilege access for group fallback.

Implementation must extend this audit to Intercom, HubSpot, Salesforce, ServiceNow, Dynamics, OTRS, Znuny, and OTOBO before those adapters are changed.

### API Hardening

Harden v1 API behavior for enterprise use:

- stable machine-readable error codes;
- request IDs in responses and logs;
- idempotency for imports and webhook ingest;
- cursor or pagination metadata;
- typed validation errors;
- redacted diagnostics;
- rate limit metadata where relevant;
- OpenAPI examples for each certified operation;
- status fields that distinguish contract certification from live certification.

API responses may include Russian labels for UI convenience, but machine fields must remain stable and language-neutral.

### Webhooks and Custom API

Custom API and webhook ingestion should be treated as first-class production integrations:

- strict schema validation;
- HMAC verification for webhooks;
- replay/idempotency protection;
- endpoint-level status and last error;
- payload redaction;
- audit logs;
- OpenAPI documentation;
- test fixtures for success, duplicate, malformed, unauthorized, and oversized payloads.

## Enterprise Identity Design

### Entra and OIDC

Harden the existing Entra/OIDC path:

- preserve authorization code with PKCE;
- validate issuer, audience, expiration, nonce, and signature;
- cache JWKS safely;
- force secret references to env or vault-style refs for production;
- support app roles and groups;
- handle group overage through Microsoft Graph when configured;
- keep least-privilege permissions visible in admin guidance;
- audit login, provider changes, sync, and mapping changes.

### SAML 2.0 Service Provider

Add SAML as a real provider, not just a selectable type.

Required features:

- SP metadata endpoint;
- ACS endpoint;
- signed assertion validation;
- certificate fingerprint and rotation support;
- NameID/email/display name mapping;
- groups and roles claim mapping;
- replay protection;
- clock skew handling;
- clear setup checklist in admin UI;
- tests with signed fixtures.

### SCIM 2.0 Inbound Provisioning

Add SCIM 2.0 inbound provisioning for enterprise IdPs.

Required endpoints:

- `/scim/v2/ServiceProviderConfig`
- `/scim/v2/Schemas`
- `/scim/v2/ResourceTypes`
- `/scim/v2/Users`
- `/scim/v2/Users/{id}`
- `/scim/v2/Groups`
- `/scim/v2/Groups/{id}`

Required behavior:

- bearer token auth;
- create users;
- update users;
- deactivate users;
- sync group membership;
- idempotent external IDs;
- pagination and filtering sufficient for common IdPs;
- SCIM error format;
- audit logs;
- provider-scoped mapping.

SCIM unlocks Entra provisioning, Okta, Ping, OneLogin, Google Cloud Identity, and Keycloak without bespoke user import flows.

### Active Directory over LDAPS

Add direct AD/LDAPS as a production adapter for on-prem installations.

Required features:

- service account bind;
- TLS and custom CA validation;
- configurable user and group search bases;
- user filter and group filter;
- nested group resolution;
- paged results;
- disabled-account detection;
- dry-run sync preview;
- scheduled sync through backend jobs;
- sync result ledger;
- redacted diagnostics;
- clear admin setup checklist.

LDAPS sync is separate from interactive login. It provisions and updates users/groups. This release does not add LDAP password authentication because enterprise login is covered by OIDC and SAML.

### Policy Model

Fix and extend group/app-role policy:

- mapping priority must be deterministic and match the UI text;
- lower priority number applies first;
- provider-scoped uniqueness prevents collisions between providers;
- `VIEWER` can be assigned where product permissions allow it;
- user lifecycle includes active, suspended, and deprovisioned states;
- team and support-line can map from claims or directory attributes;
- deprovisioned users cannot keep active sessions;
- sync and deprovision actions are audited.

## Data Model Direction

Expected data changes:

- certification metadata for integrations and providers, either normalized tables or carefully typed JSON fields;
- provider-scoped group mapping uniqueness;
- user lifecycle status;
- source-of-truth provider marker;
- last directory sync fields;
- optional team/support-line source metadata;
- SCIM external IDs and group membership links;
- SAML certificate metadata;
- LDAPS adapter config fields with secret refs;
- certification run records for live smoke and contract checks.

Implementation planning should choose the least disruptive schema shape that still supports querying admin readiness and audit history.

## Error Handling and Security

Security requirements:

- never log raw secrets;
- do not include `clientSecretRef` values that may be inline secrets in audit metadata;
- redact upstream URLs and auth query strings;
- store only secret refs or encrypted secret slots;
- separate public UI labels from machine-readable statuses;
- fail closed on provider and connector uncertainty;
- protect live smoke with explicit env flags;
- ensure disabled/deprovisioned users lose access;
- audit all security-relevant admin actions.

Error messages should be safe, Russian in UI, and actionable.

## Testing and Verification

Required test layers:

- score label and formatter unit tests;
- adapter contract tests for every source;
- normalizer fixture tests;
- stub integration tests;
- API route tests for validation, auth, idempotency, errors, request IDs, and OpenAPI;
- SCIM route tests;
- SAML signed assertion tests;
- OIDC/Entra claims and group overage tests;
- LDAPS parser/sync tests with stubbed directory responses;
- policy resolver tests;
- redaction tests;
- audit tests;
- Playwright UI tests.

Visual QA routes:

- `/admin`
- `/admin/integrations`
- `/admin/integrations/new`
- `/admin/integrations/[integrationId]`
- `/admin/access`
- `/admin/users`
- `/admin/scorecards`
- `/admin/tokens`
- `/admin/system`
- `/reports`
- `/reviews`
- `/reviews/[conversationId]`
- `/calibration`
- `/self-review`

Viewports:

- 390px mobile;
- 768px tablet;
- 1280px desktop;
- 1440px wide desktop.

Checks:

- no unintended horizontal overflow;
- no overlapping text or controls;
- readable long Russian labels;
- readable long IDs and URLs;
- aligned header borders;
- usable table/card layouts;
- tooltip hover and focus behavior;
- certification labels in Russian.

## Rollout Phases

The target scope is complete enterprise readiness, but implementation should land in safe phases.

### Phase A - Foundation and Current Surface

- certification registry;
- Russian readiness labels;
- help tooltip primitive;
- admin layout contract;
- score wording from percent to points;
- OTRS/custom/webhook hardening;
- current OpenAPI cleanup;
- visual QA sweep.

### Phase B - Helpdesk and CRM Adapters

- Zendesk adapter;
- Freshdesk adapter;
- Intercom adapter;
- HubSpot adapter;
- Salesforce adapter;
- ServiceNow adapter;
- Dynamics adapter;
- fixtures, stubs, docs audit, contract tests, and UI readiness states for all.

### Phase C - Enterprise Identity

- Entra/OIDC hardening;
- SAML 2.0 SP;
- SCIM 2.0 inbound;
- AD/LDAPS adapter;
- user lifecycle and deprovisioning;
- deterministic policy resolver;
- provider-scoped mappings.

### Phase D - Live Certification and Readiness Report

- live smoke per available tenant;
- certification evidence in admin UI;
- production readiness report;
- status remains "Ожидает доступы" where live credentials are unavailable.

## Acceptance Criteria

The release is acceptable when:

1. UI help exists where admins need domain context and works with keyboard focus.
2. Key pages pass the viewport sweep without overlap or unintended overflow.
3. Quality score is presented as points everywhere user-facing.
4. Score math and stored `totalScore` compatibility remain unchanged.
5. Every integration has a registry entry, adapter boundary, official-docs checklist, fixtures, and a clear Russian readiness status.
6. Implemented integrations have contract tests and stub coverage.
7. Live certification is recorded only for systems with real protected credentials.
8. Entra/OIDC, SAML, SCIM, and AD/LDAPS are real implemented provider paths, not only UI options.
9. Group/app-role policy priority is deterministic and matches admin copy.
10. Deprovisioned users cannot retain active access.
11. API responses expose stable machine statuses and safe error codes.
12. Secrets and upstream auth material are redacted from logs, diagnostics, and audits.

## Open Implementation Decisions

These decisions should be made in the implementation plan, not during brainstorming:

- normalized certification tables versus typed JSON metadata;
- exact dependency choice for SAML and LDAP;
- whether each adapter uses a shared HTTP client wrapper immediately or after the first two adapters;
- exact live smoke command names and CI wiring;
- whether SCIM is exposed under `/api/v1/scim` or `/scim/v2`.

The implementation plan must resolve these before code changes begin.
