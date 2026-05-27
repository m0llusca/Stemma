# Auth.js Ownership and Integration Hardening Design

Date: 2026-05-27

## Summary

Make Auth.js a primary runtime component of the application rather than a future side-track. Auth.js should own authentication handlers, sign-in/sign-out entry points, session cookies, and session lookup. The product domain still owns workspace membership, roles, permissions, SCIM/LDAPS lifecycle, group policy, audit events, and integration authorization.

This is a full ownership migration, not a facade-only wrapper. The current `qc_session` path becomes a compatibility path during migration and is removed after Auth.js-backed sessions are proven through tests and E2E.

The same hardening phase also raises the quality bar for the new Jira, YDB, YTsaurus, tRPC, and live-smoke integration components. Those integrations are now real product surface, so they need stronger contract validation, duplicate-submit safety, pagination/limit handling, and honest certification behavior.

## Goals

- Add Auth.js v5 as the main Next.js auth runtime with `auth.ts`, `handlers`, `auth()`, `signIn()`, and `signOut()`.
- Replace `getCurrentUser()` session lookup with Auth.js session lookup.
- Preserve existing users, roles, workspaces, identity providers, external identities, group mappings, SCIM/LDAPS lifecycle, and audit semantics.
- Use a custom Auth.js adapter instead of the standard Prisma adapter where the standard schema would erase project-specific fields or weaken revocation.
- Move local credentials into an Auth.js Credentials provider while keeping the existing `LocalCredential` model, password verification, lockout policy, and lifecycle checks.
- Move OIDC/Microsoft Entra interactive login into Auth.js provider/callback flow while reusing the current claims, groups, workspace-linking, and lifecycle policy code.
- Bridge SAML into Auth.js-owned session issuance while preserving existing SAML metadata, ACS validation, replay protection, and RelayState safety.
- Ensure SCIM/LDAPS deprovisioning revokes Auth.js sessions.
- Harden the new Jira/YDB/YTsaurus/tRPC integration components enough that they behave like production paths, not demos.

## Non-Goals

- Do not remove local users.
- Do not drop OIDC, SAML, SCIM, LDAPS, group mappings, or workspace roles.
- Do not replace product permissions with Auth.js authorization callbacks. Auth.js authenticates; the app authorizes.
- Do not switch to Auth.js JWT sessions if that prevents server-side SCIM/LDAPS revocation.
- Do not mark Jira/YDB/YTsaurus live-certified without protected live smoke evidence.
- Do not migrate the visual design system, shadcn/ui, Tailwind v4, Sentry, or OpenTelemetry in this slice.

## Current State

Auth is currently custom:

- `qc_session` stores an opaque browser token.
- `AuthSession.sessionTokenHash` stores the SHA-256 hash.
- `getCurrentUser()` reads the cookie, validates `AuthSession`, and returns the Prisma `User` with workspace.
- Local login uses `LocalCredential` and writes `AuthSession`.
- OIDC and SAML routes validate callbacks themselves and then write `AuthSession`.
- SCIM and LDAPS lifecycle code revokes `AuthSession` rows.
- `proxy.ts` checks for cookie presence, but real protection happens in server components/API through `getCurrentUser()` and `requireSessionApi()`.

This model is coherent, but it keeps the app responsible for framework-level auth plumbing. The hardening direction is to let Auth.js own the framework runtime while keeping enterprise identity policy in the application domain.

## Auth.js Runtime Shape

Add:

- `apps/web/auth.ts`
- `apps/web/src/auth/config.ts`
- `apps/web/src/auth/adapter.ts`
- `apps/web/src/auth/providers/local.ts`
- `apps/web/src/auth/providers/oidc.ts`
- `apps/web/src/auth/providers/saml-bridge.ts`
- `apps/web/src/app/api/auth/[...nextauth]/route.ts`

`auth.ts` exports:

- `auth`
- `handlers`
- `signIn`
- `signOut`

The route handler exports:

- `GET`
- `POST`

Auth.js database-session strategy is required. Sessions must be server-revocable and queryable by user/workspace because SCIM, LDAPS, admin session revocation, user suspension, and deprovisioning depend on server-side session invalidation.

## Custom Adapter

Use a custom Auth.js adapter that maps Auth.js runtime calls to project models.

Session methods:

- `createSession` creates an `AuthSession` row.
- `getSessionAndUser` hashes the incoming Auth.js session token, loads `AuthSession`, validates status/expiry/lifecycle, updates `lastSeenAt`, and returns the app `User`.
- `updateSession` refreshes expiry and metadata without changing domain ownership.
- `deleteSession` revokes the `AuthSession` row instead of physically deleting audit-relevant records.

The adapter must keep hashed session-token storage. If Auth.js expects a raw session token in adapter calls, only the browser cookie carries the raw token; the database stores the hash.

