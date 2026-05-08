<claude-mem-context>
# Memory Context

# [qc_app] recent context, 2026-05-08 5:12pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (23,531t read) | 2,721,774t work | 99% savings

### May 8, 2026
1374 4:15p ✅ Task 12 spec compliance review dispatched after agent thread limit cleared
1375 4:16p ✅ Task 12 spec compliance review APPROVED
1376 " ✅ Task 12 code quality review dispatched (Kuhn)
1397 4:17p 🔵 Task 12 OTRS production integration code review requested
1378 4:18p ✅ Task 12 code quality review APPROVED
1379 4:19p ✅ Plan moved to final integration check stage
1380 " 🔵 Final branch state: only AGENTS.md remains modified, all OTRS work committed
1381 " 🔵 OTRS branch full commit sequence and call-site sweep verified
1382 4:20p 🚨 OTRS live smoke harness hardened against OtrsConnectorError detail leakage and workspace ID secret
1383 " 🟣 Live OTRS smoke harness gained structured diagnostics phase mirroring cockpit step keys
1386 4:24p 🔵 Task 12 commit a703972 file scope verified within plan boundaries
1387 " 🟣 OTRS credential slot reads now scoped by workspaceId across service and API layers
1388 " 🔵 OTRS connector secret redaction layered through payload, URL, and known-secret passes
1389 " 🔵 Task 9 OTRS GenericInterface Stub Server Spec Verification Complete
1390 " 🟣 OTRS GenericInterface Local Stub Server With Eight Failure Modes
1392 4:28p 🔵 Repo conventions for OTRS live smoke harness reconnaissance
1394 4:44p 🔵 Live OTRS smoke harness sanitizer verified against leak probe with dummy server
1395 " ⚖️ Task 11 quality re-review verdict: APPROVED
1396 " 🔵 Page load failure with server error 1916156305
1398 4:52p 🔴 Resolved Next.js production server error 1916156305 caused by missing DATABASE_URL
1399 " 🔴 Recovered failed Prisma migration 20260507161000_add_integration_diagnostics via db:reset
1400 " 🔴 QC app /auth/login renders demo-user picker plus draft Microsoft Entra SSO when demo auth is enabled
1401 4:54p 🔵 Task 12 commit a703972 contents enumerated
1402 " 🟣 OTRS credential reads now workspace-scoped via getIntegrationSecretSlots signature change
1403 " 🟣 POST /api/v1/integrations credential summary refresh scoped by workspaceId
1404 " 🔵 Tests updated to new getIntegrationSecretSlots signature
1405 " 🔵 OTRS service does not log decrypted password or CA in diagnostics persistence
1406 " 🔵 Task 12 documents environment-blocked verification honestly
1407 " 🔵 Spec corrections: WebService default and TicketSearch path align with OTRS CE 6 reality
1408 " 🔵 OTRS connector config schema rejects secrets in configJson at multiple layers
1409 " 🔵 Prisma migrations preserve workspaceId index and unique-by-(integrationId,kind) for credentials
1410 " ⚖️ Task 12 quality/security review trending APPROVED with one minor doc-stale note
1411 5:03p 🔵 React Server Components stream parse error in Next.js Turbopack dev
1412 " 🔵 Reviews pages throw permission error after user switch in qc_app
1413 " 🔵 Role-permission matrix mapped for qc_app reviews access control
1414 " 🔵 switchCurrentUser server action issues demo session cookies and redirects
1415 " 🔵 Review queue and detail pages both gate on reviews:read with SUPPORT_AGENT scoping
1416 " 🔴 Granted SUPPORT_AGENT role reviews:read permission to fix /reviews 500 errors
1417 5:04p 🔵 Verified /reviews renders 200 OK after permission fix
1418 " ✅ Verification suite passed for SUPPORT_AGENT permission fix
1419 5:08p 🔵 Auth session module structure in qc_app
1420 " 🔵 Sidebar navigation role-based visibility map
1421 " 🔵 Seeded users and roles in qc_app database
1422 5:09p 🔵 Role-based route matrix smoke test all green
1423 " ✅ SUPPORT_AGENT now sees /reviews link in sidebar
1424 " 🔵 Verification commands launched for sidebar role change
1425 " 🔵 Typecheck and auth-permissions tests pass after sidebar update
1426 " ✅ Re-running role matrix smoke after sidebar fix
1427 " 🔵 Post-fix role matrix smoke test stays fully green
1428 " 🔵 Working tree state and health endpoint snapshot

Access 2722k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

# Project Notes

- Web app lives in `apps/web`.
- Use `npm install` from `apps/web` before running app commands.
- Local database is PostgreSQL via Docker Compose at `localhost:55432`; Prisma schema and migrations live in `apps/web/prisma`.
- Primary commands: `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run typecheck`.
