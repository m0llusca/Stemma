# Kinetics + Recharts: fit для Stemma

Вердикт команды. Не каталог «красивых графиков».

Источники: [Kinetics](https://kinetics.colorion.co/#library), [Recharts](https://recharts.github.io/).

**Kill list:** vanity-график без drill в очередь; декоративное motion на очереди.

Лицензия / копирование кода — отдельный аудит: [2026-07-28](memory/2026-07-28-kinetics-evilcharts-provenance-audit.md). Здесь — продуктовый fit. React-демо Kinetics не копируем; в `globals.css` живут только опубликованные spring-токены (duration / cubic-bezier).

## Recharts

Уже в проекте: `recharts@^3.8.0`, shadcn `chart.tsx` / `ChartContainer`, `score-sparkline`.

Стек: Next 16 + React 19. Не Next 19.

Где можно: Exec risk home, Lead SLA/load, отчёты. Только осмысленные графики.

Контракт клика = тот же drill, что `opsQueueKpiHref` / role-home:

- overdue → `/reviews?due=overdue`
- unstarted → `/reviews?qaStatus=QUEUED`
- zero → role home или `/reviews` без фильтра
- никогда impostor `status=unreviewed`
- empty / zero — без fake-green
- empty SoT для Exec = `queueFilterResetHref`, не `qaStatus=QUEUED`

Реализация:

- Exec risk chart — client island (`exec-risk-chart-island.client.tsx`) statically imports `exec-risk-chart.client`. Do not use `dynamic({ ssr: false })` — Next CSR-bails and the turbopack async chunk never loads. `ExecRiskHome` stays RSC: do not put `dynamic({ ssr: false })` in the RSC either (`/dashboard` 500).
- error boundary + «Повторить»; KPI остаются
- Exec plot — `StaticChartContainer` + first-render hand-rolled `<svg className="recharts-surface">` bars (same paint path as `/reports`). Do not use Recharts 3 `<BarChart>`: `RootSurface` stays null until a size effect/Redux write, so LIVE freezes on an empty `.recharts-wrapper`.
- Exec a11y = summary / table beside chart (sr-only + visible table). No Recharts `accessibilityLayer` on this path.

**Spike** = первый осмысленный drill-chart на существующих `Chart*`. Новую библиотеку не добавляем.

## Kinetics

Публичного npm у Colorion Kinetics нет (gallery-only). First-party пакет `@stemma/kinetics` держит spring-токены и хелперы; registry `kinetics` — чужой accelerometer-пакет, не ставить.

Слой motion поверх shadcn **base-nova**, не замена DS. В проекте уже `tw-animate-css` и sonner — вторую motion-систему не заводим.

**Не брать:** magnetic cursor, liquid glass, trails, speed-dial, decorative dock, ripple theater, scramble/typewriter, pulse-badge spam — не на chrome очереди и не на спокойных Agent-поверхностях.

### Adopted tokens (phase 2)

Spring-значения живут в `@stemma/kinetics/tokens.css` (импорт из `globals.css`). React-демо Colorion не вендорим. Июльский provenance-аудит банил Shimmer Skeleton как чужой код; здесь — независимый token-backed shimmer на `--muted` / `--card`.

| Pattern | Tokens | Surface |
| --- | --- | --- |
| Toast overshoot | `--motion-ease-spring-toast`, `--motion-duration-spring-enter` | sonner `[data-sonner-toast].cn-toast` |
| Switch spring | `--motion-ease-spring-overshoot`, `--motion-duration-spring` | `Switch` thumb |
| KPI / digit bump | `--motion-scale-kpi-bump`, `qc-kpi-bump` | `StatKpi`, report / ops KPI titles |
| Skeleton shimmer | `--motion-duration-shimmer`, `qc-skeleton-shimmer` | `[data-slot="skeleton"][data-qc-motion="static-loop"]` |
| Status pill morph | `--motion-duration-morph`, `--motion-ease-spring-gentle` | `Badge` / `Chip` / `StatusBadge` |
| Admin accordion | `--motion-ease-spring-panel`; chevron is Morphicons | `Accordion` panel; trigger uses `DisclosureMorphChevron` |
| Icon morph swap (#117) | `morphicons` + `reducedMotion="user"` | CopyButton Copy↔Check; accordion / score-module chevron |
| Tab-pill glide (optional) | `--motion-ease-spring-glide` | `TabsTrigger`, `PageShell` tabs |
| Chart enter (#109) | `--motion-duration-spring-enter`, `--motion-ease-spring-panel`, `qc-chart-enter` | `[data-qc-motion="chart-enter"]` on `StaticChartContainer` / score sparkline |
| Progress spring | `--motion-duration-spring`, `--motion-ease-spring-overshoot` | `Progress` indicator |
| Checkbox / radio settle | `--motion-duration-spring`, `--motion-ease-spring-overshoot` | `Checkbox` / `RadioGroup` indicators |
| Toggle glide | `--motion-duration-spring-glide`, `--motion-ease-spring-glide` | `Toggle` |
| Sheet enter | `--motion-duration-spring-enter`, `--motion-ease-spring-panel` | `Sheet` overlay + content |
| Dialog / alert enter | `--motion-duration-spring-enter`, `--motion-ease-spring-panel` | `Dialog` / `AlertDialog` overlay + content |
| Hover lift | `--motion-scale-hover-lift`, `--motion-distance-hover-lift` | `[data-qc-motion="hover-lift"]` on `StatKpi` cards |
| Accordion trigger | `--motion-duration-spring-panel`, `--motion-ease-spring-panel` | `AccordionTrigger` |
| Evidence jump (JS) | `prefersReducedMotion()`, `kineticsDurationMs.feedbackFlash` | `EvidenceJumpLink` scroll + flash |
| Inline bars (JS) | `kineticsStyle("width", "overshoot")` | report / analytics / criterion / review width fills |
| Icon morph (JS) | `kineticsMorphSpring` | `MorphIcon` default spring |
| Package | `@stemma/kinetics` | tokens.css + JS helpers; not Colorion React demos |

`prefers-reduced-motion: reduce` обнуляет duration-токены до `1ms`, гасит skeleton / KPI / chart-enter / toast animation и снимает shimmer `background-image`. Recharts `isAnimationActive` остаётся `false`. Unit lock: `apps/web/tests/unit/ui-theme-contract.test.ts`.

## Кто видит графики

| Роль | Графики |
| --- | --- |
| EXEC | один risk chart, если click = drill |
| Lead / Admin | SLA / load + отчёты; bar / point → отфильтрованная очередь |
| Analyst | без hero; мини только в отчётах |
| Agent | без vanity charts / ranks |
| VIEWER | нет |

## Фазы

1. Drill-chart spike на Exec (потом Lead) — **сделано** (PR #101 / #99, master ~`3fff63f`; island P0 #104, master ~`74b875a`; paint #113, master `fcbcbbf`): Exec drill-chart done; paint = static SVG via `StaticChartContainer` (not Recharts BarChart); click = `opsQueueKpiMetricHref` / same KPI drills; empty SoT `queueFilterResetHref(EXEC)` → `/reviews`; Agent/VIEWER chartless; summary table beside chart. Island — static import, не RSC `ssr:false`.
2. Kinetics: 4–6 токенов / паттернов — **сделано** (токены + wiring выше)
3. Эта заметка — fit; таблица adopted tokens обновляется вместе с CSS

## Residual

Empty «Сигналы риска»: RSC `EmptyState` + `queueFilterResetHref(EXEC)` — never Suspense / «Загрузка графика».

Non-empty Exec: static client import → `StaticChartContainer` + first-paint SVG rects. No Recharts `<BarChart>`, no `.recharts-wrapper`, no `accessibilityLayer`, no eternal pending.

`/reports` rich visuals: same static-import + hand-rolled SVG (not IO-gated `import()`).

~~LIVE blank wrapper / eternal pending~~ — fixed (#113).

#109 / #119 visual contract: «Цель» HTML badge outside the plot (`ChartGoalBadge`, chip + tabular-nums, no SVG rotate); score-over-time sparkline uses padded 1:1 geometry + `preserveAspectRatio="xMidYMid meet"` so markers stay circular; footer Мин/Цель/Макс is `ChartScaleFooter` (`text-sm tabular-nums`); Exec / Lead SLA bars share `StaticCategoryBarPlot` (static SVG rects, HTML axis labels); report rich plots lock CSS aspect to the viewBox so `preserveAspectRatio="none"` does not squash ticks/markers; `data-qc-motion="chart-enter"` on `StaticChartContainer` / score sparkline; Recharts `isAnimationActive` stays false.

## Тесты

- unit: click → тот же href, что `opsQueueKpiHref`
- Kinetics tokens + reduced-motion off: `apps/web/tests/unit/ui-theme-contract.test.ts`
- Agent и VIEWER — без графиков