User/account methods:

- Existing `User` remains the canonical user table.
- Existing `ExternalIdentity` remains the canonical external account-link table.
- Existing `IdentityProvider` remains the canonical provider configuration table.
- Auth.js account methods map provider account ids to `ExternalIdentity`.
- Auth.js must not create users without workspace assignment.

This is the full-ownership path because Auth.js owns session issuance and lookup. The database storage remains domain-shaped through the adapter.

## `getCurrentUser()` Contract

`getCurrentUser()` remains the app-facing auth facade, but internally changes:

1. Call `auth()` to obtain the Auth.js session.
2. Resolve the session user id to the existing Prisma `User` with workspace.
3. Enforce lifecycle status.
4. Preserve the existing `AuthRequiredError` behavior.
5. Preserve demo fallback only when `QC_DEMO_AUTH=enabled`.

The rest of the app should continue calling `getCurrentUser()` or `requireCurrentUserPermission()`. Components and API routes should not call Auth.js directly unless they are auth routes or auth tests.

## Local Credentials Provider

Local credentials move into an Auth.js Credentials provider.

Required behavior:

- Validate login/password input.
- Normalize login through existing `normalizeLocalLogin()`.
- Look up `LocalCredential`.
- Enforce lockout window and failed-attempt counters.
- Verify the existing password hash/salt/key version.
- Refuse suspended/deprovisioned users.
- Reset failed counters on success.
- Create an Auth.js session through the provider flow.

The current login page can keep its UI, but submission should route through Auth.js `signIn("credentials")` or a server action that delegates to Auth.js.

Workspace ambiguity must be resolved before enabling production local credentials through Auth.js. The current lookup by global login conflicts with the schema's workspace-scoped uniqueness. The migration must choose one explicit rule:

- global login remains required for local credentials, enforced by validation and tests; or
- login form becomes workspace-aware.

Recommended first slice: preserve global login behavior and add a test that rejects ambiguous duplicate local credentials.

## OIDC and Microsoft Entra

OIDC/Entra move to Auth.js provider/callback flow after local credentials are stable.

Required reuse:

- Existing provider configuration validation.
- Existing issuer/JWKS/id-token validation assumptions.
- Existing claim extraction and group policy.
- Existing workspace/user/external-identity linking.
- Existing lifecycle checks.
- Existing audit events without raw token leakage.

Auth.js callbacks should call domain services for:

- resolving provider by slug/type/workspace;
- mapping external account to existing or new user;
- applying groups/app roles;
- recording safe audit metadata.

Do not duplicate claim mapping inside Auth.js callbacks. Auth.js is the runtime. The app's identity-policy modules remain the policy source.

## SAML Bridge

SAML is not a standard Auth.js OAuth provider in this codebase. The existing SAML route stack already owns metadata, ACS parsing, `InResponseTo`, replay protection, certificate handling, and RelayState safety. Those pieces remain domain services.

The migration changes only session issuance:

1. ACS validates `SAMLResponse` exactly as today.
2. ACS resolves or creates the app user through existing SAML identity mapping.
3. ACS creates a short-lived one-time internal assertion record or token.
4. Auth.js consumes that assertion through a dedicated SAML bridge provider.
5. Auth.js issues the final browser session.

The bridge must be one-time, short-lived, provider-scoped, and audited. Raw SAML responses are never stored in the Auth.js session or logs.

## SCIM, LDAPS, and Lifecycle

SCIM and LDAPS remain provisioning/lifecycle systems, not sign-in providers.

Hard requirements:

- Suspending or deprovisioning a user revokes all active Auth.js-backed sessions.
- Admin session revocation revokes Auth.js-backed sessions.
- Logout revokes the current Auth.js-backed session.
- During migration, revocation also cleans legacy `qc_session` rows/cookies.

Lifecycle helpers must not depend on a legacy-only session table after Auth.js takes over. If the custom Auth.js adapter writes `AuthSession`, the existing lifecycle helpers can be upgraded in place.

## Cookie and Proxy Strategy

Migration stages:

1. Add Auth.js cookie and route handlers while still accepting legacy `qc_session`.
2. Switch login paths to Auth.js issuance.
3. Switch `getCurrentUser()` primary lookup to Auth.js.
4. Make logout clear both Auth.js and legacy cookies.
5. Update `proxy.ts` to use Auth.js `auth` middleware or an equivalent validated session check.
6. Remove legacy-only `qc_session` creation after E2E and admin session management pass.

The proxy must not become a false security boundary. Server components and APIs continue using `getCurrentUser()` and permission guards.

## API and Authorization

Auth.js does not replace:

