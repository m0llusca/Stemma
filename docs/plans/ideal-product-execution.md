# Plan: Stemma → идеальный продукт

Закрыть разрыв между уже сильным QC-loop и продуктом, за который платят: throughput ревьюера, time-to-first-certified-review, data-plane отчётов, worker/CI honesty, упаковка. Подход — harden monolith + thin surfaces вокруг golden path; без AutoQA/LMS/rewrite.

## Scope

- In: P0–P1 из оркестраторов; файлы в `apps/web`, CI, docs.
- Out (90 дней): Blind GraderQA, LMS, AutoQA parity, новые helpdesk-адаптеры, mobile scoring MVP, Kafka/microservices, Prisma 7, marketing homepage.

## Status — complete

Waves A–C shipped, including residual items 16–18 follow-ups:

| Item | Done |
|------|------|
| Jobs SKIP LOCKED + `jobs:write` | yes |
| Reports previous-period + SQL KPI overview | yes |
| Workbench calm / reports progressive disclosure | yes |
| Activation events + golden-path coach | yes |
| Playwright smoke + authz matrix (token/feedback/calibration/scorecard) | yes |
| Reports split + IngressRateLimit (migrated locally) | yes |
| Queue age SLO + seat packaging sketch | yes |
| Drop unused zustand + tRPC stub + Modal/Drawer | yes |
| Create-user → AdminDialog | yes |
| Calibration ritual defaults + baselineReviewId + appeal prefill | yes |
| Agent trust copy | yes |
| OTRS cert bridge wired into diagnostics/preview + honest evidence_lock / polling flag | yes |
| YandexGPT admin checklist | yes |

## Residual (explicit)

- `/reports` still loads current-period rows for charts/matrices (SQL KPIs only headline when unfiltered).
- Full chart wrapper unification under `@/components/ui/chart` only (still Recharts; StaticCategoryBarPlot remains on dashboard).
- `IngressRateLimit` migrate deploy on every non-local environment.
- Mobile scoring non-goal.

## Defaults locked

Seats-by-role; machine auth = API tokens `jobs:write`; desk-first QC.
