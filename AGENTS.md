<claude-mem-context>
# Memory Context

# [qc_app] recent context, 2026-05-12 10:00am GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,359t read) | 3,955,428t work | 100% savings

### May 9, 2026
1758 7:02p 🔵 qc_app working tree spans 29 modified files plus 22 new feature files for QC review and integration revamp
1759 " 🟣 Integration runner now writes results inside a transaction with sync-state ledger and disabled-row guard
1760 " 🟣 OTRS selected-import path now reads integration, guards disabled status, and persists sync-state checkpoint
1761 " 🟣 Integration import service refuses disabled integrations and queues atomically
1762 " 🟣 Backend job runner adds WEBHOOK_INGEST type that delegates to ingestWebhookEvent
1763 " 🟣 Conversation import now applies workspace sampling rules in-transaction
1764 " 🟣 GET /api/v1/integrations now returns capability metadata, sync state, and richer run history
1765 " 🟣 Review actions enforce SELF_REVIEW scope, REOPENED-cycle review lookup, and process-field stripping
1766 " 🟣 Review workflow policy centralizes QA status transitions with FINALIZED evidence requirement
1767 " 🟣 updateConversationWorkflow and bulkUpdateReviewQueue now run conditional updateMany guarded by assertQaWorkflowTransition
1768 " 🟣 Review feedback transitions gated by assertFeedbackTransition lifecycle module
1769 " 🟣 Inbound webhook ingestion verifies signatures, dedupes by idempotency key, and updates integration sync state
1770 " 🟣 Review detail page supports CALIBRATION and SELF_REVIEW review-source modes
1771 " 🟣 Self-review permission is now a distinct role capability
1772 " 🟣 Review queue and conversation reads partition reviews by current QA cycle
1773 " 🟣 Self-review page surfaces operator feedback queue and training assignments scoped to the assignee
1774 " 🔵 App sidebar surfaces open-appeal count from finalized HUMAN reviews
1775 " 🟣 Review lifecycle tests assert REOPENED-cycle isolation and forged-field stripping
1777 " ✅ Final e2e re-run started for follow-up fixes
1778 " ✅ e2e suite progressing through all 4 specs after follow-up fixes
1779 " ✅ Final e2e re-run passes 4/4 after all follow-up review fixes
1780 7:03p 🔵 Mapped remaining "finalized HUMAN review" call sites that bypass the qaStatus cycle filter
1781 " 🔴 Cycle filter (qaStatus="FINALIZED") propagated to self-review, calibration, and coaching pages
1782 " ✅ Full unit suite still green and rebuild started after cycle-filter propagation
1783 7:04p ✅ Production build re-completes after self-review/calibration/coaching cycle filter
1784 " ✅ Final e2e re-run progressing on OTRS cockpit specs
1785 " ✅ Final e2e re-run passes 4/4 after cycle filter expansion to self-review/calibration/coaching
1786 " 🔵 Final working tree status: 33 modified + 22 new files, no commit
1788 7:06p 🔴 QA review workflow lifecycle hardened against duplicate finalization, stale cycles, and races
### May 12, 2026
1789 9:56a 🔵 QC app working tree shows webhook and review-lifecycle workstream in flight
1790 " 🔵 Active branch codex/production-state-hardening drives webhook, audit, and review-lifecycle hardening
1791 9:57a 🔵 OTRS production integration plan has one remaining open step — local E2E verification
1792 " 🔵 OTRS cockpit E2E blocked locally because Docker/Postgres socket is unavailable
1793 " ✅ Explorer subagent dispatched to audit remaining plan items
1794 " 🟣 OTRS cockpit E2E verification step closed — full Playwright suite green
1795 9:58a 🔵 qc_app dirty tree spans webhooks, sampling, review lifecycle, and OTRS integration
1796 " 🔵 All active superpowers plan checklists now fully complete
1797 " 🔵 OTRS production integration plan fully checked, including local E2E verification
1798 " 🔵 Legacy MVP plan still shows 59 unchecked steps but is historically completed
1799 " ✅ OTRS plan now reflects E2E verification; remaining uncommitted work targets webhooks and review lifecycle
1800 " 🔵 Explorer subagent surfaced two reconciliation items before handoff
1803 " 🔵 AGENTS.md "stale" notes are actually the claude-mem context block, not freeform plan status
1801 " 🔵 qc_app on codex/production-state-hardening branch with sizable uncommitted hardening work
1802 " ⚖️ No actionable plan items remain after OTRS finalization in qc_app
1804 " 🔵 Stale Docker-blocked note at OTRS plan line 913 and conflict with checked "Commit final hardening" step
1805 9:59a ✅ Stale OTRS E2E notes reconciled in AGENTS.md and OTRS plan
1806 " ✅ OTRS plan "Commit final hardening" step unchecked pending explicit commit request
1807 " 🔵 One more stale Docker-blocked note remains at OTRS plan line 1169
1808 " ✅ OTRS plan Task 12 verification log replaced with 2026-05-12 green run summary
1809 10:00a ✅ OTRS plan and AGENTS.md fully reconciled; one open task remains by design

Access 3955k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

# Project Notes

- Web app lives in `apps/web`.
- Use `npm install` from `apps/web` before running app commands.
- Local database is PostgreSQL via Docker Compose at `localhost:55432`; Prisma schema and migrations live in `apps/web/prisma`.
- Primary commands: `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run typecheck`.
