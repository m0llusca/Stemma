# Kinetics + Recharts: fit для Stemma

Вердикт команды. Не каталог «красивых графиков».

Источники: [Kinetics](https://kinetics.colorion.co/#library), [Recharts](https://recharts.github.io/).

**Kill list:** vanity-график без drill в очередь; декоративное motion на очереди.

Лицензия / копирование кода — отдельный аудит: [2026-07-28](memory/2026-07-28-kinetics-evilcharts-provenance-audit.md). Здесь — продуктовый fit. Код Kinetics не копируем.

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

Реализация:

- client components
- `ResponsiveContainer` + фиксированная высота
- a11y: summary / таблица рядом с графиком (`accessibilityLayer` в v3)
- lazy per-route (бандл)

**Spike** = первый осмысленный drill-chart на существующих `Chart*`. Новую библиотеку не добавляем.

## Kinetics

Не npm-зависимость. Каталог spring CSS / React / prompt-паттернов.

Взять **4–6** в токены / `globals.css` (+ `prefers-reduced-motion`):

1. toast overshoot
2. switch
3. progress / elastic
4. skeleton shimmer
5. status pill
6. accordion (admin)
7. digit bump на KPI

Слой motion поверх shadcn **base-nova**, не замена DS. В проекте уже `tw-animate-css` и sonner — вторую motion-систему не заводим.

**Не брать:** magnetic cursor, liquid glass, trails, speed-dial, decorative dock.

## Кто видит графики

| Роль | Графики |
| --- | --- |
| EXEC | один risk chart, если click = drill |
| Lead / Admin | SLA / load + отчёты; bar / point → отфильтрованная очередь |
| Analyst | без hero; мини только в отчётах |
| Agent | без vanity charts / ranks |
| VIEWER | нет |

## Фазы

1. Drill-chart spike на Exec (потом Lead) через текущие `Chart*`
2. Kinetics: 4–6 токенов / паттернов
3. Эта заметка — этот PR

## Тесты (когда пойдёт код)

- unit: click → тот же href, что `opsQueueKpiHref`
- `prefers-reduced-motion`
- Agent и VIEWER — без графиков
