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

## Source Documentation Gate

Before changing adapter runtime behavior, the implementer must check the current official vendor documentation. Use Context7 first when it has official coverage. If Context7 does not return a useful official source, use the vendor's official developer documentation directly and record the `checkedAt` date in the source contract.

Contract documentation older than 120 days is stale for runtime changes. A stale contract can remain in the registry, but the adapter cannot be promoted to a deeper readiness state until the docs are refreshed.

## Phase 2 Notes

Phase 2 should connect OAuth and live certification for priority sources in this order:

1. Zendesk, Freshdesk, Intercom, HubSpot, Jira.
2. Salesforce, ServiceNow, Dynamics 365.
3. OTRS-family, YDB, YTsaurus.

OAuth readiness should include redirect start, callback handling, token storage, refresh behavior where applicable, required scopes, and failure copy. Live certification should include health check evidence, test import evidence, and user-visible limitations for any unsupported data shape.
