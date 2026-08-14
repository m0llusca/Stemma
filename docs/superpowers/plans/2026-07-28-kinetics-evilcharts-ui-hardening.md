# План реализации: shadcn UI hardening, графики и motion

Дата: 2026-07-28

Спецификация:
`docs/superpowers/specs/2026-07-28-kinetics-evilcharts-ui-hardening-design.md`

Provenance:
`docs/memory/2026-07-28-kinetics-evilcharts-provenance-audit.md`

## Цель

Реализовать утверждённое направление `Operational Command with Guided Evidence`:
починить семь тем и appearance modifiers, добавить управляемую motion-policy,
ввести app-owned shadcn/Recharts слой с Graph/Table parity, укрепить reports и
dashboard, добавить безопасные сценарные demo-данные и пройти полную
accessibility/responsive/performance сертификацию.

## Глобальные ограничения

- Рабочая ветка уже изолирована: `codex/shadcn-layout-remediation`.
- Worktree содержит большой объём утверждённых незакоммиченных изменений
  предыдущего этапа. Не откатывать, не форматировать массово, не stage и не
  commit без отдельной просьбы пользователя.
- Стандартные controls только из `@/components/ui/*`; Base UI composition через
  `render`, не `asChild`.
- Не добавлять `kinetics`, `motion`, `framer-motion`, `echarts` или другой chart
  engine.
- Не запускать `npx shadcn@latest add`; EvilCharts source не копировать.
- Recharts используется напрямую через существующий shadcn `ui/chart.tsx`.
- `globals.css` — единственный глобальный theme/motion файл; legacy `theme.css`
  не импортировать.
- Server pages остаются server components; chart — leaf client island.
- Все новые data contracts JSON-safe и tenant-authorized.
- Initial analytical charts статичны; `isAnimationActive={false}`.
- Каждый тест пишется первым, запускается в RED, затем выполняется минимальная
  реализация и повторный GREEN.
- Тесты закрепляют поведение, а не Tailwind classes, private SVG paths или
  framework internals.
- В ходе каждого task затрагивать только перечисленные файлы и необходимые
  непосредственные consumers.

## Task 1. Pre-flight, test DB safety и исполняемые baselines

Этот task блокирует **любой** Playwright и seed command в последующих задачах.

### Preserve dirty worktree

До первой правки:

1. Сохранить в SDD workspace:
   - `git status --short`;
   - `git diff --binary` tracked files;
   - список untracked files;
   - SHA-256 и отдельную копию каждого dirty/untracked файла, которым владеют
     Tasks 1–10.
2. Перед каждым task implementer повторно читает актуальный файл и его baseline.
3. Tasks 1–10 выполняются последовательно с exclusive file ownership. Параллельно
   разрешены только read-only review/test agents.
4. После task сохранить post-task diff и проверить, что pre-existing hunks,
   не относящиеся к brief, сохранены.

Artifacts:

- `.superpowers/sdd/2026-07-28-kinetics-evilcharts-ui-hardening/preflight/`
- `.superpowers/sdd/2026-07-28-kinetics-evilcharts-ui-hardening/task-N/`

### RED: fail-closed database and transaction

Создать/расширить:

- `apps/web/tests/unit/seed-guard.test.ts`
- `apps/web/tests/unit/demo-seed-transaction.test.ts`
- `apps/web/tests/unit/playwright-database-guard.test.ts`

Проверить:

1. Production seed запрещён без возможности `ALLOW_SEED` override.
2. Playwright config падает до запуска webServer, если нет явного
   `TEST_DATABASE_URL`.
3. URL должен указывать на разрешённую dedicated test database/schema; fallback
   к developer `DATABASE_URL` запрещён.
4. Forced failure в середине seed mutation откатывает все demo writes.
5. Foreign/non-demo workspace и его rows сохраняются.
6. Seed mutation helpers получают `Prisma.TransactionClient`, а не закрываются
   над global client.

### GREEN: safety seam

Изменить:

- `apps/web/prisma/seed.ts`
- `apps/web/prisma/demo-seed-bootstrap.ts`
- `apps/web/prisma/demo-review-seeds.ts`
- `apps/web/prisma/demo-operational-seeds.ts`
- `apps/web/playwright.config.ts`