- `requireCurrentUserPermission`
- `requireSessionApi`
- `verifySameOrigin`
- product permission checks
- demo mutation blocking

Every state-changing API still requires same-origin checks and permission checks. Auth.js only supplies the authenticated principal.

## Integration Hardening Scope

The same hardening phase also upgrades the new integration work.

### Source Contracts

`assertIntegrationSourceContractSupported()` must reject:

- unknown `native_helpdesk` sources;
- unknown `data_source` sources;
- source/type mismatches;
- missing required secret slots for credentialed sources;
- invalid source-specific base URL schemes.

Failures should happen during setup, before a run/job is queued.

### Setup Queue Safety

Setup dry-run/save flows must prevent duplicate queued jobs from repeated form submissions:

- claim or reuse an in-flight setup run for the same workspace/source/mode;
- avoid creating multiple identical backend jobs on double-click;
- return a clear message when a run is already queued.

### Jira

Jira adapter hardening:

- paginate comments beyond the first page;
- preserve public/internal visibility;
- extract text from rendered body and object/ADF-like body payloads;
- redact authorization headers and sensitive query values;
- add fixture tests with more than 100 comments.

### YDB and YTsaurus

Data-source hardening:

- enforce source-specific config validation before requests;
- enforce row limits before normalization and database writes;
- add YTsaurus server-side row limiting where supported by the API request shape;
- reject empty normalized results unless the run is explicitly marked as connectivity-only;
- ensure diagnostics do not leak tokens, YDB credentials, table paths with embedded secrets, or raw query credentials.

### tRPC

tRPC remains for internal secretless UI procedures unless a secure secret channel is designed.

Hard requirements:

- unsafe tRPC requests require same-origin protection;
- admin mutations require `integrations:manage`;
- tRPC procedures must not silently accept credentialed source setup without secret fields;
- test mocks must match real return shape.

### Live Smoke

`test:live:phase-d` should include data-source smoke tests.

Data-source live smoke should require a non-empty normalized conversation for success unless the env explicitly requests connectivity-only validation. Certification evidence must remain opt-in and protected by live env gates.

## Testing Strategy

Auth.js tests:

- custom adapter stores only hashed session tokens;
- `auth()` session maps to existing `User` with workspace/role;
- local credentials preserve lockout and lifecycle checks;
- ambiguous local login is rejected or made workspace-aware according to the chosen rule;
- logout revokes Auth.js-backed session and clears legacy cookies during migration;
- SCIM/LDAPS lifecycle revokes Auth.js-backed sessions;
- OIDC/Entra callback preserves provider, workspace, groups, and lifecycle policy;
- SAML bridge preserves replay protection and safe RelayState;
- `requireSessionApi` still blocks CSRF and demo settings mutations.

Integration tests:

- unknown native/data sources rejected during setup;
- duplicate setup submits do not create duplicate jobs;
- Jira pagination and ADF/body fallback;
- YTsaurus row limit and empty-result policy;
- YDB config and limit edge cases;
- tRPC real return shape;
- `test:live:phase-d` includes data-source smoke.

Verification commands:

- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run test:live:data-source` without live env should skip safely
- `git diff --check`

## Rollout

1. Add Auth.js dependencies, `auth.ts`, route handlers, custom adapter skeleton, and tests.
2. Switch local credentials to Auth.js issuance behind a feature flag.
3. Switch `getCurrentUser()` primary lookup to Auth.js while retaining legacy fallback.
4. Switch logout/admin session revocation/lifecycle helpers to revoke Auth.js sessions.
5. Move OIDC/Entra into Auth.js provider/callback flow.
6. Add SAML bridge provider and migrate ACS session issuance.
7. Update proxy and E2E helpers.
8. Remove legacy `qc_session` issuance after migration tests pass.
9. Harden integration contracts, duplicate-submit safety, Jira pagination/body extraction, YDB/YTsaurus policies, tRPC contract honesty, and live smoke coverage.

## Risks

- Standard Auth.js PrismaAdapter is not safe for this project without schema/domain adaptation.
- SAML migration is the highest-risk auth slice because replay protection and ACS behavior are security-sensitive.
- Switching session cookies can break E2E helpers and demo auth if compatibility is not staged.
- JWT sessions would weaken server-side deprovision revocation; database sessions are required.
- Existing dirty working-tree changes must not be reverted or absorbed accidentally.

## Self-Review

- No placeholder sections remain.
- The design matches the user's selected option: Auth.js owns runtime/session behavior.
- Existing enterprise identity semantics are preserved through a custom adapter and domain callbacks.
- Auth.js authentication and product authorization remain separated.
- SAML and SCIM/LDAPS risks are explicit.
- Integration hardening items from the read-only audit are included.
- Rollout is staged so each high-risk auth slice can get subagent implementation and review gates.
