<claude-mem-context>
# Memory Context

# [qc_app] recent context, 2026-05-12 10:50am GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,428t read) | 248,449t work | 92% savings

### May 12, 2026
1849 10:24a ✅ OTRS client: SessionCreate failures classified as auth_failed
1850 10:25a 🟣 OTRS diagnostics now performs SessionCreate handshake before TicketSearch/TicketGet when configured
1851 10:26a 🟣 OTRS import-plan: reuse a single SessionID across TicketSearch and preview TicketGet calls
1852 10:28a 🟣 OTRS connection form UI: per-operation auth flow selectors and SessionCreate path field added
1853 10:29a 🟣 OTRS webservice checklist UI now reflects SessionCreate operation and per-op auth modes
1854 " 🟣 OTRS family capabilities advertise session_create auth mode alongside user_password and tls_ca_bundle
1855 10:31a 🔵 OTRS config canonical defaults test does not yet include the new auth section
1856 " 🔴 Vitest run surfaces one diagnostics test failure (deriveDiagnosticStatus) plus malformed test file
1857 " 🟣 OTRS test coverage extended: config defaults include auth, new SessionCreate→TicketSearch integration test
1858 10:32a 🟣 OTRS diagnostics test: end-to-end SessionCreate → TicketSearch → TicketGet pipeline test added
1859 " 🔴 All five OTRS-family test suites pass after schema and feature additions
1860 " 🟣 OTRS import-plan test: SessionCreate authenticates TicketSearch in preview flow
1861 " 🔴 Test body assertions corrected: OtrsOperationRequest.body is already an object, not a JSON string
1862 " 🔵 saveOtrsIntegrationConfiguration persists configJson with userLogin, limits, tls, and no secrets
1863 10:33a 🔴 Full OTRS test + typecheck suite green: 102 tests pass, no TS errors
1864 10:34a 🟣 OTRS live-smoke script: env-driven config overrides and session-flow support
1865 " 🟣 OTRS live-smoke env parsers added: parseAuthEnv and parseMethodEnv
1866 " 🟣 OTRS live-smoke docs: SessionCreate-based recipe documented
1867 " 🔴 Final OTRS test + typecheck pass after live-smoke script and docs updates
1868 10:35a 🟣 Live OTRS smoke test against production otrs.fsa.gov.ru succeeded end-to-end
1869 " ✅ Production Next.js build passes after OTRS session-flow feature work
1870 " ✅ OTRS session-flow change set: 15 files modified, 1 new file
1871 10:36a 🔵 Diff stat confirms feature scope: +572/-50 lines across 15 files plus 1 new module
1872 " 🔄 OTRS import-plan: previewSessionId no longer creates session when only TicketSearch needs it in manual mode
1873 " 🔴 Import-plan test suite + typecheck pass after previewSessionId refinement
1874 " ✅ Final production build re-verified after previewSessionId refinement
1875 10:37a 🔵 Final OTRS config schema layout confirmed
1876 " 🔵 Final landed code for requests.ts, session-auth.ts, and otrs-connection-form.tsx confirmed
1877 " 🔵 Final OTRS diagnostics + import-plan + live-smoke landed code confirmed
1878 10:38a 🔵 Docker daemon not running on dev workstation
1879 " ✅ Docker Desktop started: client/server 29.4.2 ready
1880 " ✅ Local Postgres container started via compose
1881 " 🔵 Zsh refused to assign to "status" variable in shell script
1882 " 🔵 Local Postgres healthy and Prisma schema is up to date
1883 " 🔵 qc_app-postgres-1 confirmed running postgres:16-alpine on host port 55432
1884 10:39a ✅ Local dev environment ready: Next.js dev server on :3000 plus seeded Postgres
1885 " 🔵 Dev server responds with 307 redirect from / to /reviews
1886 10:40a 🔵 App auth uses identity providers (DEMO + Microsoft/AD/OIDC/SAML), no local password column on User
1887 10:41a 🔵 Auth session model: opaque session token cookie qc_session with 12h TTL, no password verification on local login
1888 " 🔵 Prisma User and IdentityProvider models confirmed: no password column, federated identity tables
1889 10:42a 🔵 Auth middleware (proxy.ts), cookie config, and current-user resolution mapped
1890 " 🟣 Prisma schema: new LocalCredential model adds password-based auth support
1891 " 🟣 Local-credentials password helper module added (scrypt-based)
1892 10:43a 🟣 Local credentials: Prisma migration SQL and signInWithLocalCredentials server action added
1893 " 🟣 Login page UI updated: primary local username+password form, demo dropdown collapsed under details
1894 " ✅ Prisma migration applied: LocalCredential table added to local Postgres
1895 " 🔴 tsx inline import failed: local-credentials module did not expose hashLocalPassword via the file-relative path
1896 10:44a 🟣 Local admin user created: dubrovskyrk@local.qc with password-based login
1897 " 🔵 Dev server traffic log shows app served pages including /reviews, /calibration, /auth/logout, and /auth/login
1898 10:50a 🔵 User asks what is needed to test OTRS integration
S477 Prerequisites for real-world testing of OTRS integration, plus local auth setup via LocalCredential (May 12 at 10:50 AM)
**Investigated**: The primary session addressed what is required to actually test the OTRS integration end-to-end, and worked on local authentication using a new `LocalCredential` Prisma model and a new login form.

**Learned**: The project has an OTRS integration component that is ready (or near ready) for real validation, and authentication is being handled locally via a Prisma `LocalCredential` model consumed by a Next.js app.

**Completed**: A user record was created in the database to support local login. The new `LocalCredential` Prisma model and a corresponding new login form have been wired into the codebase.

**Next Steps**: Restart the dev server so Next.js and Prisma Client pick up the new `LocalCredential` model and the new login form, then proceed toward exercising the OTRS integration with real credentials/instance.


Access 248k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

# Project Notes

- Web app lives in `apps/web`.
- Use `npm install` from `apps/web` before running app commands.
- Local database is PostgreSQL via Docker Compose at `localhost:55432`; Prisma schema and migrations live in `apps/web/prisma`.
- Primary commands: `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run typecheck`.