Реализовать:

- non-overridable production denial;
- обязательный explicit `TEST_DATABASE_URL` для Playwright;
- allowlist dedicated test DB name/schema;
- одну Prisma transaction для workspace-scoped cleanup/upserts и fixtures;
- явную передачу `Prisma.TransactionClient`;
- отсутствие global `deleteMany`.

Никакие scenario counts в этом task не меняются, кроме необходимого перехода на
transaction/upsert seam.

### Fresh performance baseline

Создать:

- `apps/web/scripts/verify-route-budgets.mjs`
- `apps/web/tests/unit/route-budget-script.test.ts`

Скрипт читает production client-reference manifests, вычисляет union и
route-specific gzip, проверяет shared/report/dashboard/coaching budgets и
сохраняет JSON baseline в SDD workspace. Unit test запускает скрипт на synthetic
manifests и доказывает hard-fail при превышении.

Запустить до UI-изменений:

```bash
cd apps/web
npm test -- tests/unit/seed-guard.test.ts tests/unit/demo-seed-transaction.test.ts tests/unit/playwright-database-guard.test.ts tests/unit/route-budget-script.test.ts
npm run build
node scripts/verify-route-budgets.mjs --capture-baseline ../../.superpowers/sdd/2026-07-28-kinetics-evilcharts-ui-hardening/preflight/route-budgets.json
npm run typecheck
```

Dedicated database создаётся/указывается явно в task report; developer database
не используется.

До завершения Task 1 dedicated DB должна существовать и иметь migrations:

```bash
cd apps/web
PGPASSWORD="qc_app" psql -h localhost -p 55432 -U qc_app -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='qc_app_demo_verify'"
PGPASSWORD="qc_app" createdb -h localhost -p 55432 -U qc_app qc_app_demo_verify
DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" npm run db:deploy
```

`createdb` выполняется только при отсутствии literal database name по предыдущему
read-only `SELECT`. Task report фиксирует проверку URL/name и migration result.

## Task 2. Единый root appearance contract

### RED

Создать:

- `apps/web/tests/unit/appearance-root.test.ts`
- `apps/web/tests/unit/root-layout-appearance.test.tsx`

Расширить:

- `apps/web/tests/unit/appearance-settings-form.test.tsx`

Проверить literal expectations:

1. Graphite и Ops возвращают полный root state.
2. Ops ставит `.dark` и `color-scheme: dark`; любая light theme снимает их.
3. Все 49 ordered transitions заканчиваются destination theme без stale
   variables.
4. Повторное применение идемпотентно.
5. SSR ставит `data-theme`, `data-density`, `data-corners`, `data-contrast`,
   `.dark`, `color-scheme` и inline overrides на `<html>`, не на body.
6. Invalid persisted values нормализуются.
7. Rapid preview saves используют latest-write-wins.
8. Rejected save + unmount восстанавливает last confirmed server state.
9. Winning save делает ровно один refresh; stale response не перезаписывает root.

Запустить:

```bash
cd apps/web
npm test -- tests/unit/appearance-root.test.ts tests/unit/root-layout-appearance.test.tsx tests/unit/appearance-settings-form.test.tsx
```

Убедиться, что тесты падают из-за отсутствующего root API/текущего split
authority, а не из-за setup.

### GREEN

Изменить/создать:

- `apps/web/src/lib/ui-theme.ts`
- `apps/web/src/lib/ui-theme-dom.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/admin/appearance-settings-form.tsx`

Реализовать:

- `ThemeDefinition`;
- `appearanceRootProps`;
- `uiAppearanceToCssVariables`;
- идемпотентный `syncUiAppearanceToDocument`;
- latest-write-wins preview persistence;
- cleanup к последнему подтверждённому server state;
- один `router.refresh()` для winning save;
- legacy override key migration к canonical v2.

Не добавлять theme provider и pre-hydration script: workspace appearance уже
известен SSR.

### VERIFY

Запустить targeted tests, затем:

```bash
npm test -- tests/unit/ui-theme.test.ts tests/unit/appearance-settings-form.test.tsx
npm run typecheck
```

