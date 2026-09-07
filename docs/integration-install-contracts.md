# Integration Install Contracts

Integration install contracts describe what Stemma can honestly offer for each source. They are a typed readiness and UI contract, not proof that every source has a complete one-click install flow.

Registry code lives in:

- `apps/web/src/lib/integrations/install-contracts/types.ts`
- `apps/web/src/lib/integrations/install-contracts/registry.ts`

## Install States

- `available`: source is listed, but setup readiness is generic or incomplete.
- `token-only`: source can be configured with pasted token/basic credentials; do not present this as one-click.
- `oauth-ready`: OAuth redirect/callback flow is implemented enough for product setup.
- `webhook-ready`: webhook callback support is implemented and wired for install.
- `live-certified`: live sandbox or customer credentials have validated health checks and import behavior.
- `limited`: support is intentionally constrained; setup and UI must explain the limitation.

Token-only and limited sources must not be marketed or labeled as one-click installs.

## Contract Fields

- `source`: stable source id used to look up the contract.
- `family`: broad source group such as native helpdesk, enterprise, data source, or OTRS-family.
- `displayName`: user-facing source name.
- `installState`: current honest readiness state.
- `authModes`: supported credential or OAuth modes.
- `requiredScopes`: scopes or permissions needed for the declared operations.
- `callbackPath`: OAuth or webhook callback path when the source has one.
- `supportsWebhooks`: whether webhook support is part of the declared contract.
- `healthChecks`: operations used to verify credentials or source availability.
- `testImport`: fixture, probe, or live import capability plus command and notes.
- `certificationState`: summarized certification gates for docs, contract, stub, and live access.
- `limitations`: user-visible constraints that must be shown before setup.

## Contributor Rules

- Keep the registry declarative and testable without live network calls.
- Add limitations whenever OAuth, webhook provisioning, import depth, or live certification is incomplete.
- UI should prefer the contract over optimistic source names when showing readiness.
- Do not infer `live-certified` from docs or stubs. It requires real live credentials and recorded certification evidence.
- Keep adapter behavior in adapter modules; keep install readiness in the contract registry.

## Connection / channel chips

Admin connection, messaging-channel, and catalog-readiness badges use `integrationConnectionTone` / `messagingChannelTone` / `catalogReadinessTone` (`apps/web/src/lib/integrations/connection-tone.ts`). Green only when certification is `live_certified`. Operational `ready` / `active` and catalog `production_slice` are warning without live cert. The integrations `certifiedSources` stage counts only `live_certified`. Admin hub cards and pipeline stages use the same module (`adminHub*`, `*PipelineStageTone`): no green without live cert or full stage coverage; appearance stays neutral. QA hub overview must not inherit a cert-green «Настройки в рабочем состоянии».

List/detail copy uses the same honesty bar (`capabilityReadinessLabel`, `readinessActionLabel`, `compactCertificationLabel`, `integrationOpsStatusLabel` in `apps/web/src/lib/integrations/labels.ts`). Dual status columns: **«Статус подключения»** is ops, **«Сертификация»** is cert — never show cert under connection state. «Готово к эксплуатации» / «Активна» only after `live_certified`.

See [semantic-status-colors.md](semantic-status-colors.md).

Probe/OTRS copy: cert badge **«Сертификация»**, operational step **«Шаг»** — do not reuse **«Готовность»** for both. Adapter detail panel title: **«Операционный профиль»** (steps: **«Операционные шаги»**). OTRS diagnostics footer: **«Диагностика ≠ живая сертификация»** (`apps/web/src/lib/integrations/probe-honesty.ts`). Save/connect uses `probeBeforeSaveGate`: block a live-ready claim without `live_certified`; warn fail-closed on activate/config. `/admin/channels` is outgoing notifications, not source integrations or SSO.

## Source Documentation Gate

Before changing adapter runtime behavior, the implementer must check the current official vendor documentation. Use Context7 first when it has official coverage. If Context7 does not return a useful official source, use the vendor's official developer documentation directly and record the `checkedAt` date in the source contract.

Contract documentation older than 120 days is stale for runtime changes. A stale contract can remain in the registry, but the adapter cannot be promoted to a deeper readiness state until the docs are refreshed.

## Phase 2 Notes

Phase 2 should connect OAuth and live certification for priority sources in this order:

1. Zendesk, Freshdesk, Intercom, HubSpot, Jira.
2. Salesforce, ServiceNow, Dynamics 365.
3. OTRS-family, YDB, YTsaurus.

OAuth readiness should include redirect start, callback handling, token storage, refresh behavior where applicable, required scopes, and failure copy. Live certification should include health check evidence, test import evidence, and user-visible limitations for any unsupported data shape.
