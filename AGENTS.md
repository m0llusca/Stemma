<claude-mem-context>
# Memory Context

# [qc_app] recent context, 2026-05-18 5:54pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (27,704t read) | 2,661,251t work | 99% savings

### May 12, 2026
S478 What is needed to actually test the OTRS integration (May 12 at 10:50 AM)
S477 Prerequisites for real-world testing of OTRS integration, plus local auth setup via LocalCredential (May 12 at 10:50 AM)
S479 Redesign of admin sections (Integrations, Users & Permissions, Access & SSO) — state-of-the-art production design addressing unclear UX and narrow/long lists (May 12 at 1:00 PM)
S480 Read-only audit of qc_app integrations: inventory connectors/backend/API/UI/tests/docs, identify implemented vs placeholder, list official-docs to recheck, surface backend/API/frontend hardening targets — no code edits (May 12 at 2:16 PM)
S481 Read-only design audit of /Users/dubrsky/Downloads/qc_app apps/web frontend to inform a production-grade next iteration covering tooltip/help icons, UI polish/alignment, integration audit vs official docs, score display percent→points migration, and stronger Active Directory/group policy support. (May 12 at 4:51 PM)
S483 Production-grade polish pass: tooltips, UI alignment, integration re-verification, score-based quality metric, and improved Active Directory / group policy support (May 12 at 4:55 PM)
### May 13, 2026
3218 2:05p 🔵 Reviews detail page header chip and history pill rendered as Russian points
3219 " 🔵 Score display unit test suite pins points formatting and edge cases
3220 " 🔵 OpenAPI ScoreSummary schema is defined but no path response references it
3221 " 🔵 Phase A admin overflow guards use min-width:0 cascade rather than overflow-x:hidden
3222 " 🔵 Scorecards admin page applies HelpTooltip to weight-vs-score field and exposes new sections
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
3309 2:28p 🔵 Working tree unchanged since last status check
3310 " 🔵 In-flight admin/users redesign details surfaced
3312 " 🟣 Admin management polish committed to master
3313 2:29p 🔵 Master clean after admin polish commit
3315 " 🔵 writing-plans superpowers skill documented
3316 " 🔵 Phase A scope and Phase B/C handoff documented
3318 2:30p 🔵 Enterprise hardening spec details Phase B-D scope
3319 " 🔵 Zendesk Support API contract surfaced for Phase B adapter planning
3321 " 🔵 Existing helpdesk adapter scaffolding mapped for Phase B
3322 2:31p 🔵 Helpdesk normalizers and capability fallback semantics fully mapped
3323 " 🔵 OTRS adapter contract patterns serve as Phase B reference architecture
3353 2:35p ✅ User requested handoff prompt for new session with two superpowers skills
3360 2:38p ✅ Session pause requested with cleanup of background processes
3347 2:44p 🔵 Phase B Task 1 spec compliance review requested for commit f49d56b
3348 2:45p 🔵 Phase B Task 1 code quality review requested for helpdesk adapter contracts
3349 2:46p 🟣 Phase B helpdesk adapter source contracts module added
3350 2:47p 🔵 Phase B helpdesk adapter contracts cover seven sources with conservative certification gates
3351 " 🔵 Phase B live smoke test npm scripts referenced in contracts do not yet exist
3354 2:50p 🟣 Phase B enterprise production hardening implementation plan authored
3359 2:53p 🔵 Phase B helpdesk adapter source contracts pass re-review at commit dbf02e4
3361 " 🟣 Phase B helpdesk adapter source contracts landed on codex/phase-b-adapter-hardening
3362 " 🔵 Context7 coverage gaps for Salesforce and ServiceNow REST APIs forced first-party fallback
3363 " 🔵 claude-mem observation_add unavailable in worker runtime
3365 2:54p ⚖️ Phase B kickoff plan with subagent workflow constraints
3364 3:02p 🟣 Production-grade roadmap requested: tooltips, polish, integrations audit, scoring, group policy
S484 Production-grade enhancement plan: tooltips, UI polish, integrations audit, points-based scoring, and Active Directory/group policy support (May 13 at 3:02 PM)
3366 " 🔵 Dozens of stale bun MCP server processes accumulated on host

Access 2661k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

# Project Notes

- Web app lives in `apps/web`.
- Use `npm install` from `apps/web` before running app commands.
- Local database is PostgreSQL via Docker Compose at `localhost:55432`; Prisma schema and migrations live in `apps/web/prisma`.
- Primary commands: `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run typecheck`.