## Task 3. Семь тем, modifiers и motion safety

### RED

Создать/расширить:

- `apps/web/tests/unit/ui-theme-contract.test.ts`
- `apps/web/tests/unit/appearance-settings-form.test.tsx`
- `apps/web/tests/unit/copy-button.test.tsx`
- `apps/web/tests/unit/evidence-jump-link.test.tsx`

Проверить:

1. Все семь themes содержат полный semantic/status/sidebar/chart token contract.
2. Chart tokens не пусты и различимы по theme.
3. Density/corners/contrast изменяют реальный root contract.
4. Coarse-pointer hit target остаётся не меньше 44 px.
5. Reduced motion сохраняет static feedback.
6. Rapid copy/save interactions не оставляют stale timers.
7. Smooth evidence scroll превращается в `auto` при reduced motion.

### GREEN

Изменить:

- `apps/web/src/app/globals.css`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/input.tsx`
- `apps/web/src/components/ui/native-select.tsx`
- `apps/web/src/components/ui/textarea.tsx`
- `apps/web/src/components/ui/table.tsx`
- `apps/web/src/components/ui/skeleton.tsx`
- `apps/web/src/components/ui/spinner.tsx`
- `apps/web/src/components/ui/progress.tsx`
- `apps/web/src/components/copy-button.tsx`
- `apps/web/src/components/review/evidence-jump-link.tsx`
- `apps/web/src/app/styles/theme.css` — удалить после verified migration
- `apps/web/tests/unit/auth-shell-layout.test.ts`
- `apps/web/tests/unit/ui-theme-contract.test.ts`
- затронутые theme-authority docs, перечисленные в pre-flight inventory

Реализовать:

- семь complete token blocks в `globals.css`;
- semantic status и chart roles;
- token-backed control heights/padding/radius/gutters;
- contrast modifier через mode-agnostic OKLCH/color-mix;
- motion tokens и global reduced-motion safety;
- explicit transition properties вместо затронутых `transition-all`;
- managed timers/cleanup;
- временные active legacy bridges с deletion list.

Портировать только token intent из
`apps/web/src/app/styles/theme.css`; не импортировать его. До удаления сравнить
его с pre-flight copy, инвентаризировать каждый уникальный active selector/token,
перенести только подтверждённый semantic intent и затем удалить `theme.css`.
Обновить stale tests/docs, которые называют его authoritative. Добавить import
scan, доказывающий, что theme declarations существуют только в `globals.css`
кроме явного списка временных bridges.

### VERIFY

```bash
cd apps/web
npm test -- tests/unit/ui-theme-contract.test.ts tests/unit/appearance-settings-form.test.tsx tests/unit/copy-button.test.tsx tests/unit/evidence-jump-link.test.tsx
npm run typecheck
```

Computed 44px targets, OKLCH contrast и browser reduced-motion не доказываются
JSDOM; их RED/GREEN assertions находятся в Tasks 8/10.

## Task 4. JSON-safe chart model и server Graph/Table frame

### RED

Создать:

- `apps/web/tests/unit/chart-contracts.test.ts`
- `apps/web/tests/unit/report-chart-frame.test.tsx`

Проверить:

1. Runtime validation отклоняет duplicate series IDs, unknown keys,
   non-finite numbers, `Date`, `undefined` и unordered/duplicate point IDs.
2. Нулевой bucket и null point сохраняются.
3. `chartView=table` выводит полный semantic table в исходном порядке.
4. Graph/Table links сохраняют filters и используют `replace` semantics в href.
5. Heading, period, unit, sample и description присутствуют.
6. Empty/error/partial/missing/stale states следуют state matrix.

### GREEN

Создать:

- `apps/web/src/lib/charts/contracts.ts`
- `apps/web/src/lib/charts/builders.ts`
- `apps/web/src/lib/reports/report-chart-models.ts`
- `apps/web/src/components/charts/chart-frame.tsx`
- `apps/web/src/components/charts/chart-data-table.tsx`
- `apps/web/src/components/charts/chart-view-links.tsx`

Изменить:

- `apps/web/src/lib/reports/report-aggregation.ts`

Убрать dependency inversion: domain aggregation больше не импортирует types из
`components/reports/report-charts.tsx`.

Table view не импортирует Recharts. URL state принадлежит server parser.

### VERIFY

```bash
cd apps/web
npm test -- tests/unit/chart-contracts.test.ts tests/unit/report-chart-frame.test.tsx tests/unit/report-aggregation.test.ts tests/unit/report-trends.test.ts
npm run typecheck
```

## Task 5. Accessible Recharts visual и reports overview

### RED

Создать/расширить:

- `apps/web/tests/unit/quality-trend-chart.test.tsx`
- `apps/web/tests/unit/report-charts.test.tsx`
- `apps/web/tests/unit/report-kpi-row.test.tsx`

Проверить:

1. Chart root имеет name/description и ровно один tab stop.
2. Left/Right меняет активную точку; Enter запускает подтверждённый drill-down;
   Escape снимает tooltip/selection.
3. Tooltip содержит date/label, score, delta, sample и остаётся linked через
   `aria-describedby`.
4. Legend series controls — реальные shadcn Toggle/Button с `aria-pressed`.
5. Previous period отличается dash/marker, target имеет явный label, volume
   остаётся нейтральным.
6. Initial/reduced-motion render не запускает mark animation.
7. KPI grid не имеет orphan на desktop/tablet.
8. Последнюю видимую series скрыть нельзя.
9. Table отражает тот же URL-owned `series` state.
10. Неактивная Graph/Table representation отсутствует в accessibility tree.
11. Pointer, focus и первый touch показывают одинаковый tooltip и сами не
    открывают Sheet.

### GREEN

Создать:

- `apps/web/src/components/charts/quality-trend-chart.client.tsx`
- `apps/web/src/components/charts/ranked-driver-chart.client.tsx`
- `apps/web/src/components/charts/chart-legend-controls.tsx`
- `apps/web/src/components/charts/chart-tooltip-status.tsx`

Изменить:

- `apps/web/src/components/ui/chart.tsx`
- `apps/web/src/components/reports/report-score-panel.tsx`
- `apps/web/src/components/reports/report-kpi-row.tsx`
- `apps/web/src/components/reports/report-panels.tsx`
- `apps/web/src/app/reports/page.tsx`

Реализовать только overview primary composed trend и factor panel. Простые
distribution/risk/progress остаются semantic HTML, пока отдельный task не
докажет пользу Recharts.

Legend/series controls строят canonical server URL с replace semantics; они не
держат отдельное локальное состояние, противоречащее Task 4.

Не менять lightweight custom sparkline dashboard/coaching.

### VERIFY

```bash
cd apps/web
npm test -- tests/unit/quality-trend-chart.test.tsx tests/unit/report-charts.test.tsx tests/unit/report-kpi-row.test.tsx
npm run typecheck
npm run build
```

Зафиксировать route bundle diff. Hard gate: `/reports` ≤+45 KiB gzip,
dashboard/coaching не получают Recharts/Motion.

## Task 6. Оставшийся утверждённый reports chart scope

### RED

Создать:

- `apps/web/tests/unit/report-performance-charts.test.tsx`
- `apps/web/tests/unit/report-process-charts.test.tsx`

Проверить на одном normalized `ChartModel`:

1. Score distribution BarChart сохраняет все buckets, включая zero, и имеет
   table parity.
2. AI confidence и резервная оценка — две синхронизированные линии с одним
   period/order, а не dual-axis.
3. Reason trend показывает missing day как gap и stale comparison date.
4. Criterion agreement/ranked breakdown сортируется детерминированно, показывает
   sample и 80% reference, если применимо.
5. Каждый chart имеет Graph/Table links, units, sample, empty/partial/error
   states и подтверждённый drill-down.
6. URL `series`/`chartView` round-trip не создаёт локальный competing state.

### GREEN

Создать:

- `apps/web/src/components/charts/score-distribution-chart.client.tsx`
- `apps/web/src/components/charts/paired-ai-drift-charts.client.tsx`
- `apps/web/src/components/charts/reason-trend-chart.client.tsx`
- `apps/web/src/components/charts/ranked-breakdown-chart.client.tsx`

Изменить:

- `apps/web/src/components/reports/report-charts.tsx`
- `apps/web/src/components/reports/analytics-intelligence.tsx`
- `apps/web/src/components/reports/report-panels.tsx`
- `apps/web/src/app/reports/page.tsx`

Performance/process charts находятся below fold и динамически импортируются
только рядом с viewport. Server `ChartFrame` и table доступны без rich visual
chunk. Heatmap, risk stack, quota bars и status tables остаются semantic
HTML/CSS, если Recharts не улучшает точность сравнения.

### VERIFY

```bash
cd apps/web
npm test -- tests/unit/report-performance-charts.test.tsx tests/unit/report-process-charts.test.tsx tests/unit/report-chart-frame.test.tsx
npm run typecheck
npm run build
node scripts/verify-route-budgets.mjs --baseline ../../.superpowers/sdd/2026-07-28-kinetics-evilcharts-ui-hardening/preflight/route-budgets.json
```

Deferred rich-chart chunk ≤70 KiB gzip; initial reports hard cap сохраняется.

## Task 7. URL-backed parameters, saved views и evidence Sheet

### RED

Создать:

- `apps/web/tests/unit/report-analysis-state.test.ts`
- `apps/web/tests/unit/report-evidence-sheet.test.tsx`
- `apps/web/tests/integration/report-evidence-resolver.test.ts`

Расширить:

- `apps/web/tests/unit/saved-report-view.test.ts`
- `apps/web/tests/unit/report-saved-views.test.tsx`

Проверить:

1. Allowlisted parse/serialization всех keys из спецификации.
2. Invalid/stale/unauthorized IDs не раскрывают existence чужого record.
3. Graph/Table и series href используют replace state; filter/evidence href
   создают push-compatible URL.
4. Hover/focus/touch inspection не меняет URL.
5. Enter/`Показать данные` открывает Sheet.
6. Sheet имеет Title/Description/`Закрыть`, focus trap, Escape и возвращает focus
   точному trigger; direct deep link возвращает focus к chart heading.
7. Server builder выдаёт не больше пяти PII-minimized authorized review rows.
8. `team` и `block` — стабильные allowlisted slugs, mapped server-side к
   `Conversation.teamName` и `ScorecardCriterion.block`; unknown/stale slugs
   отклоняются.
9. Saved view canonical href проходит round-trip через единственный parser и
   сохраняет HIGH+, Freshdesk/Processes, declining team и AI drift.
10. DB-backed resolver: user без `reports:read`, foreign-workspace evidence и
    stale evidence возвращают одинаковое safe state; permitted same-workspace
    evidence доступно. Current policy `reports:read` workspace-wide; team —
    аналитический filter, не access boundary.

### GREEN

Создать:

- `apps/web/src/lib/reports/report-analysis-state.ts`
- `apps/web/src/lib/reports/report-evidence.ts`
- `apps/web/src/lib/saved-report-view.ts`
- `apps/web/src/lib/saved-report-view-actions.ts`
- `apps/web/src/components/reports/report-parameter-lens.tsx`
- `apps/web/src/components/reports/report-evidence-sheet.tsx`

Изменить:

- `apps/web/src/app/reports/page.tsx`
- `apps/web/src/components/reports/report-command-bar.tsx`
- `apps/web/src/components/reports/report-saved-views.tsx`
- `apps/web/src/components/ui/sheet.tsx`

Lens постоянно показывает только период, сравнение, шаг, Filters count и saved
view menu. Team/source/risk/block находятся в Popover/Sheet. Не больше трёх
active chips.

Sheet desktop 384–448 px; mobile ≤640 — full width/100dvh. Содержимое — sections
и rows, без Card-in-Card.

### VERIFY

```bash
cd apps/web
npm test -- tests/unit/report-analysis-state.test.ts tests/unit/report-evidence-sheet.test.tsx tests/unit/report-command-bar.test.tsx
npm test -- tests/unit/saved-report-view.test.ts tests/unit/report-saved-views.test.tsx tests/integration/report-evidence-resolver.test.ts
npm run typecheck
```

## Task 8. Responsive Operational Command shell

### RED

Создать:

- `apps/web/tests/e2e/report-visualization-layout.spec.ts`

Расширить:

- `apps/web/tests/e2e/analytics-shell-layout.spec.ts`

Проверить 320/390/768/1280/1440, proxy 640/720 и sticky boundaries
`1023×900`, `1024×699`, `1024×700`:

- document overflow ≤2 px;
- tabs в одной scrollable строке;
- точные KPI/grid rules;
- primary chart heights 216/232/280/320;
- chart/driver stack до 1280, 8/4 с 1280;
- tooltip first/middle/last внутри viewport;
- mobile Sheet full-width;
- lens `height<=56px`, одна строка, имеет правильный topbar offset, sticky
  только ≥1024×700 и не перекрывает focus;
- на 320 Triage action находится на отдельной полной строке;
- видимы максимум три active chips и `Ещё n`;
- table/matrix scroll локален.
- criterion matrix wrapper — именованный focusable region; sticky first column
  и header имеют opaque surface и сохраняют положение при local scroll;
- Back/Forward/reload восстанавливают filters, Graph/Table и Evidence Sheet;
- filter change сбрасывает incompatible evidence; close возвращает focus.

### GREEN

Изменить только owners:

- `apps/web/src/components/ui/page-shell.tsx`
- `apps/web/src/components/ui/triage-strip.tsx`
- `apps/web/src/components/reports/report-command-bar.tsx`
- `apps/web/src/components/reports/report-kpi-row.tsx`
- `apps/web/src/components/reports/report-score-panel.tsx`
- `apps/web/src/components/reports/criterion-matrix.tsx`
- `apps/web/src/app/reports/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`

Сохранить:

- dashboard как лёгкую `Сегодня` консоль;
- reports как аналитическое ядро;
- пустой closed activity/evidence trigger без отдельной Card;
- no Card-in-Card, icon tiles, pill soup или decorative eyebrow.

### VERIFY

```bash
cd apps/web
TEST_DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DEMO_SEED_NOW="2026-07-28T09:00:00.000Z" npm run test:e2e -- tests/e2e/report-visualization-layout.spec.ts tests/e2e/analytics-shell-layout.spec.ts
```

Все e2e запускаются только с explicit dedicated `TEST_DATABASE_URL` из Task 1.

После GREEN сделать preliminary screenshot audit Graphite 390/1440 для
dashboard и reports. Это не финальный Hallmark `slop-test`, а ранняя проверка:
двухстрочные actions/tabs, token-only colors/type, accent footprint, один icon
set, Card-in-Card, icon tiles, eyebrows, pill soup и decorative motion. Найденные
дефекты исправляются в Task 8 до перехода к scenario seed.

## Task 9. Сценарные demo-данные

### RED

Создать:

- `apps/web/tests/unit/demo-analytical-stories.test.ts`

Расширить:

- `apps/web/tests/unit/demo-seed-validation.test.ts`
- `apps/web/tests/unit/demo-seed-smoke.test.ts`
- `apps/web/tests/unit/seed-guard.test.ts`

Mutation fixtures должны по одному удалять обязательную историю и получать
specific failure:

- Freshdesk/Processes decline;
- Zendesk improvement;
- appeal concentration;
- low sample;
- exact one AI confidence drop/fallback spike;
- quota pair;
- five evidence IDs per factor;
- four saved views.

Проверить hard cap `<=84 FINALIZED/HUMAN` в обоих rolling windows, включая
predefined/legacy rows; production denial; demo workspace isolation; no global
delete.

Также literal/executable invariants:

- 12 operators / 3 teams / 7 sources / 16 criteria;
- 42 + 42 allocation across rolling windows;
- no future rows в elapsed 22-е–21-е;
- UTC instant → Moscow boundaries → stored UTC;
- LOW/MEDIUM/HIGH/CRITICAL;
- denominator completeness;
- open + overdue coaching;
- acknowledged + pending feedback;
- appeals + reanswers;
- missing-day null gaps;
- >32-char Russian operator и >60-char subject;
- all-null sentiment honest empty state;
- 10–12 score drafts;
- exact names и canonical hrefs четырёх saved views.

Forced mid-seed failure/foreign-workspace preservation остаётся regression test
из Task 1.

### GREEN

Изменить:

- `apps/web/prisma/demo-calendar.ts`
- `apps/web/prisma/demo-review-seeds.ts`
- `apps/web/prisma/demo-operational-seeds.ts`
- `apps/web/prisma/demo-seed-validation.ts`
- `apps/web/prisma/demo-seed-smoke.ts`
- `apps/web/prisma/demo-seed-bootstrap.ts`
- `apps/web/prisma/seed.ts`

Реализовать:

- sole clock `DEMO_SEED_NOW`, parsed UTC;
- Moscow calendar boundaries, stored UTC timestamps;
- rolling 35 + previous 35;
- bounded 42+42 scenario rows replacing cyclic generator;
- 12 operators/3 teams/7 sources/16 criteria;
- 10–12 AI score drafts;
- deterministic saved views;
- server-resolvable evidence IDs;
- atomic Prisma transaction;
- workspace-scoped cleanup/upsert;
- non-overridable production guard.

Все entities, используемые evidence/saved-view links, получают stable explicit
IDs или non-destructive upserts. После двух runs persisted identity set должен
быть literal-equal, не только counts.

### VERIFY

На отдельной dedicated test database с одним и тем же strict clock в обоих runs:

```bash
cd apps/web
npm test -- tests/unit/demo-analytical-stories.test.ts tests/unit/demo-seed-validation.test.ts tests/unit/demo-seed-smoke.test.ts tests/unit/seed-guard.test.ts
PGPASSWORD="qc_app" psql -h localhost -p 55432 -U qc_app -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='qc_app_demo_verify'"
PGPASSWORD="qc_app" createdb -h localhost -p 55432 -U qc_app qc_app_demo_verify
DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" npm run db:deploy
TEST_DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DEMO_SEED_NOW="2026-07-28T09:00:00.000Z" npm run db:seed
TEST_DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DEMO_SEED_NOW="2026-07-28T09:00:00.000Z" npm run db:seed:verify
TEST_DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DEMO_SEED_NOW="2026-07-28T09:00:00.000Z" npm run db:seed
TEST_DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DEMO_SEED_NOW="2026-07-28T09:00:00.000Z" npm run db:seed:verify
npm run typecheck
```

`qc_app_demo_verify` предварительно проверяется как dedicated local test
database. `createdb` выполняется только если предыдущий read-only `SELECT` не
вернул `1`; это не команда для повторного запуска поверх существующей БД.
Второй seed прогон подтверждает одинаковые counts и identity set.

## Task 10. Полная сертификация и cleanup

### Functional/accessibility

Создать:

- `apps/web/tests/e2e/report-reduced-motion.spec.ts`
- `apps/web/tests/e2e/report-keyboard-evidence.spec.ts`
- `apps/web/tests/e2e/appearance-visual.spec.ts`
- `apps/web/tests/e2e/report-history-state.spec.ts`
- `apps/web/tests/e2e/report-performance.spec.ts`
- `apps/web/tests/e2e/report-accessibility.spec.ts`
- `apps/web/tests/e2e/report-cross-browser-smoke.spec.ts`
- `apps/web/tests/e2e/appearance-contrast.spec.ts`
- `apps/web/tests/e2e/appearance-hit-targets.spec.ts`

Изменить:

- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/web/playwright.config.ts`

