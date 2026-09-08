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

- Exec risk chart — client island (`exec-risk-chart-island.client.tsx`) statically imports `exec-risk-chart.client` (Recharts). Do not use `dynamic({ ssr: false })` — Next CSR-bails and the turbopack async chunk never loads. `ExecRiskHome` stays RSC: do not put `dynamic({ ssr: false })` in the RSC either (`/dashboard` 500).
- падение чанка — error boundary + «Повторить»; KPI остаются
- Exec plot — `StaticChartContainer` + first-render hand-rolled `<svg className="recharts-surface">` bars (same paint path as `/reports`). Do not use Recharts 3 `<BarChart>`: `RootSurface` stays null until a size effect/Redux write, so LIVE freezes on an empty `.recharts-wrapper`.
- a11y: summary / таблица рядом с графиком (`accessibilityLayer` в v3)
- lazy per-route (бандл) — внутри island

**Spike** = первый осмысленный drill-chart на существующих `Chart*`. Новую библиотеку не добавляем.

## Kinetics

Не npm-зависимость. Каталог spring CSS / React / prompt-паттернов.

Слой motion поверх shadcn **base-nova**, не замена DS. В проекте уже `tw-animate-css` и sonner — вторую motion-систему не заводим.

**Не брать:** magnetic cursor, liquid glass, trails, speed-dial, decorative dock, ripple theater, scramble/typewriter, pulse-badge spam — не на chrome очереди и не на спокойных Agent-поверхностях.

### Adopted tokens (phase 2)

Скопированы только spring-значения (duration / cubic-bezier) в `apps/web/src/app/globals.css`. React-демо Kinetics и пакет не ставим. Июльский provenance-аудит банил Shimmer Skeleton как чужой код; здесь — независимый token-backed shimmer на `--muted` / `--card`.

| Pattern | Tokens | Surface |
| --- | --- | --- |
| Toast overshoot | `--motion-ease-spring-toast`, `--motion-duration-spring-enter` | sonner `[data-sonner-toast].cn-toast` |
| Switch spring | `--motion-ease-spring-overshoot`, `--motion-duration-spring` | `Switch` thumb |
| KPI / digit bump | `--motion-scale-kpi-bump`, `qc-kpi-bump` | `StatKpi`, report / ops KPI titles |
| Skeleton shimmer | `--motion-duration-shimmer`, `qc-skeleton-shimmer` | `[data-slot="skeleton"][data-qc-motion="static-loop"]` |
| Status pill morph | `--motion-duration-morph`, `--motion-ease-spring-gentle` | `Badge` / `Chip` / `StatusBadge` |
| Admin accordion | `--motion-ease-spring-panel`, chevron overshoot | `Accordion` panel + trigger icon |
| Tab-pill glide (optional) | `--motion-ease-spring-glide` | `TabsTrigger`, `PageShell` tabs |
| Chart enter (#109) | `--motion-duration-spring-enter`, `--motion-ease-spring-panel`, `qc-chart-enter` | `[data-qc-motion="chart-enter"]` on `StaticChartContainer` / score sparkline |

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

1. Drill-chart spike на Exec (потом Lead) через текущие `Chart*` — **сделано** (PR #101 / #99, master ~`3fff63f`; island P0 #104, master ~`74b875a`): BarChart via existing Chart*, click = `opsQueueKpiMetricHref` / same KPI drills; empty chart + TriageStrip primary share one SoT `queueFilterResetHref(EXEC)` → `/reviews` (not dual QUEUED vs bare /reviews); Agent/VIEWER chartless; summary table beside chart. Lazy-load — client island, не RSC `ssr:false`.
2. Kinetics: 4–6 токенов / паттернов — **сделано** (токены + wiring выше)
3. Эта заметка — fit; таблица adopted tokens обновляется вместе с CSS

## Residual

Empty «Сигналы риска» is honest (#113): RSC renders `EmptyState` + `queueFilterResetHref(EXEC)` when empty — never wrap that path in `Suspense` / «Загрузка графика». Non-empty hydrates via a **static** client import of the Recharts chart (no `dynamic({ ssr: false })` — that CSR-bails and never fetches the chunk). `/reports` rich visuals use the same static import (no IO-gated `import()` / eternal «Загрузка визуального представления»). ~~LIVE eternal pending~~ — fixed.

#109 visual contract unchanged: «Цель» HTML badge outside the plot (`ChartGoalBadge`, no SVG rotate); solid markers `r=3` (`r=4` last); footer Мин/Цель/Макс is `ChartScaleFooter` (`text-sm tabular-nums`); `data-qc-motion="chart-enter"` on `StaticChartContainer` / score sparkline; Recharts `isAnimationActive` stays false; tokens in `chart-visual-preset.tsx`.

Lead SLA chart still follow-up.

## Тесты

- unit: click → тот же href, что `opsQueueKpiHref`
- Kinetics tokens + reduced-motion off: `apps/web/tests/unit/ui-theme-contract.test.ts`
- Agent и VIEWER — без графиков
