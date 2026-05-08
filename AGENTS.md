<claude-mem-context>
# Memory Context

# [qc_app] recent context, 2026-05-08 5:35pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (21,239t read) | 1,032,509t work | 98% savings

### May 8, 2026
1428 5:09p 🔵 Working tree state and health endpoint snapshot
1429 5:12p 🔵 Active branch is codex/otrs-remaining-tasks
1430 " ✅ Committed demo role access fixes on codex/otrs-remaining-tasks
1431 5:18p 🔵 Seed script defines workspace, identity providers, users, and group mappings
1432 5:19p 🔵 Permissions matrix and review-page authorization model
1433 " 🔵 Review/feedback action layer enforces canSaveReviewDraft, canFinalizeReview, canAcknowledgeFeedback
1434 5:20p 🔵 Review draft/finalize action lifecycle and admin access page
1435 " 🔄 Review queue repository accepts a SUPPORT_AGENT scope for tighter row-level filtering
1436 5:21p 🔵 Review detail page footer renders history list
1437 " ✅ Review detail page now adapts UI by viewer role
1438 " ✅ Feedback actions enforce assignee scope and tighter training-assignment guard
1439 " ✅ Removed VIEWER seed user and QC_Viewers group mapping
1440 " ✅ VIEWER role removed from admin/access mappings and identity provider role resolution
1441 5:22p ✅ Sidebar nav and unit tests updated to drop VIEWER references
1442 " 🟣 Added test asserting SUPPORT_AGENT is least-privileged fallback role
1443 " ✅ VIEWER role permissions emptied to fully decommission the role
1444 " 🔴 Fixed TS2345 from narrowed roles tuple in auth-provider-actions
1445 5:23p ✅ Database reseeded without VIEWER user
1446 " 🔵 Reseeded workspace contains only four users with new IDs
1447 " 🔵 Smoke test reveals queue HTML still leaks other assignee names for SUPPORT_AGENT
1448 " 🔵 Confirmed source of leak: assignee filter dropdown still shows other agents
1449 5:24p 🔴 Fixed assignee filter dropdown leak for SUPPORT_AGENT
1450 " 🔵 Auth tests still green after assignee scope fix
1451 " ✅ Comprehensive role-scope smoke harness launched
1452 5:25p 🔵 Full role-scope smoke test passes all assertions
1453 " 🔵 Pre-commit changeset summary on codex/otrs-remaining-tasks
1454 " 🔵 Frontend skill bundles for in-app Browser plugin and frontend-testing-debugging
1455 5:26p 🔵 Browser plugin opens login page; Next.js literal triggers false framework-error positive
1456 " 🔵 Login page DOM tree confirms 4-role demo selector and embedded sidebar
1457 " 🔵 Operator login flow visually verified through Browser plugin
1458 " 🔵 Operator review detail page renders read-only summary correctly
1459 5:27p 🔵 Operator direct-link 404 confirmed visually
1460 " 🔵 Visual screenshot confirms operator review-detail UI layout
1461 " 🔄 Indented appeal alert action block under canManageWorkflow guard
1462 5:28p 🔵 Residual VIEWER references audit complete
1463 " ✅ Removed VIEWER from auth provider mappings API zod schema
1464 " 🔵 auth-provider-actions saveGroupRoleMapping uses ConfigurableRole alias
1465 " 🔵 Final state: 4 roles in DB, all VIEWER references gated/inert
1466 5:29p ✅ Renamed VIEWER label from "Наблюдатель" to "Без доступа"
1467 " 🔵 Final code-state confirmation across page-data, feedback, and login
1468 " 🔵 Final sidebar navItems definition reflects four-role model
1469 " ✅ Removed SUPPORT_AGENT from /reviews sidebar gate; redirect operators to /self-review on login
1470 5:30p 🔵 Typecheck and tests still green after sidebar/redirect change
1471 " 🔵 Operator UI verified after sidebar/redirect changes
1472 " 🔵 Operator login redirect to /self-review confirmed end-to-end
1473 " 🔵 current-user.ts capability helper map and demo fallback
1474 5:31p ✅ Excluded VIEWER users from login dropdown and workspace user list
1475 " 🔵 Final all-green run after VIEWER row exclusion
1476 " 🔵 Final 18-file pre-commit changeset
1477 5:32p 🔵 Final source confirmation: switchCurrentUser, sidebar navItems, getWorkspaceUsers

Access 1033k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

# Project Notes

- Web app lives in `apps/web`.
- Use `npm install` from `apps/web` before running app commands.
- Local database is PostgreSQL via Docker Compose at `localhost:55432`; Prisma schema and migrations live in `apps/web/prisma`.
- Primary commands: `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run typecheck`.
