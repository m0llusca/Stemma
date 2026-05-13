<claude-mem-context>
# Memory Context

# [qc_app] recent context, 2026-05-13 2:28pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (28,994t read) | 3,899,781t work | 99% savings

### May 12, 2026
S478 What is needed to actually test the OTRS integration (May 12 at 10:50 AM)
S477 Prerequisites for real-world testing of OTRS integration, plus local auth setup via LocalCredential (May 12 at 10:50 AM)
S479 Redesign of admin sections (Integrations, Users & Permissions, Access & SSO) — state-of-the-art production design addressing unclear UX and narrow/long lists (May 12 at 1:00 PM)
S480 Read-only audit of qc_app integrations: inventory connectors/backend/API/UI/tests/docs, identify implemented vs placeholder, list official-docs to recheck, surface backend/API/frontend hardening targets — no code edits (May 12 at 2:16 PM)
S481 Read-only design audit of /Users/dubrsky/Downloads/qc_app apps/web frontend to inform a production-grade next iteration covering tooltip/help icons, UI polish/alignment, integration audit vs official docs, score display percent→points migration, and stronger Active Directory/group policy support. (May 12 at 4:51 PM)
### May 13, 2026
S483 Production-grade polish pass: tooltips, UI alignment, integration re-verification, score-based quality metric, and improved Active Directory / group policy support (May 13 at 12:38 PM)
3190 1:54p ✅ Two parallel spec compliance reviewers dispatched for Task 11
3194 " 🔵 Task 11 spec compliance review requested for integration catalog hardening
3191 1:55p 🔵 Maxwell spec reviewer confirms Task 11 commit 90ecceaa is spec compliant
3192 " 🔵 Task 11 commit confirmed as 9-insertion/1-deletion test-only diff
3193 " ✅ Code quality reviewer Tesla dispatched for Task 11
3274 " 🟣 Task 11 hardens integration catalog response contract assertions
3195 1:57p 🔵 Task 11 verified: integration catalog route already conformed to readiness contract
3196 " 🔵 Code quality reviewer Tesla approves Task 11 with one minor note
3197 1:58p 🔵 Phase A Task 12 verification step 1-3 green: typecheck passes, forbidden-pattern greps clean
3198 " 🔵 Phase A typecheck passes for apps/web via next typegen + tsc --noEmit
3199 " 🔵 Phase A unit + API test suite green: 64 files / 362 tests pass
3200 " 🔵 Phase A e2e suite green: 5 Playwright tests pass in 28.9s
3201 1:59p 🔵 Phase A final verification step 6: git diff confirms pre-existing admin-redesign state untouched
3202 " 🟣 Phase A enterprise production hardening complete on codex/admin-redesign
3203 " 🔵 Phase A full commit ladder: 30 commits from plan adoption to Task 11 across all 12 tasks
3205 " ⚖️ Phase A enterprise hardening final read-only review scope defined
3204 2:00p ✅ Stale next dev server on port 3000 stopped after Phase A verification
3210 2:03p 🔵 Phase A score-display points refactor verified via committed diff
3211 " 🟣 Certification status registry exposes honest gate summaries for connectors
3212 " 🟣 Integration capabilities expose per-connector certification and isolate fallback metadata
3213 " 🟣 Integration catalog route returns stable request id and OpenAPI documents certification schemas
3214 " 🟣 HelpTooltip primitive added with accessible focus/pointer/Escape handling
3215 " 🟣 Admin layout visual overflow sweep covers Phase A routes at four widths
3216 " 🔄 Admin pages restructured into ops-metric/ops-tab/ops-panel grids with section routing
3217 " 🔵 Setup wizard certification label is mode-based and may overstate OTRS-family fallback option
3218 2:05p 🔵 Reviews detail page header chip and history pill rendered as Russian points
3219 " 🔵 Score display unit test suite pins points formatting and edge cases
3220 " 🔵 OpenAPI ScoreSummary schema is defined but no path response references it
3221 " 🔵 Phase A admin overflow guards use min-width:0 cascade rather than overflow-x:hidden
3222 " 🔵 Scorecards admin page applies HelpTooltip to weight-vs-score field and exposes new sections
3223 " 🔵 Admin access providerReadiness disables Проверить вход until SSO config is complete
3225 2:06p 🔵 Reports performance bar charts use static " баллов" suffix instead of per-row pluralization
3226 " 🔵 Integration cockpit summary shows latest run with "items" label and Dry-run English copy
3227 2:07p 🔵 OpenAPI integration catalog summary still uses English technical terms inside Russian summary
3259 2:14p 🔵 Phase A verification fix commit review scoped
3264 2:16p 🔵 Phase A fix commit code-path verified across three Important issues
3267 2:17p 🔵 totalScore field retained across all consumers and DB constraints
3276 2:19p 🔵 Integration catalog route test passes with hardened contract assertions
3294 2:25p 🟣 Quality score chart pluralization fix
3295 " 🔴 Integration setup uses real certification summary
3296 " 🟣 Reviews API and OpenAPI expose ScoreSummary contract
3297 " 🔵 Phase A verification commit lands and review approves
3298 " ✅ Phase A branch fast-forward merged to master
3299 " 🔴 Post-merge e2e suite regresses on layout overflow and review workflow
3300 2:26p ✅ Restored pre-merge dirty workspace on master
3301 " 🔵 Unit tests stay green on master with stash reapplied
3302 " 🔵 E2E suite recovers after restoring stashed admin/auth edits
3303 2:27p ✅ Deleted merged codex/admin-redesign branch
3304 " 🔵 Master left with restored stash as uncommitted working changes
3306 " 🔵 Master HEAD confirmed at Phase A verification commit

Access 3900k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

# Project Notes

- Web app lives in `apps/web`.
- Use `npm install` from `apps/web` before running app commands.
- Local database is PostgreSQL via Docker Compose at `localhost:55432`; Prisma schema and migrations live in `apps/web/prisma`.
- Primary commands: `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run typecheck`.
