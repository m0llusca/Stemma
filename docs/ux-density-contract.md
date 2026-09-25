# UX-контракт: плотность экранов

Locked density chrome: **`dca6c00`** ([#167](https://github.com/m0llusca/Stemma/pull/167) / [#166](https://github.com/m0llusca/Stemma/issues/166)). Soft package tip **`e325df6`** ([#170](https://github.com/m0llusca/Stemma/pull/170) / [#169](https://github.com/m0llusca/Stemma/issues/169)). **#172/#173** tip **`67635ab`**. LIVE: https://nvqawe-ip-184-193-214-193.tunnelmole.net (tip **`3aedc85`**, docs [#179](https://github.com/m0llusca/Stemma/pull/179); soft [#178](https://github.com/m0llusca/Stemma/pull/178) / [#175](https://github.com/m0llusca/Stemma/issues/175) closed). Verify-DB smoke tip **`2556e9e`** ([#176](https://github.com/m0llusca/Stemma/pull/176)).

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
| ChartFrame | Ready / empty / error / loading обнимают контент. Нет `min-h-60` под будущий график. Loading — компактный `h-16` skeleton |
| Exec empty / error | `EXEC_RISK_CHART_MIN_HEIGHT_CLASS` = `h-[180px]`. Не 200 / 240 |
| Lead quality | высота plot, не min-h карточки |

## `/self-review`

Паки — accordion.

- Один открытый по умолчанию: `defaultValue={[actionConversations[0].id]}`, `multiple={false}`.
- `hiddenUntilFound`: закрытые паки остаются в DOM (`hidden="until-found"`) для find-in-page. Closed panel: `height: 0` (не `h-(--accordion-panel-height)` / не content-visibility box). Не красить ~26k px и не ронять вкладку на 1440×900.
- Тема/subject — `AccordionTrigger`. Клик по теме **только** раскрывает/сворачивает (не только шеврон). Не вести на `/reviews/…`. Полный кейс — отдельная кнопка «Открыть» в теле пака. `aria-expanded` совпадает с open.
- Гейт: высота вкладки ~3k с одним открытым, не со всеми. Не раскрывать все паки.

Доска разбора (`ReviewDisclosure`): клик по заголовку/subject — тот же trigger, что и шеврон. `aria-expanded` = `open`. Закрытая панель остаётся в DOM (визуально скрыта native `details`) — find-in-page без keepMounted/~26k.

История: тот же accordion, без default open.

## Очередь `/reviews`

- Next-case preview: без `h-full`. Preview над таблицей на всю ширину — без правой колонки и дыры после скролла. **«Взять следующий»** один раз — в шапке страницы, не в preview.
- SLA/OTRS helper фильтров: `sr-only` на повторных визитах. Первый визит — компактный info-баннер в один ряд: иконка + короткий текст + dismiss. Не `AlertTitle` / не карточка на полэкрана. Условия показа не менять.
- Строки таблицы: две линии, `h-auto py-1.5`.
- Workspace: `gap-(--section-gap)`, main — `flex-col`.

## Chrome / truncate

- Роль в topbar: wrap + `title=`. Не `max-w-36` clip длинных имён («Руководитель контроля качества»).
- «Сменить роль»: длинный `optionLabel` truncate **с** `title=`. Viewer pending: меню вверх (`side="top"`), не ниже viewport.
- `title=` на truncate: поиск, dashboard, calibration, coaching, reports, system jobs.
- `/reports` «Факторы изменения»: шире левый gutter (`RANKED_DRIVER_VIEWBOX` left 168 / width 520), `wrapSvgLabel` до 2 строк, SVG `<title>` + `pointer-events: auto`. Нет `Тимофе…` без полного имени (title/tooltip).
- Admin hub: title + badge truncate с `title=`.
- **«Нагрузка проверяющих»:** сетка 3 колонки (Проверяющий / Очередь / В работе), без горизонтального скролла Table.

## `/reports` P0 — #172

Роман: прошлый density-проход был поверхностным. Четыре экрана — закрыты в #173. Новые FAIL с полного прохода складываются **сюда же**, не во второй PR.

| Экран | Контракт |
| --- | --- |
| «Согласие AI с проверяющими» | `rankedPlotHeight`: ряд = `RANKED_ROW_HEIGHT` (22), `RANKED_BAR_FILL` 0.82. Без `min(420, max(220, n*36))`. ChartFrame без `min-h-60` на ready. SVG `height` в px + `preserveAspectRatio="none"`. Имена критериев — HTML-колонка + `title=`. Не рисовать фейковые точки. |
| Обзор | Два графика в `xl:grid-cols-2` + `items-start`. «Цепочка драйверов» — отдельная полная ширина (`DriverChainCard`). CTA «Углубить анализ» — одна строка, `secondary`/`xs`, `w-fit`. Нет min-height под будущий график. |
| Люди / Статусы | Секции `report-details-people` / `report-details-statuses`: сетка `items-start` без stretch на viewport. Мало данных — компактный inline empty внутри карточки, не пустыня. |
| Разрезы (таблицы) | `BreakdownTable`: `table-fixed w-full`, `overflow-hidden`, `h-fit`, truncate + `title=`. `QuotaTable` — полная ширина (`report-details-quotas`), не колонка 444px: `table-fixed`, sticky первая колонка, wrap, «Открыть». Скролл только если таблица реально широкая. |

Тесты: `apps/web/tests/unit/reports-density-p0.test.ts`. Follow-up FAIL — новый `describe` в том же файле.

## `/coaching` — пустые оболочки оператора

Гейт Marques / Дешон / Джамал. Мерить **всю карточку**, не один текст.

| Срез | Контракт |
| --- | --- |
| Cold `/coaching` | Карточка «Планы коучинга»: header-only `sm`, ~67px. Copy «Здесь появятся планы развития, которые назначит руководитель.» Нет lead «Сгруппируйте разборы…». Нет `CardContent`. |
| Filtered, напр. `?view=week` | Карточка «На неделе»: вся ≤120px. Принято ~67px header-only `sm`. Нет `CardContent`, нет nav + filters shell. Текст «В этом срезе нет задач.» |

Lead/Admin: EmptyState и CTA остаются. Нет пустых карточек тренда/зон и дыры под графиком.

Jamal / Дешон вне `/reports` (пакет `#173`, tip **`67635ab`**):

| Приоритет | Контракт |
| --- | --- |
| P0 `/self-review` | Один открытый пак; closed `height: 0` + `hiddenUntilFound`; subject = trigger; «Открыть» отдельно. Crash с walk `b2fbcc1` — **NACK** на `3f3745d`+: один открытый ~3k, уже в density accordion. Soft HTML ~3MB — не блокере. |
| P1 `/coaching` | Cold vs filtered — таблица выше. Мерить всю карточку. |
| P1 `/calibration` | «Сигналы по апелляциям» — compact inline empty. |
| P1 `/reviews/[id]` | Title wrap + `title=`; context grid `sm:grid-cols-3` без воздуха. |
| P1 chrome | Role menu `title=`; Viewer pending menu `side="top"`. |
| P1 `/reviews` reset | «Сбросить фильтры» снимает overdue + assignee → `/reviews`. Welcome-back «очередь дня» — QA inbox. |

## Soft — Закрыто в #169

На master **`e325df6`** (#170): Day1 compact; тема = trigger + «Открыть»; preview над таблицей; `/reports` оси/title. Не писать «не закрыто». 

Открытое (не блокер):

| Остаток | Статус |
| --- | --- |
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
| Coaching empty | `apps/web/src/app/coaching/page.tsx`, `empty-honesty.ts` |
| Queue | `queue-workspace.tsx`, `queue-next-case-preview.tsx`, `queue-table.tsx`, `queue-advanced-filters.tsx` |
| Chrome role / topbar | `app-nav-shell.tsx` |
| Нагрузка | `apps/web/src/app/dashboard/page.tsx` |
| Тесты | `density-layout-contract.test.ts`, `reports-density-p0.test.ts` |

Related: [app-shell.md](app-shell.md), [ux-queue-hotkeys-contract.md](ux-queue-hotkeys-contract.md), [ux-dialogue-timeline-contract.md](ux-dialogue-timeline-contract.md), [research-kinetics-recharts.md](research-kinetics-recharts.md).