Разрешённая новая dev dependency: exact
`@axe-core/playwright@4.12.1`. Другой package churn запрещён.

Playwright config получает проекты `chromium`, `firefox`, `webkit`; полная
матрица запускается только в Chromium, smoke — отдельным tagged/filtered набором
в Firefox/WebKit. Перед тестами выполнить browser availability preflight; install
browser binaries не смешивать с кодовыми изменениями.

Проверить:

- keyboard lens → chart → factor → Sheet → review → close;
- Graph/Table parity;
- reduced motion: no nonessential running animations;
- forced colors;
- axe на dashboard и четырёх report views;
- Sheet focus trap/restore;
- no console/hydration errors;
- long Russian labels;
- actual touch emulation.
- Back/Forward/reload и invalid deep link;
- `chartView=table` не запрашивает chunk, содержащий Recharts;
- foreign-workspace/stale evidence дают одинаковое safe UI.
- coarse-pointer controls имеют computed rectangles не меньше 44×44 CSS px;
- во всех семи темах normal text ≥4.5:1, large text/UI/focus/essential chart
  marks ≥3:1 по computed OKLCH/sRGB colors;
- reduced-motion computed duration равен 1 ms или меньше для state transitions,
  loops отсутствуют, selection feedback остаётся видимым.

### Visual matrix

