# UX-контракт: плотность экранов

Locked density chrome: **`dca6c00`** ([#167](https://github.com/m0llusca/Stemma/pull/167) / [#166](https://github.com/m0llusca/Stemma/issues/166)). Soft residuals: **`5169e12`** ([#169](https://github.com/m0llusca/Stemma/issues/169) / [#170](https://github.com/m0llusca/Stemma/pull/170), Marques spec). LIVE: https://hospital-studies-width-martha.trycloudflare.com.

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
- Тема/subject — `AccordionTrigger`. Клик по теме **только** раскрывает/сворачивает (не только шеврон). Не вести на `/reviews/…`. Полный кейс — отдельная кнопка «Открыть» в теле пака. `aria-expanded` совпадает с open.
- Гейт: высота вкладки ~3k с одним открытым, не со всеми. Не раскрывать все паки.

Доска разбора (`ReviewDisclosure`): клик по заголовку/subject — тот же trigger, что и шеврон. `aria-expanded` = `open`. Закрытая панель остаётся в DOM (визуально скрыта native `details`) — find-in-page без keepMounted/~26k.

История: тот же accordion, без default open.

## Очередь `/reviews`

- Next-case preview: без `h-full`. Preview над таблицей на всю ширину — без правой колонки и дыры после скролла. Строки не сжимаются в искусственно узкую колонку. **«Взять следующий»** один раз — в шапке страницы, не в preview.
- SLA/OTRS helper фильтров: `sr-only` на повторных визитах. Первый визит — компактный info-баннер в один ряд: иконка + короткий текст + dismiss. Не `AlertTitle` / не карточка на полэкрана. Условия показа не менять.
- Строки таблицы: две линии, `h-auto py-1.5`.
- Workspace: `gap-(--section-gap)`, main — `flex-col`.

## Chrome / truncate

- Роль в topbar: wrap + `title=`. Не `max-w-36` clip длинных имён («Руководитель контроля качества»).
- `title=` на truncate: поиск, dashboard, calibration, coaching, reports, system jobs.
- `/reports` «Факторы изменения»: шире левый gutter (`RANKED_DRIVER_VIEWBOX` left 168 / width 520), `wrapSvgLabel` до 2 строк, SVG `<title>` + `pointer-events: auto`. Нет `Тимофе…` без полного имени (title/tooltip).
- Admin hub: title + badge truncate с `title=`.
- **«Нагрузка проверяющих»:** сетка 3 колонки (Проверяющий / Очередь / В работе), без горизонтального скролла Table.

## Soft — не закрыто

Не писать PASS / closed на том, что ещё в столе.

| Остаток | Статус |
| --- | --- |
| Day1 **«SLA и OTRS»** | Закрыто в #169: компактный Alert один ряд (Info + текст + dismiss); повторные — `sr-only` helper фильтров |
| Accordion a11y | Закрыто в #169: тема = trigger; `aria-expanded` = open; `hiddenUntilFound` на self-review; доска — `ReviewDisclosure` (title click, панель в DOM) |
| `/reviews` после скролла | Закрыто в #169: preview над таблицей, без правой колонки / дыры |
| `/reports` оси | Закрыто в #169: шире gutter + wrap + SVG `<title>` |
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
