# UX-контракт: плотность экранов

Locked. Tip **`dca6c00`** (squash [#167](https://github.com/m0llusca/Stemma/pull/167) / [#166](https://github.com/m0llusca/Stemma/issues/166)). PR tip был `be7776e`. LIVE bailey, login 200.

Appearance density доходит до page chrome. Пустые слоты не растягивают экран. Менять ритм PageShell / Card / Empty / графиков — только явным продуктовым решением. Тихий дрейф запрещён.

## Зачем

Роман: все экраны — читаемость, артефакты, воздух. Раздутые дашборды сжать. Бессмысленные дыры убрать. Honesty не трогать: ExecRisk, triage, `--interactive-min-size`, evidence [#164](https://github.com/m0llusca/Stemma/pull/164).

## Density → chrome

Токены на `<html>` (`globals.css`). Appearance пишет `data-density`. Chrome читает токены — не hardcoded gap/padding.

| Токен | compact | comfortable | spacious |
| --- | --- | --- | --- |
| `--section-gap` | 1.125rem | 1.5rem | 1.875rem |
| `--app-topbar-inline` | 14px | 18px | 22px |
| `--page-shell-padding` | = `--page-gutter` | same | same |

**PageShell** и loading chrome (`PageSkeleton`): `gap-(--section-gap)` + `p-(--page-shell-padding)`. Не `gap-6` / `gap-7` / `p-3 md:p-6`.

**Topbar:** `px-(--app-topbar-inline)`.

**Queue workspace + Admin frame:** `--section-gap`. Не вложенный `gap-6` / `lg:gap-7`.

## Card

Один вертикальный ритм.

- Header с `border-b` → Card `gap-0`. Не складывать `CardContent pt-(--card-spacing)` сверху (~35 вызывающих).
- Default overflow: `visible`. Clip — точечно (next-case preview).
- Lead quality card: без `min-h-[260px]`.
- Dashboard focus-row: без лишних `min-h-[62px]` / `[42px]`.

## Empty

- Root Empty: без `flex-1`. Stretch — opt-in у вызывающего.
- Inline EmptyState: `py-3`. Block: `py-8`.
- Report KPI / table / chart panels: без `h-full` на пустых слотах.

## Графики

Не рисовать фейковые точки на пустом графике.

| Поверхность | Контракт |
| --- | --- |
| ChartFrame | `min-h-60` только loading / ready. Empty / error обнимают контент |
| Exec empty / error | `EXEC_RISK_CHART_MIN_HEIGHT_CLASS` = `h-[180px]`. Не 200 / 240 |
| Lead quality | высота plot, не min-h карточки |

## `/self-review`

Пакы — accordion.

- Один открытый по умолчанию: `defaultValue={[actionConversations[0].id]}`, `multiple={false}`.
- `hiddenUntilFound`: закрытые паки остаются в DOM (`hidden="until-found"`) для find-in-page и не красят ~26k px. Не раскрывать все паки.
- Тема/subject — `AccordionTrigger`. Клик по теме раскрывает/сворачивает. Ссылка в проверку — в теле пака («Открыть»), не в заголовке.
- Гейт: высота вкладки ~3k с одним открытым, не со всеми.

История: тот же accordion, без default open.

## Очередь `/reviews`

- Next-case preview: без `h-full`. Preview над таблицей на всю ширину — без правой колонки и дыры после скролла. **«Взять следующий»** один раз — в шапке страницы, не в preview.
- SLA/OTRS helper фильтров: `sr-only` на повторных визитах. Первый визит — компактная однострочная chip, не жирный Alert.
- Строки таблицы: две линии, `h-auto py-1.5`.
- Workspace: `gap-(--section-gap)`, main — `flex-col`.

## Chrome / truncate

- Роль в topbar: wrap + `title=`. Не `max-w-36` clip длинных имён («Руководитель контроля качества»).
- `title=` на truncate: поиск, dashboard, calibration, coaching, reports, system jobs.
- `/reports` оси и category labels: `title=` на tick (SVG `<title>` если ellipsis) + `pointer-events: auto`, чтобы hover не блокировался `pointer-events-none` у surface.
- Admin hub: title + badge truncate с `title=`.
- **«Нагрузка проверяющих»:** сетка 3 колонки (Проверяющий / Очередь / В работе), без горизонтального скролла Table.

## Soft — не закрыто

Не писать PASS / closed на том, что ещё в столе.

| Остаток | Статус |
| --- | --- |
| Day1 **«SLA и OTRS»** | Закрыто в #169: однострочный chip на первом визите; повторные — `sr-only` helper фильтров |
| Accordion a11y | Закрыто в #169: тема = trigger; `hiddenUntilFound` для find-in-page |
| `/reviews` после скролла | Закрыто в #169: preview над таблицей, без правой колонки |
| `/reports` оси | Закрыто в #169: `title=` / SVG `<title>` на truncated ticks |
| Критерии / таймлайн | Вертикальный bloat не трогали: `--interactive-min-size` + #164 |
| Пустые графики | Не изобретать точки |

## Ownership

| Concern | Модуль |
| --- | --- |
| Токены density | `apps/web/src/app/globals.css` |
| PageShell / skeleton | `page-shell.tsx`, `loading-states.tsx` |
| Card / Empty | `card.tsx`, `empty.tsx`, `empty-state.tsx` |
| ChartFrame / Exec | `chart-frame.tsx`, `chart-visual-preset.tsx`, `exec-risk-empty.tsx` |
| Self-review | `apps/web/src/app/self-review/page.tsx` |
| Queue | `queue-workspace.tsx`, `queue-next-case-preview.tsx`, `queue-table.tsx`, `queue-advanced-filters.tsx` |
| Chrome role / topbar | `app-nav-shell.tsx` |
| Нагрузка | `apps/web/src/app/dashboard/page.tsx` |
| Тесты | `density-layout-contract.test.ts` |

Related: [app-shell.md](app-shell.md), [ux-queue-hotkeys-contract.md](ux-queue-hotkeys-contract.md), [ux-dialogue-timeline-contract.md](ux-dialogue-timeline-contract.md), [research-kinetics-recharts.md](research-kinetics-recharts.md).