Полная Chromium base matrix: 42 screenshots:

- dashboard;
- reports overview graph;
- admin appearance;
- 7 themes;
- 390/1440.

Отдельно:

- reports Graph/Table на 390/1440;
- pairwise density/corners/contrast в Graphite/Ops;
- WebKit/Firefox Graphite/Ops smoke;
- reflow proxy 640/720;
- ручной 200% zoom Chromium/Firefox/Safari.

### Performance/security

- fresh build route manifests;
- shared chart delta 0;
- reports target +30/hard +45 KiB gzip;
- dashboard/coaching target +5/hard +10 и no Recharts/Motion;
- payload/marks/CLS/long-task/hydration budgets;
- dependency audit;
- no Kinetics/EvilCharts source import;
- no unapproved infinite animation/forced reflow.

`report-performance.spec.ts` hard-fails:

- chart payload >50 KiB, route chart payload >100 KiB или >500 marks;
- chart CLS >0.02, page CLS >0.05;
- chart mount long task >50 ms или eager hydration >100 ms;
- tooltip/keyboard p95 >100 ms;
- route INP >200 ms и LCP >2.5 s на заданном mobile profile;
- hydration/console errors;
- Recharts request в table-only navigation.

Measurement harness:

- Chromium CDP устанавливает CPU throttling rate 4 и Fast-4G profile
  (1.6 Mbps down / 750 Kbps up / 150 ms RTT);
