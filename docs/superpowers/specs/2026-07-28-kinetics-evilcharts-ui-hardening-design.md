# Укрепление интерфейса: shadcn, аналитические графики и управляемое движение

Дата: 2026-07-28

Статус: самостоятельно проверена и одобрена к реализации 2026-07-28 по
делегированному пользователем праву; итоговые независимые вердикты 19/21/23/24 —
APPROVE

Проект: `apps/web`

## Контекст

После полной миграции продукта на shadcn/ui интерфейс снова работает и прошёл
базовую визуальную сертификацию, однако аналитический слой остаётся неоднородным:
часть графиков собрана вручную на SVG, часть показателей отображается CSS-полосами,
а существующий shadcn `ChartContainer` на Recharts фактически не используется.
Пользователь попросил укрепить продукт идеями из Kinetics и EvilCharts, полностью
реализовать полезный производственный слой, сохранить shadcn/Base UI и проверить
результат на насыщенных демонстрационных данных.

Исследование охватило:

- все 135 паттернов [Kinetics](https://kinetics.colorion.co/), исходный
  [репозиторий Kinetics](https://github.com/ckissi/kinetics) и доступность,
  жизненный цикл, производительность и лицензионную поверхность паттернов;
- все 39 страниц документации [EvilCharts](https://evilcharts.com/docs),
  `llms.txt`, `llms-full.txt`, registry JSON, Recharts- и ECharts-варианты,
  исходный [репозиторий EvilCharts](https://github.com/legions-developer/evilcharts)
  и MIT-лицензию;
- конфигурацию shadcn/Base UI, Tailwind v4, Next.js 16, React 19 и Recharts 3.8
  в текущем проекте;
- существующие маршруты dashboard/reports, ручные SVG-графики, таблицы,
  appearance settings, тему, seed и тестовую матрицу;
- три независимых интерфейсных направления:
  `Operational Clarity`, `Analytical Command Center` и `Guided Investigation`.

Полный перечень 135 Kinetics-паттернов, 39 EvilCharts docs pages, audited commit,
registry items и SHA-256 сохранён в
`docs/memory/2026-07-28-kinetics-evilcharts-provenance-audit.md`.

Context7 был вызван первым в соответствии с инструкциями проекта, но его
месячная квота исчерпана. Поэтому текущие контракты сверены по официальной
документации, CLI shadcn и исходному коду библиотек.

## Подтверждённые выводы

### Kinetics

Kinetics — не устанавливаемая React-библиотека и не runtime spring engine, а
галерея copy-paste паттернов. NPM-пакет `kinetics` относится к другому продукту.
Репозиторий не содержит `LICENSE`, хотя сайт заявляет MIT. Поэтому:

- пакет `kinetics` не устанавливается;
- исходный код паттернов не копируется до явного подтверждения лицензии;
- высокоуровневые идеи реализуются независимо внутри существующих shadcn-
  примитивов;
- декоративные, бесконечные, pointer-only и нарушающие reduced motion эффекты
  запрещены.

### EvilCharts

EvilCharts — shadcn registry с локально копируемым исходным кодом, а не NPM-
runtime. Полная поставка обоих движков добавила бы около 21 000 строк локально
поддерживаемого кода. Даже один Recharts line chart приносит около 2 700 строк и
новую зависимость `motion`.

Текущие данные продукта содержат десятки, а не тысячи точек. Recharts уже
установлен. ECharts сейчас не оправдан и создаёт дополнительные риски:

- canvas-вывод без эквивалентного клавиатурного контракта;
- tooltip, формируемый из неэкранированного HTML;
- отдельная модель темизации и клиентской инициализации;
- крупная зависимость и второй движок тестирования.

Registry-код EvilCharts не принимается как готовый production-компонент:
кликабельные legend реализованы через `div`, часть анимаций не уважает reduced
motion, loading использует случайные данные, а доступность семейств неодинакова.

### Текущий проект

1. В проекте уже есть Recharts и shadcn `components/ui/chart.tsx`, но продуктовые
   маршруты его не используют.
2. Существуют три частично дублирующих реализации sparkline/trend.
3. Текущие ручные графики имеют важные сильные стороны: focus/hover parity,
   `aria-describedby`, клавиатурные точки и нецветовое выделение.
4. `report-aggregation.ts` импортирует presentation-типы из компонента, что
   нарушает направление зависимостей.
5. `globals.css` определяет только Graphite и Night Ops. Azure, Emerald, Violet,
   Amber и Rose остались в намеренно неподключённом `theme.css`, поэтому
   визуально сводятся к Graphite.
6. Live preview меняет `body[data-theme]`, но не синхронизирует `html.dark`.
   Переход в Night Ops или из него расходится с `dark:` utilities до reload.
7. Density, corners и contrast также остаются неработающими, потому что их
   селекторы находятся в неподключённом CSS.
8. В активном CSS нет общей политики reduced motion.

## Значение «полностью внедрить»

В этой спецификации «полностью внедрить Kinetics и EvilCharts» означает
законченно реализовать и сертифицировать **полезный производственный поднабор**:

- единый motion-policy для существующих shadcn-примитивов;
- независимые аналоги одобренных Kinetics-паттернов;
- единый app-owned chart contract на shadcn `ChartContainer` и Recharts;
- аналитическое ядро `/reports` с graph/table parity и evidence drill-down;
- полный контракт семи тем и appearance modifiers;
- реалистичные данные, доступность, responsive и regression gates.

Это не означает копирование всех 135 эффектов или всех 16 вариантов графиков.
Такое копирование ухудшило бы лицензионную определённость, доступность,
производительность и сопровождение.

## Цели

1. Сделать тему, плотность, радиусы и контраст честными работающими функциями.
2. Ввести один архитектурный контракт аналитических данных и графиков.
3. Использовать Recharts для графиков, где он улучшает понимание; оставить
   таблицы, heatmap и простые полосы семантическим HTML.
4. Превратить `/reports` в более сильный аналитический инструмент, не дублируя
   его на `/dashboard`.
5. Сохранить текущие русские маршруты, tabs, бизнес-термины, href и server actions.
6. Добавить evidence-first drill-down без новой параллельной навигации.
7. Сделать все факты графика доступными в таблице и с клавиатуры.
8. Обеспечить reduced motion, lifecycle cleanup и нулевой layout shift от motion.
9. Наполнить seed историями, которые выявляют ошибки интерфейса и аналитики.
10. Сертифицировать результат на 320/390/768/1280/1440 px, семи темах и 200% zoom.

## Не входит в работу

- установка NPM-пакета `kinetics`;
- прямое копирование Kinetics без явной лицензии;
- ECharts, Sankey, radar, gauge, 3D, pie-heavy или glow-визуализации;
- импорт всего EvilCharts registry;
- новая параллельная библиотека контролов рядом с shadcn/Base UI;
- новая продуктовая IA или переименование русских разделов;
- перевод report page целиком в client component;
- изменение бизнес-формул, схемы БД или backend API без необходимого data-contract;
- возврат `theme.css` или legacy component CSS в root layout;
- staging, commit или очистка несвязанных изменений грязного worktree.

## Выбранное направление

Выбрано направление **Operational Command with Guided Evidence**:

- `Operational Clarity` задаёт продуктовый shell, `/dashboard`, responsive,
  theme discipline и motion;
- `Analytical Command Center` задаёт аналитическое ядро `/reports`;
- `Guided Investigation` используется только внутри evidence Sheet/Drawer.

Рабочие параметры:

- `DESIGN_VARIANCE: 4`;
- `MOTION_INTENSITY: 3`;
- `VISUAL_DENSITY: 8`;
- орнаментальность: минимальная.

Продукт остаётся плотным операционным B2B-инструментом. Визуальное качество
достигается геометрией, ритмом, табличными цифрами, точными подписями,
семантическими поверхностями и стабильными состояниями — не декоративными
эффектами.

## Визуальная грамматика и anti-slop

- `Card` используется только для самостоятельной области. `Card` внутри `Card`
  запрещён.
- Внутри панели используются строки, separators и типографическая иерархия, а
  не коллекция micro-cards.
- На viewport доминирует не больше одного аналитического объекта.
- Запрещены icon tiles, декоративные eyebrows, side stripes, gradients, glow,
  glass, emoji и маркетинговые callouts.
- Lucide остаётся единственным icon set. Иконка обозначает действие или
  состояние и не добавляется над каждым KPI.
- `Badge`/`Chip` используется только для статуса или активного фильтра. Подписи
  не превращаются в pill soup.
- Accent-fill занимает не больше примерно 5% viewport.
- KPI имеет структуру: label → tabular value → одна строка сравнения. У KPI нет
  декоративной плитки-иконки.
- Равная сетка из трёх карточек допустима только для действительно сопоставимых
  сущностей.
- Все семь тем сохраняют одну structural grammar. Отличаются токены, но не
  layout, ornaments или chart semantics.
- Evidence Sheet использует sections и list rows, без вложенных карточек.

Hallmark self-critique `Hierarchy / Specificity / Restraint / Variety` должна
получить не меньше 4/5 по реальным screenshots.

## Информационная архитектура

### `/dashboard`

Dashboard остаётся лёгкой консолью «Сегодня»:

1. компактный заголовок;
2. один priority/triage strip;
3. четыре KPI одинаковой высоты;
4. сетка 8/4: качество за 7 дней и фокус;
5. сетка 8/4: области роста и обучение/активность;
6. активность раскрыта только при наличии полезного содержания.

Dashboard показывает **что требует действия сейчас**, но не получает сложные
сравнения и диагностический фильтр reports.

### `/reports?view=overview`

1. Существующий `PageShell`, tabs и экспорт.
2. Компактная строка `Параметры отчёта`: всегда видимы только период,
   сравнение, шаг, `Фильтры (n)` и меню сохранённого вида.
3. Team/source/risk находятся в Popover на desktop и полноэкранном Sheet на
   mobile. Видимы не больше трёх chips, отличающихся от default; остальные
   объединяются в `Ещё n`.
4. Компактный risk strip.
5. KPI:
   - средняя оценка занимает две колонки;
   - HIGH+;
   - открытые разборы;
   - выполнение нормы;
   - завершённые проверки.
6. Основная пара 8/4:
   - score + volume + target + previous period;
   - ranked diverging drivers.
7. Распределение оценки и одна вторичная связь.
8. Sheet `Данные и примеры`.

### `/reports?view=performance`

- Operator × Criterion остаётся семантической table/CSS heatmap;
- operator/source/team ranking;
- criterion agreement;
- две синхронизированные линии AI confidence и fallback;
- quota bullet charts.

### `/reports?view=process`

- один risk stack;
- категории и причины как сортированные горизонтальные полосы;
- reason trend;
- feedback SLA;
- appeals/reanswers как таблицы;
- lifecycle exceptions.

### `/reports?view=details`

Сохраняются плотные таблицы, sticky headers/first columns, sorting, export и
deep links. Таблицы не превращаются в карточки.

### Drill-down «Данные и примеры»

Подтверждённый drill-down из точки, фактора, matrix cell или KPI создаёт
URL-backed контекст и открывает shadcn Sheet:

```text
Средний балл −3
→ Freshdesk
→ Процессы
→ 7 проверок
→ Открыть выборку / назначить разбор
```

Sheet показывает active comparison, sample quality, ranked evidence, пять
связанных reviews и следующее действие. Он не заявляет причинность и использует
формулировки «связано с», «совпало с», «в этой выборке».

### Осмотр и подтверждённый drill-down

- Hover, focus и первый touch только меняют active point и tooltip.
- Enter или явная кнопка `Показать данные` открывает Sheet.
- KPI и строки факторов могут открывать Sheet сразу, потому что у них нет режима
  свободного исследования точек.
- Escape сначала снимает tooltip/selection, затем закрывает Sheet.
- URL меняется только при подтверждённом drill-down, никогда при hover/focus.

### URL-контракт

Централизованный parser принимает только allowlisted ключи:

```text
view=overview|performance|process|details
period=<validated preset or bounded date range>
compare=previous|year|none
grain=day|week
team=<allowlisted slug mapped server-side to Conversation.teamName>
source=<allowlisted integration source key>
risk=low|medium|high|critical|high_plus
block=<allowlisted slug mapped server-side to ScorecardCriterion.block>
section=trend|drivers|matrix|ai-drift|quota|risk
chartView=graph|table
series=score,volume,previous,target
evidenceType=trend|driver|matrix|kpi
evidenceKey=<opaque validated id>
```

- Filter и evidence navigation используют history `push`, чтобы Back/Forward
  восстанавливали осмысленные шаги.
- Graph/Table и series visibility используют `replace`, потому что это способ
  представления той же аналитики.
- Reload и deep link восстанавливают тот же server-validated state.
- Закрытие Sheet удаляет только `evidenceType/evidenceKey`.
- Если исходный trigger существует, focus возвращается на него. Для прямого
  deep link focus после закрытия возвращается на заголовок основного графика.
- Invalid или stale ID не раскрывает данные и даёт безопасное состояние
  «Данные больше недоступны» без указания существования чужого объекта.
- Изменение filter сбрасывает несовместимый evidence selection.
- Любой `href` строится приложением, остаётся относительным и проходит
  allowlisted route builder.

### Авторизация evidence

- URL считается недоверенным input.
- Все пять review records выбираются на сервере через существующую
  workspace/team/role authorization.
- Current policy `reports:read` grants workspace-wide report/evidence access;
  team является analytical filter, а не authorization boundary.
- `workspaceId`, `reports:read` и record existence проверяются повторно после
  parse. Если в будущем появится team-scoped authorization helper, evidence
  query обязан применять его как дополнительный scope.
- Unauthorized/stale evidence возвращает safe empty/404-like state.
- Raw Prisma reviews/findings не пересекают RSC boundary.
- Builder передаёт только отображаемые поля и удаляет PII, которое не показано
  в Sheet.

## Архитектура графиков

### Граница server/client

```text
server page / loader
→ pure aggregation
→ JSON-safe ChartModel
→ server ChartFrame
→ URL-backed Graph/Table links
→ table rendered on server OR small Recharts client island
```

Новые границы ответственности:

- `src/lib/charts/contracts.ts` — сериализуемые типы без React, CSS, `Date`,
  formatter functions и icon components;
- `src/lib/charts/builders.ts` — pure mapping из доменных агрегатов;
- `src/components/charts/chart-frame.tsx` — server-safe heading, description,
  period, sample, state и actions;
- `src/components/charts/chart-data-table.tsx` — единая table representation;
- `src/components/charts/quality-trend-chart.client.tsx` — Recharts island;
- `src/components/ui/chart.tsx` — единственный shadcn container/tooltip/legend
  primitive.

Graph/Table state принадлежит серверному URL-контракту, а не скрытому локальному
React state:

- `chartView=table` не загружает Recharts и рендерит семантическую таблицу;
- `chartView=graph` рендерит client visual и оставляет доступную ссылку на
  таблицу;
- переключатели являются ссылками, поэтому работают без chart JavaScript;
- `series` также валидируется сервером и применяется одинаково к обеим формам;
- таблица всегда может показать полный набор series; скрытие всех series
  запрещено;
- визуальный Recharts island не владеет heading, period, sample, error/empty
  состояниями или URL.

Предлагаемый контракт:

```ts
export type ChartUnit = "quality-score" | "count" | "percent";

export type ChartTone =
  | "primary"
  | "secondary"
  | "reference"
  | "success"
  | "warning"
  | "danger"
  | "risk-1"
  | "risk-2"
  | "risk-3"
  | "risk-4";

export type ChartSeries<TKey extends string = string> = Readonly<{
  key: TKey;
  label: string;
  unit: ChartUnit;
  tone: ChartTone;
}>;

export type ChartPoint<TKey extends string = string> = Readonly<{
  id: string;
  label: string;
  sortKey: string;
  values: Readonly<Record<TKey, number | null>>;
  detail?: string;
  sampleSize?: number;
  href?: string;
}>;

export type ChartModel<TKey extends string = string> = Readonly<{
  id: string;
  title: string;
  description?: string;
  xLabel?: string;
  yLabel?: string;
  series: readonly ChartSeries<TKey>[];
  points: readonly ChartPoint<TKey>[];
  emptyTitle: string;
  emptyDescription?: string;
}>;
```

`JSON-safe` означает только `string | number | boolean | null`, массивы и plain
objects. Запрещены `Date`, `undefined`, `bigint`, `NaN`, `Infinity`, ReactNode,
functions, icons и Prisma objects. Runtime schema проверяет:

- allowlisted unique series keys;
- соответствие keys и point values;
- unique stable IDs;
- детерминированный порядок;
- null semantics;
- finite bounds и unit;
- rounding выполняется в formatter одного слоя, а не в нескольких renderers.

### Формы визуализации

Используются:

- `ComposedChart`: score line + muted volume bars + target + previous period;
- horizontal `BarChart`: rankings, criteria, categories, diverging drivers;
- `BarChart`: score distribution;
- две aligned `LineChart`: AI confidence и fallback;
- CSS/table heatmap: operator × criterion;
- semantic HTML: короткие progress, risk stack и простые четыре bucket.

Не используются:

- ECharts без измеренного сценария с тысячами точек;
- radar, Sankey, gauge, 3D;
- pie/donut для точного операционного сравнения;
- chart engine для простой полосы или списка;
- начальные line-draw, bar-race и count-up.

### App-owned адаптация EvilCharts

Заимствуются идеи, а не весь исходный стек:

- compound composition;
- scoped semantic chart variables;
- единый tooltip/legend language;
- target/reference lines;
- optional graph/table;
- selectable series через реальные buttons;
- reduced-motion-aware updates.

Прямой registry import по умолчанию не выполняется. Если при реализации
потребуется конкретный фрагмент EvilCharts, он допускается только после:

1. фиксации upstream commit и SHA-256 registry/source;
2. сохранения MIT notice в `THIRD_PARTY_NOTICES.md`;
3. предварительного просмотра registry JSON;
4. точного pin package versions;
5. accessibility, security и reduced-motion patch;
6. code review локального fork.

Default implementation не копирует upstream EvilCharts source и не добавляет
его controls. Recharts используется напрямую через app-owned shadcn layer.

### Shadcn-only control map

- actions: `Button`;
- series/view selection: `ToggleGroup`/`Tabs`;
- desktop filters: `Popover`, mobile filters: `Sheet`;
- data disclosure: `Sheet`/`Collapsible`;
- form selects: `NativeSelect` для `FormData`;
- feedback: `Sonner`;
- table: `Table`;
- help: `Tooltip`.

Все импортируются из `@/components/ui/*`. Base UI composition использует
`render`, не `asChild`. Новые raw `button`, `select`, `dialog`, Radix controls
или EvilCharts controls запрещены. SVG/Recharts допустимы только как внутренность
визуализации данных.

### Recharts defaults

- `isAnimationActive={false}` для первого этапа;
- для high-level Cartesian factory `accessibilityLayer` включён, но app
  keyboard layer не создаёт второй tab stop;
- никаких random loading rows;
- явные `initialDimension` и role-specific heights;
- `Brush` не входит в initial bundle;
- no `aspect-video` для аналитических графиков.

Узкое исключение действует только для утверждённого low-level shape renderer.
Production-измерение показало, что буквальный Recharts `accessibilityLayer`
требует high-level Cartesian/store runtime размером 90–96 KiB gzip и поэтому
несовместим с абсолютным deferred gate 70 KiB. В этом path `Curve`/`Rectangle`
остаются presentation-only внутри `aria-hidden` SVG, а эквивалентный app-owned
accessibility layer владеет одним именованным и описанным tab stop, roving
active point, Arrow/Enter/Escape, pointer/touch parity, linked polite tooltip и
server semantic table. Это не разрешение отключать доступность: при переходе
на high-level factory буквальный `accessibilityLayer` снова обязателен, если
factory доказанно проходит тот же gate. Обоснование и измерения:
`.superpowers/sdd/2026-07-28-kinetics-evilcharts-ui-hardening/recharts-70k-feasibility.md`.

## Контракт тем и appearance

### Один root authority

`<html>` владеет:

- `data-theme`;
- `data-density`;
- `data-corners`;
- `data-contrast`;
- производным `.dark`;
- `color-scheme`;
- whitelist inline override variables.

`body` только потребляет токены. `data-theme` — источник истины, `.dark` —
совместимый производный флаг для Tailwind/shadcn/Recharts.

### Pure API

`src/lib/ui-theme.ts` содержит:

```ts
type ThemeDefinition = Readonly<{
  id: UiTheme;
  label: string;
  description: string;
  mode: "light" | "dark";
}>;
```

и pure функции:

- `resolveUiAppearance(input)`;
- `appearanceRootProps(appearance)`;
- `uiAppearanceToCssVariables(appearance)`.

Новый `src/lib/ui-theme-dom.ts` содержит идемпотентный
`syncUiAppearanceToDocument(root, appearance)`, который атомарно:

- ставит все data attributes;
- toggles `.dark`;
- меняет `color-scheme`;
- выставляет новые managed vars;
- удаляет устаревшие managed vars.

SSR layout и live preview используют один resolver. Preview откатывается к
последнему успешно сохранённому состоянию и после debounce persistence делает
один `router.refresh()`.

Persistence использует latest-write-wins:

- предыдущий request отменяется или его response игнорируется по monotonic
  revision;
- только последний подтверждённый response становится persisted state;
- rollback идёт к последнему подтверждённому сервером состоянию;
- ровно один `router.refresh()` выполняется для победившего save;
- stale response не может перезаписать новую тему.

Inline override names и values проходят whitelist/validation. Запрещены
произвольный `style.cssText`, raw CSS functions и невалидированные CSS property
names.

### Canonical CSS

`globals.css` остаётся единственным глобальным theme-файлом. В нём:

1. полный root fallback;
2. семь полных `[data-theme]` token blocks;
3. orthogonal density/corners/contrast modifiers;
4. reduced-motion policy;
5. временные legacy bridges с явным deletion list.

`theme.css` не импортируется и удаляется после миграции необходимых токенов.

Каждая тема обязана определить:

- background/foreground;
- card, popover, primary, secondary, muted, accent и paired foregrounds;
- destructive, success, warning и paired foregrounds/soft variants;
- border/input/ring;
- sidebar pairs;
- chart-1…5.

Семантические роли графика:

- `chart-1`: primary score;
- `chart-2`: comparison;
- `chart-3`: volume/neutral;
- `chart-4`: target/reference;
- `chart-5`: дополнительная категория.

Риск, success и warning используют status tokens, а не chart slot.

### Density, corners, contrast

- corners меняет канонический `--radius`;
- density задаёт control heights, inline padding, row height, page gutter и
  section gap; shadcn CVA в затронутых primitives переходят на tokens;
- coarse pointer всегда получает interactive target не меньше 44 px;
- contrast использует mode-agnostic OKLCH/color-mix, а не hardcoded light/dark;
- persisted legacy palette keys переводятся в v2 canonical semantic keys.

## Motion policy

### Токены

```css
--motion-duration-feedback: 90ms;
--motion-duration-fast: 120ms;
--motion-duration-standard: 160ms;
--motion-duration-emphasis: 220ms;
--motion-ease-standard: cubic-bezier(.2, 0, 0, 1);
--motion-ease-enter: cubic-bezier(.16, 1, .3, 1);
--motion-ease-exit: cubic-bezier(.4, 0, 1, 1);
--motion-ease-spring-gentle: cubic-bezier(.34, 1.2, .64, 1);
--motion-distance-press: 1px;
--motion-distance-enter: 4px;
--motion-scale-press: .99;
```

Используется namespace `data-qc-motion`, потому что Base UI уже использует
`data-motion`.

### Разрешённые Kinetics-inspired паттерны

В первом этапе:

- 1 px press для Button;
- progress settle после пользовательского изменения;
- status pill/state diff как краткое non-loop состояние;
- Accordion disclosure + chevron;
- Copy Button / Success Check с managed timer;
- hover/focus lift максимум 1 px для кликабельной карточки;
- context chip/evidence state transition;
- static selected ring для chart point.

Каждый паттерн реализуется независимо внутри shadcn/domain component.

### Запрещено

- magnetic, ripple, cursor trail, parallax, confetti;
- shimmer, pulse/glow, continuous dashed line;
- staggered page entrance, count-up, bar race, line draw;
- pointer-only gesture controls;
- forced reflow для restart;
- persistent `will-change`;
- per-frame React state;
- layout animation без конкретной продуктовой причины.

### Reduced motion

- CSS media query — источник истины;
- durations становятся `1ms`, а не `0`, чтобы exit lifecycle Base UI завершался;
- расстояния становятся `0`, scale — `1`, scroll — `auto`;
- skeleton/spinner статичны;
- loops и decorative animation отключены;
- начальный аналитический render всегда статичен;
- state сохраняет icon/text/ring feedback;
- глобально нельзя сбрасывать `transform`, чтобы не сломать Dialog/Sheet.

`spring-gentle` разрешён только для короткого success feedback. Он запрещён для
layout, Sheet, charts и hover. Hover lift допускается только у полно-карточных
primary links и не сочетается одновременно с scale, shadow и color change.

## Состояния данных

Каждый `ChartFrame` сохраняет одну геометрию и имеет следующие состояния:

| Состояние | Контракт |
| --- | --- |
| loading | Фиксированная высота, статический skeleton без shimmer |
| empty | Причина отсутствия данных и возможное следующее действие |
| error | Короткое сообщение и retry без большой красной поверхности |
| partial / low sample | Нейтральная подпись `Недостаточно выборки`, видимый denominator |
| missing day | Разрыв линии, без интерполяции |
| stale comparison | Явная дата базы сравнения |
| selected | Статический ring/marker и текст, не только цвет |

Dynamic result update объявляется через один polite status. Initial empty state
не является live region.

## Доступность

### Chart contract

Каждый аналитический график имеет:

- видимый heading;
- краткое русское accessible description;
- период и baseline;
- единицы;
- sample size;
- Graph/Table switch;
- одинаковый drill-down в обеих формах.

Для длинной серии используется один tab stop на chart root:

- Left/Right меняет активную точку;
- Enter применяет контекст;
- Escape очищает tooltip/selection;
- high-level Recharts `accessibilityLayer` остаётся включён; утверждённый
  low-level shape path использует эквивалентный app-owned слой по исключению
  выше;
- видимый focus ring принадлежит единственному app-owned chart root, а
  presentation SVG остаётся `aria-hidden` и `tabIndex={-1}`;
- chart не auto-focus после обновления.

Существующие семиточечные custom charts могут сохранить per-point controls.

### Tooltip

- одинаковое содержание по pointer, focus и touch;
- label, value/unit, sample и comparison delta;
- `role="tooltip"` и stable id;
- Escape закрывает без потери focus;
- chart announcement использует один `aria-live="polite"`;
- tooltip не является единственным источником данных и не выходит за viewport.

### Legend

- Button/Toggle, а не `div onClick`;
- `aria-pressed`;
- видимый label и line-style/icon, не только swatch;
- focus-visible;
- нельзя случайно скрыть все series;
- table отражает тот же visible-series state.

### Graph/Table parity

Обе формы используют один normalized `ChartModel` и совпадают по:

- фильтрам;
- order;
- rounding;
- null handling;
- units;
- sample;
- URL context и Evidence Sheet.

Hidden representation отсутствует в accessibility tree.

### Sheet и tables

- у Sheet есть русские Title, Description и `Закрыть`;
- focus trap, Escape и возврат на точный trigger;
- table scroll container — именованный focusable region;
- caption/`aria-labelledby`, `scope=row|col`;
- sticky first/header surfaces непрозрачны;
- long labels доступны по focus;
- повторяющиеся действия включают row context;
- mobile сохраняет table semantics и horizontal scroll.

Release gate: ноль critical/serious axe violations, все chart facts доступны в
table, keyboard evidence flow завершается, focus не исчезает, reduced motion не
оставляет nonessential running animation.

Контраст измеряется, а не оценивается визуально:

- normal text ≥4.5:1;
- large text ≥3:1;
- controls, focus indicators и essential chart marks ≥3:1 к соседнему цвету;
- forced-colors сохраняет axes, current point, selection, focus и legend
  differentiation.

## Responsive contract

### 1280–1440

- dashboard KPI: 4 columns, main 8/4;
- reports: шесть KPI tracks — hero span 2 и четыре KPI по одному; main 8/4;
- primary chart: 320 px, максимум 340 px на 1440;
- secondary chart: 260 px;
- sticky lens не перекрывает focus.

### 768–1024

- score hero full width + четыре KPI 2×2;
- primary chart: 280 px, secondary: 240 px;
- chart/driver располагаются последовательно;
- controls формируют две дисциплинированные строки;
- matrix/table scroll внутри владельца.

### 390–767

- compact header;
- compact in-flow строка `Период` + `Фильтры (n)`;
- context chips scroll horizontally;
- score KPI full width, остальные в 2×2;
- mobile filters и `Данные и примеры` открываются через Sheet;
- primary chart: 232 px, secondary: 216 px;
- tabs scroll without wrapping;
- вторичные diagnostics раскрываются;
- table/list становится default, если chart теряет читаемость.

### 320 и 200% zoom

- page gutter 12 px;
- compact KPI идёт одной колонкой;
- primary chart: 216 px, secondary: 200 px;
- Triage action занимает всю строку;
- mobile Sheet полноширинный и высотой `100dvh`;
- нет document-level horizontal overflow;
- controls не теряются и не перекрываются;
- interactive target остаётся не меньше 44 px для coarse pointer;
- tooltip и Sheet close доступны;
- таблицы прокручиваются локально.

Для ranked chart высота равна `rowCount × 36px`, минимум 220 px и максимум
420 px. `aspect-video` для аналитических графиков запрещён. Tabs на всех ширинах
остаются в одной nowrap-строке с локальным scroll. Sheet до 640 px имеет
`width:100%`, `max-width:none`, `height:100dvh`.

Строка `Параметры отчёта`:

- максимум 56 px и одна строка;
- sticky только при `min-width:1024px` и `min-height:700px`;
- offset равен `--app-topbar-height`, z-index ниже topbar;
- на 320/390/768 и при 200% zoom не sticky;
- section targets получают соответствующий `scroll-margin-top`.

Реальный 200% browser zoom проверяется вручную в Chromium, Firefox и Safari.
Автоматические 640/720 CSS px используются как reflow proxy, но не заменяют
browser zoom.

## Русский словарь интерфейса

| Внутренний термин | Видимый текст |
| --- | --- |
| analytical lens | `Параметры отчёта` |
| saved view | `Сохранённый вид` |
| graph / table | `График / Таблица` |
| evidence | `Данные и примеры` или `Основание вывода` |
| sample | `Выборка` |
| baseline | `База сравнения` |
| target | `Цель` |
| volume | `Объём проверок` |
| driver | `Фактор` |
| quota / Норма | `Выполнение плана` |
| HIGH+ | `Высокий и критический риск (HIGH+)` при первом употреблении |
| fallback | `Резервная оценка`, если технический термин не обязателен |

Видимые тексты используют русский sentence case и единый стиль с `ё`:
`завершённые`, `сохранённый`, `связанные`. Формулировка
`Что изменилось и почему` запрещена; используется
`Что изменилось и с чем совпало`.

## Демонстрационные данные

Seed использует `DEMO_SEED_NOW` как единственный reference clock и должен
содержать:

- rolling 35-day analytical window и предыдущие 35 дней; существующий текущий
  период 22-е–21-е остаётся elapsed-to-reference-date и не получает будущие
  записи;
- не меньше 12 operators в 3 teams;
- 6–7 sources;
- 4–6 criterion blocks и 15–20 criteria/reasons;
- четыре уровня риска;
- finalized reviews с denominator для всех агрегатов;
- HIGH/CRITICAL findings;
- open и overdue coaching;
- quota выше и ниже плана;
- acknowledged и pending feedback;
- appeals и reanswers;
- AI agreement, confidence, fallback/drift;
- missing days и low-sample segment;
- длинные русские имена и названия;
- honest empty state для отсутствующего sentiment.

Safety contract:

- seed запускается только при явном demo/test environment guard и запрещён в
  production без возможности override;
- `DEMO_SEED_NOW` парсится как UTC instant; календарные границы вычисляются в
  `Europe/Moscow`, а timestamps сохраняются как UTC;
- IDs, reference clock и counts детерминированы;
- повторный запуск идемпотентен;
- non-demo rows не удаляются, не перезаписываются и не перепривязываются;
- dataset ограничен и не создаёт неограниченный рост;
- каждый обязательный story и evidence link проверяется executable validator;
- cleanup/upsert demo workspace и создание fixtures выполняются атомарно в
  Prisma transaction;
- глобальный `deleteMany` запрещён; очистка ограничена явными demo workspace
  identifiers;
- smoke validation подтверждает tenant/workspace isolation.

Validator жёстко ограничивает датасет: не больше 84 аналитических
`FINALIZED/HUMAN` reviews суммарно в двух rolling windows, включая predefined и
legacy fixtures (42 + 42 как целевая раскладка), 12 operators, 16 criteria,
4 saved views и 10–12 AI score drafts. Циклический генератор заменяется
сценарным, а не дополняется неограниченными рядами.

Обязательные истории:

1. Freshdesk + «Процессы»: `n>=6` в каждом window и либо delta критерия
   `<=-0.4`, либо total score delta `<=-8` points.
2. Zendesk: `n>=6` в каждом window и improvement `>=+5` points.
3. Именованная команда концентрирует не меньше 60% appeals и имеет не меньше
   четырёх appeals.
4. Один source имеет `n<5` и показывает `Недостаточно выборки`.
5. Ровно один AI confidence regression с drop `>=0.15` и ровно один fallback
   spike с rise `>=0.25`.
6. Quota pair: хотя бы один operator имеет `actual>=10 && actual>=plan`, и хотя
   бы один — `actual>=10 && actual<plan`.
7. Для каждого фактора разрешается минимум пять server-resolved evidence links.

Saved views:

- `HIGH+ риск`;
- `Freshdesk / Процессы`;
- `Команда с просадкой`;
- `AI drift`.

## TDD и порядок реализации

Для каждого этапа сначала добавляется поведенческий RED test, затем минимальная
реализация и refactor. Тесты не закрепляют Tailwind-классы или SVG path.

1. Theme contract и 49 ordered transitions.
2. SSR root appearance и live preview reconciliation.
3. Reduced-motion global policy и timer cleanup.
4. JSON-safe `ChartModel` и pure builders.
5. Graph/Table parity и accessible chart root.
6. Composed quality trend и driver bars.
7. Evidence Sheet focus/URL contract.
8. Reports/dashboard responsive geometry.
9. Demo seed stories и smoke validation.
10. Полная visual/accessibility/performance matrix.

## Проверка

Обязательные автоматические проверки:

- typecheck;
- unit/component suite;
- production build;
- targeted and full e2e;
- theme contract, all-to-all transition и FOUC tests;
- axe для dashboard и четырёх report views;
- reduced-motion и forced-colors;
- keyboard-only lens → chart → evidence → review → close;
- graph/table parity;
- zero overflow at 320/390/768/1280/1440;
- 200% zoom;
- visual matrix: 7 themes × dashboard/reports/appearance × 390/1440;
- pairwise density/corners/contrast в Graphite и Ops;
- bundle route diff;
- dependency audit;
- no direct Kinetics import;
- no unapproved `transition-all`, infinite animation или forced reflow.

Точная base visual matrix содержит минимум 42 screenshots:

- `/dashboard`;
- `/reports?view=overview&chartView=graph`;
- `/admin/appearance`;
- семь тем;
- 390 и 1440 px.

Graph/Table отдельно снимается для reports на 390 и 1440. Остальные report views
получают functional layout/axe coverage, а не обязательные 42× screenshots.
Modifier coverage использует pairwise-набор всех трёх densities, трёх corners и
двух contrasts в Graphite и Ops. Chromium выполняет полную матрицу; WebKit и
Firefox — smoke для Graphite/Ops, keyboard, overflow и Sheet. Locale `ru-RU`,
timezone `Europe/Moscow`, reference clock и fonts фиксируются. Проверяются cold
и cached navigation, coarse-pointer touch emulation и реальный 200% zoom.

Отдельный anti-slop gate по screenshots:

- нет Card-in-Card, icon-tile grids, eyebrow на каждом разделе и pill soup;
- нет двухстрочных buttons, tabs и CTA;
- colors и typography используют tokens;
- accent footprint ограничен;
- одна icon library;
- нет декоративного motion.

Performance budgets:

- исходный ориентир старого production build до повторного измерения:
  reports client-manifest union 158.7 KiB gzip, dashboard 150.0 KiB, coaching
  159.4 KiB; route-specific reports 12.53 KiB, dashboard 3.87 KiB, coaching
  13.27 KiB; emitted chunks не содержат Recharts/Motion;
- shared shell/layout chart delta: 0 KiB;
- `/reports` initial client JS: target не больше +30 KiB gzip, hard cap +45 KiB;
- `/dashboard` и `/coaching`: target не больше +5 KiB, hard cap +10 KiB;
  Recharts/Motion там отсутствуют;
- deferred rich-chart chunk: не больше 70 KiB gzip и загружается около 400 px до
  viewport с зарезервированной высотой;
- никакой второй chart engine;
- первый motion этап не добавляет runtime dependency;
- motion helper, если позже обоснован, не больше 5 KB gzip;
- chart data не больше 100 KiB uncompressed на route, 50 KiB на chart и 500
  marks; большее агрегируется/downsample на сервере;
- motion CLS = 0;
- chart CLS ≤0.02, page CLS ≤0.05;
- ни одной motion-generated long task >50 ms;
- chart mount long task ≤50 ms, eager chart hydration ≤100 ms;
- tooltip/keyboard response p95 ≤100 ms, route INP ≤200 ms, LCP ≤2.5 s на
  mobile 4× CPU/Fast 4G profile;
- charts initial static;
- только serializable data пересекает RSC boundary;
- нет случайных данных во время render/hydration.

Dependency gate:

- не добавлять `kinetics`, `motion`, `framer-motion`, `echarts`;
- не добавлять новый chart engine;
- не запускать unpinned `npx shadcn@latest`;
- не допускать package/lock churn вне явно одобренной точной версии;
- Recharts остаётся текущей установленной зависимостью;
- текущий server loader сохраняет bounded date range, не увеличивает query count
  и response payload; до/после фиксируются p95 query/server-render baselines.

## Риски и меры

- **Изменение метрик при миграции renderer.** Сохраняются aggregators и
  добавляется chart/table parity на одном model.
- **Cognitive overload.** Overview содержит один primary chart и один driver
  panel; diagnostics распределены по существующим tabs.
- **Потеря keyboard contract.** Recharts получает app-owned focus/legend/table
  layer до замены custom chart.
- **Theme drift.** Theme contract ремонтируется до визуальной настройки charts.
- **Лицензионная неопределённость Kinetics.** Код не копируется.
- **Mutable EvilCharts registry.** Registry не вызывается напрямую без hash,
  pin и review.
- **Client bundle.** Recharts остаётся leaf island; ECharts/motion не добавляются
  без измерения.
- **False causality.** Evidence UI показывает sample и comparison и использует
  корреляционные формулировки.
- **Mobile report length.** KPI compact grid и progressive disclosure только для
  вторичных panels.
- **Грязный worktree.** Изменяются только файлы, относящиеся к утверждённому
  плану; несвязанные изменения не откатываются и не форматируются массово.

## Критерии готовности

Работа считается завершённой, когда:

1. все семь тем и modifiers реально меняют shadcn UI без reload;
2. Graphite ↔ Ops ↔ любая light theme правильно синхронизируют `.dark` и
   `color-scheme`;
3. `/reports` использует единый accessible Recharts layer для выбранных
   аналитических графиков;
4. каждый новый график имеет эквивалентную table representation;
5. evidence drill-down работает мышью, touch и только клавиатурой;
6. reduced-motion режим не оставляет декоративных running animations;
7. seed проявляет все обязательные аналитические истории;
8. нет document overflow на сертифицируемых ширинах и при 200% zoom;
9. все unit, typecheck, build и e2e проверки проходят;
10. визуальная матрица всех семи тем проверена без критических дефектов;
11. bundle и dependency budgets соблюдены;
12. независимые code review и verification review не имеют незакрытых
    блокирующих замечаний.