- cold navigation очищает cache/storage перед sample; cached navigation
  выполняется отдельной серией;
- один warm-up не учитывается;
- tooltip/keyboard p95 — nearest-rank p95 по 20 последовательным interaction
  samples после warm-up;
- CLS/long tasks/hydration берутся через `PerformanceObserver`;
- chart island ставит app-owned marks
  `qc-chart-hydration-start` при module evaluation и
  `qc-chart-hydration-end` в первом settled layout effect; разница и есть eager
  hydration budget;
- CI hard gates: bundle, payload, marks count, table chunk absence, CLS, long
  task, hydration duration, console errors и 20-sample interaction p95;
- lab gate перед handoff: пять cold + пять cached navigations, nearest-rank p95
  для LCP/INP при CDP profile; lab report сохраняется в SDD artifacts и считается
  blocking, но не запускается на каждом обычном CI job.

`scripts/verify-route-budgets.mjs` hard-fails shared/report/dashboard/coaching и
deferred chunk limits против fresh Task 1 baseline.

### Full commands

```bash
cd apps/web
npm run typecheck
npm test
npm run build
node scripts/verify-route-budgets.mjs --baseline ../../.superpowers/sdd/2026-07-28-kinetics-evilcharts-ui-hardening/preflight/route-budgets.json
TEST_DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DEMO_SEED_NOW="2026-07-28T09:00:00.000Z" npx playwright test --project=chromium
TEST_DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DEMO_SEED_NOW="2026-07-28T09:00:00.000Z" npx playwright test --project=firefox tests/e2e/report-cross-browser-smoke.spec.ts
TEST_DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DATABASE_URL="postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public" DEMO_SEED_NOW="2026-07-28T09:00:00.000Z" npx playwright test --project=webkit tests/e2e/report-cross-browser-smoke.spec.ts
```

### Final review

Независимый reviewer проверяет:

- spec compliance;
- code quality;
- authorization/data minimization;
- shadcn-only controls;
- real screenshots по Hallmark `Hierarchy / Specificity / Restraint / Variety`;
- нет Card-in-Card, icon tiles, pill soup, декоративного motion;
- ноль незакрытых Critical/Important findings.

Финальный Hallmark gate после deterministic seed повторяет preliminary audit на
полной matrix. `slop-test.md` запускается строго на финальном handoff, не раньше.
