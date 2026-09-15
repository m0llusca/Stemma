# Screen matrix — hardening #116

Walk checklist for epic [#116](https://github.com/m0llusca/Stemma/issues/116). ACCEPT for #116 = this matrix all green + Marques UX-ACCEPT + ДеШон PASS.

LIVE walk **PASS** on tip **`4f2ba3a`** (Джамал, 0 FAIL): QA / Exec / Admin / Lead / Agent / Viewer + role-switch Admin→Exec. Matthew ACK: cells PASS with tip SHA. [#116](https://github.com/m0llusca/Stemma/issues/116) stays open until [#148](https://github.com/m0llusca/Stemma/issues/148) (chart SoT / OTRS webhook / Playwright demo-data-current) + Marques UX-ACCEPT + ДеШон LIVE adversarial.

Child streams (code on tip **`4f2ba3a`**):

- [#118](https://github.com/m0llusca/Stemma/issues/118) dead clicks / expand-collapse / silent no-op — **visual** closed on master [`13eadb0`](https://github.com/m0llusca/Stemma/commit/13eadb008fc863b286a8fa7954e6051042d49408) (PR #123). LIVE: score modules open/close+Enter hold **PASS**. [#125](https://github.com/m0llusca/Stemma/issues/125) `aria-expanded` sync is **implemented** (`review-disclosure.tsx` React SoT); aria lag is not a visual FAIL
- [#119](https://github.com/m0llusca/Stemma/issues/119) charts — LIVE paint **PASS** (Exec 3 bars + overdue drill). CODE SoT Recharts vs static SVG still [#148](https://github.com/m0llusca/Stemma/issues/148) — not resolved here
- [#117](https://github.com/m0llusca/Stemma/issues/117) Morphicons — LIVE **PASS** (Copy↔Check on `/admin/tokens`)

### #118 / #117 / #125 status

Tip **`4f2ba3a`** (`4f2ba3ae736535847d7e56ffe34950c732c220b8`). Master already has Waves A–C ([`84370da`](https://github.com/m0llusca/Stemma/commit/84370da): jobs hardening, reports split, OTRS honesty, ingress rate limits, calibration ritual defaults, activation/cert evidence) + chart fixes (`5ebcd01`, `27ebbff`, `28af033`) + Morphicons.

LIVE SoT = controlled `<details>` / `<summary>` with React `open` + `aria-expanded` (`review-disclosure.tsx`).

#117 Copy↔Check LIVE gate: Admin `/admin/tokens` (also `/admin/access` SCIM and `/admin/integrations` CodeBlock). **Not** the review workbench. Chevron / score-module morph stays on review accordion.

Friction: exact-filters sheet sometimes intercepts click — not a FAIL.

LIVE: https://two-estimate-jury-experiences.trycloudflare.com (ephemeral; tip `4f2ba3a`). The old `offering-vendor-late-homes` URL is dead.

Demo seed emails, no password, all `@example.com`: `admin@`, `qa@`, `lead@`, `maria.qa@`, `exec@`, `ivan@`, `olga.agent@`, `denis.agent@`, `elena.agent@`, `viewer@`.

**PASS** = control works **and** BE is honest (no silent no-op, no fake-green, no impostor `/reviews?status=unreviewed`). Soft smoke (login / bars / role-switch) is **not** enough.

Cells below: `PASS` = Джамал LIVE walk on tip `4f2ba3a`. `n/a` = stream has no surface on that row.

SoT: [`role-home.ts`](../apps/web/src/lib/auth/role-home.ts), [`navigation.ts`](../apps/web/src/lib/shell/navigation.ts) `visibleTopNavAreas`, [app-shell.md](app-shell.md).

---

## Role homes

| Role | Demo login | Home |
| --- | --- | --- |
| ADMIN | admin@example.com | `/dashboard` |
| TEAM_LEAD | lead@example.com | `/dashboard` |
| QA_ANALYST | qa@example.com (also maria.qa@) | `/reviews?qaAssignee=…&due=overdue` |
| EXEC | exec@example.com | `/dashboard` (ExecRiskHome, no ops pulse) |
| SUPPORT_AGENT | ivan@example.com (also olga/denis/elena.agent@) | `/self-review` |
| VIEWER | viewer@example.com | `/auth/pending-access` (`AppNav` null) |

---

## Top-nav visibility

From `visibleTopNavAreas` + permissions in `permissions.ts`.

| Area | ADMIN | TEAM_LEAD | QA_ANALYST | EXEC | SUPPORT_AGENT | VIEWER |
| --- | --- | --- | --- | --- | --- | --- |
| Сегодня | `/dashboard` | `/dashboard` | inbox (`qaAssignee`+`due=overdue`) | `/dashboard` (риск/SLA) | — | — |
| Проверки | `/reviews` | `/reviews` | `/reviews` (unfiltered; ≠ Сегодня) | `/reviews` (read, no Take next) | — | — |
| Калибровка | `/calibration` | `/calibration` | `/calibration` | — | — | — |
| Обучение | `/coaching` | `/coaching` | `/coaching` | — | `/coaching` | — |
| Аналитика | `/reports` | `/reports` | `/reports` | `/reports` | — | — |
| Настройки | `/admin` (full hub) | `/admin` (scorecards, sampling, audit, report-schedules) | `/admin` (report-schedules only) | — | — | — |
| Моя обратная связь | — | — | — | — | `/self-review` | — |

Agent: only **Моя обратная связь** + **Обучение**. VIEWER: none.

Ops pulse **Очередь** / **Риск**: `reviews:write` only — Admin / Lead / QA. **Not** Exec / Agent / Viewer.

⌘K **Взять следующий**: same write-gate. Exec/Agent must not see it.

Account menu **«Сменить роль»**: only when `QC_DEMO_AUTH=enabled`. Same seeded identities as login.

---

## How to mark

1. Login as the role. Land on role home (not a leftover URL).
2. Exercise every control in the row. Expand/collapse must **visually** open, close, and hold (click + Enter). Save/probe must persist or fail with reason.
3. Score modules: PASS = visual hold. `aria-expanded` may lag — track under [#125](https://github.com/m0llusca/Stemma/issues/125), do **not** FAIL visual PASS for aria alone.
4. Other `#118` FAIL → file issue, paste link in Notes. `#119` / `#117` same.
5. Do not tick PASS on chrome-only smoke.

---

## Shared chrome (every product role except VIEWER)

Repeat under each role. VIEWER has no `AppNav`.

| Surface | What to click | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| Account menu | identity, logout, **«Сменить роль»** (DEMO) → lands on new role home | PASS | n/a | PASS | role-switch Admin→Exec `4f2ba3a`. #117: menu↔X / chevron |
| Top-nav | only areas from the table above; no dead href; no forbidden page from a visible item | PASS | n/a | PASS | |
| ⌘K | modes for this role; **Взять следующий** writers only; Exec: overdue + quarter analytics, no Take next; Agent: **Перейти к обучению**, no Take next / overdue | PASS | n/a | PASS | |
| Ops pulse | **Очередь** / **Риск** (/ **Обучение**) badges — Admin/Lead/QA. No pulse **Взять следующий** (page/⌘K only). Exec/Agent: absent or coaching-only, not disabled-looking | PASS | n/a | n/a | |

---

## ADMIN — admin@example.com — `[x]` PASS (`4f2ba3a`)

Home `/dashboard`. Nav: Сегодня / Проверки / Калибровка / Обучение / Аналитика / Настройки. Pulse + Take next on.

### Auth + chrome

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO picker, login → `/dashboard`, logout → login | PASS | n/a | PASS | |
| (shell) | account **«Сменить роль»**, top-nav 6 areas, ⌘K (Сегодня/Работа/Качество/Команда/Система + Take next), pulse Очередь/Риск | PASS | n/a | PASS | role-switch Admin→Exec |

### Dashboard + reviews + reports

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/dashboard` | welcome-back **«Сбросить к очереди дня»**; triage **Разобрать** / empty **Взять следующий**; KPI **Просрочено SLA** / **Высокий риск** / **Проверок за неделю** / **Активных обучений** → honest hrefs (never `status=unreviewed`); sparkline **Качество команды · 7 дней** (цель 90, point → period queue); **Нагрузка проверяющих** name/counts → queue; **Ещё в фокусе** | PASS | PASS | n/a | #119 Lead/Admin sparkline |
| `/reviews` | filters (Итог, Статус проверки, Проверяющий, Срок, Риск, Sheet редких срезов); **Сбросить фильтры** → `/reviews`; SavedViews apply + create/rename/delete; **Взять следующий**; next-case preview collapse/expand + CTA; welcome-back reset; empty **Очередь пуста** / **В текущем представлении нет кейсов** | PASS | n/a | PASS | Exact-filters sheet sometimes intercepts click — not a FAIL |
| `/reviews/[conversationId]` | **Roman P0**: **модули оценки** = controlled `<details>` / `<summary>` (master `13eadb0`). Click + Enter: visual open/close+hold. Steps **Оценка по критериям** / **Итог проверки** / **Дополнительно**; **Группа процесса** blocks; per-criterion summary (Enter/Esc); score 1/2/3; **Сохранить черновик**; **Завершить проверку**; **Завершить и взять следующий** (⌘↩); `?` legend; AI draft Принять/Отклонить/Изменить if present; appeal/feedback under Дополнительно | PASS | n/a | PASS | #118 open/close+Enter hold `4f2ba3a`. #117 = chevron, not CopyButton. aria lag → #125, not visual FAIL |
| `/reports` | period: **Текущий период 22-21** / прошлый 22-21 / календарный месяц / квартал / произвольный; **Обзор** = trend + drivers (decision-first after Wave B); distribution → **Исполнение**; sentiment / CSAT → **Разрезы**; static SVG / `StaticChartContainer`, not blank `.recharts-wrapper`; bar/point → evidence sheet or filtered queue; export CSV/XLSX/PDF if menu present | PASS | PASS | n/a | |
| `/calibration` | **Новая сессия** / **Скрыть форму**; **Создать сессию**; session tabs; **Завершить**; matrix / agreement rows clickable → session or queue | PASS | n/a | PASS | accordion/chevron → #117 |
| `/coaching` | views active/overdue/week/mine/unlinked/done/all; KPI drills; **Создать план** / **Создать задачу**; assignment **Готово** / **Вернуть**; theme/filter submit | PASS | PASS | PASS | sparkline on coaching if shown |

### Admin hub (full rail)

Each row: rail link works, expand/collapse if any, save/probe persists or errors honestly. Dead click → #118.

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/admin` | cards + quick actions (Подключить источник, Изменить форму оценки, Добавить выборку, …); rail all groups; accent/cert tone honest (not fake «в рабочем состоянии») | PASS | n/a | PASS | |
| `/admin/scorecards` | create/edit version, criteria, save → redirect overview | PASS | n/a | PASS | |
| `/admin/sampling` | **Новое правило** / **Сохранить правило** / **Создать правило** | PASS | n/a | PASS | |
| `/admin/ai-scoring` | **Сохранить движок**; provider key **Сохранить**; no silent empty save | PASS | n/a | PASS | |
| `/admin/integrations` | list, **Подключить** / new; cert chips ≠ live without cert | PASS | n/a | PASS | #117 CodeBlock CopyButton if snippet shown |
| `/admin/integrations/[id]` | probe / capability / save; green only after live cert | PASS | n/a | PASS | #117 CodeBlock CopyButton |
| `/admin/users` | **Создать пользователя**; row **Сохранить** role/line | PASS | n/a | PASS | |
| `/admin/access` | **Сохранить провайдера**; **Проверить вход**; group Switch + **Сохранить группу**; probe ≠ live SSO | PASS | n/a | PASS | #117 SCIM CopyButton if token issued |
| `/admin/channels` | channel save; probe-honesty (not «connected» without probe) | PASS | n/a | PASS | |
| `/admin/system` | **Проверить окружение** / **Проверить SSO**; job links; **Возраст очереди** (alert ≥15 мин) | PASS | n/a | PASS | |
| `/admin/appearance` | theme / density / palette apply; **Применено** only after save | PASS | n/a | PASS | |
| `/admin/localization` | locale enable + publish/save texts | PASS | n/a | PASS | |
| `/admin/tokens` | create / revoke key | PASS | n/a | PASS | **#117 Copy↔Check LIVE gate** `4f2ba3a` |
| `/admin/audit` | filters above list; row expand; empty «Под текущий фильтр нет записей» | PASS | n/a | PASS | |
| `/admin/report-schedules` | create/edit schedule, recipients, enable | PASS | n/a | PASS | |

---

## TEAM_LEAD — lead@example.com — `[x]` PASS (`4f2ba3a`)

Home `/dashboard`. Nav same six areas as Admin. Pulse + Take next on.

Admin rail **only**: Формы оценки, Правила выборки, Журнал действий, Расписания отчетов (+ Обзор).

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO → `/dashboard` | PASS | n/a | PASS | |
| (shell) | **«Сменить роль»**, 6 nav areas, ⌘K + Take next, pulse Очередь/Риск | PASS | n/a | PASS | |
| `/dashboard` | same Lead/Admin ops pulse as Admin (4 KPI, triage, Take next, sparkline, нагрузка) | PASS | PASS | n/a | |
| `/reviews` | filters, SavedViews mutate, Take next, welcome-back, empty | PASS | n/a | PASS | Exact-filters sheet sometimes intercepts click — not a FAIL |
| `/reviews/[conversationId]` | **модули оценки**: controlled `<details>` / `<summary>` (`13eadb0`). Visual open/close+hold on click+Enter; finalize; hotkeys; AI draft; appeal | PASS | n/a | PASS | #118 open/close+Enter hold `4f2ba3a`. #117 = chevron, not CopyButton. aria → #125 |
| `/reports` | period; **Обзор** = trend + drivers; drill; export | PASS | PASS | n/a | |
| `/calibration` | create / complete session | PASS | n/a | PASS | |
| `/coaching` | manage plans/tasks (not consume-only) | PASS | PASS | PASS | |
| `/admin` | cards: scorecards, sampling, audit, report-schedules only. Title **Доступные разделы** if no cert health — not cert-green | PASS | n/a | PASS | |
| `/admin/scorecards` | edit/save form | PASS | n/a | PASS | |
| `/admin/sampling` | create/save rule | PASS | n/a | PASS | |
| `/admin/audit` | filters + expand | PASS | n/a | PASS | |
| `/admin/report-schedules` | create/edit | PASS | n/a | PASS | |
| `/admin/users` (deep-link) | **Недостаточно прав** + **Вернуться** → `/dashboard` | PASS | n/a | n/a | honesty |
| `/admin/integrations` (deep-link) | **Недостаточно прав** | PASS | n/a | n/a | |

---

## QA_ANALYST — qa@example.com — `[x]` PASS (`4f2ba3a`)

Home `/reviews?qaAssignee=<имя>&due=overdue` (maria.qa@ — свой inbox). Nav: Сегодня (= inbox) / Проверки / Калибровка / Обучение / Аналитика / Настройки. Pulse + Take next on.

`/dashboard` still opens by URL (residual `DASHBOARD_ROLES`) — not a ⌘K «Пульс дня».

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO → mine+overdue inbox | PASS | n/a | PASS | |
| (shell) | **«Сменить роль»**; Сегодня highlights only on exact inbox query; Проверки = bare `/reviews`; ⌘K Сегодня = **Мои + просрочено** (no Пульс дня); Take next; pulse Очередь/Риск | PASS | n/a | PASS | |
| `/reviews` (Сегодня) | inbox filters pre-set; **Сбросить фильтры** → same inbox (not bare `/reviews`); SavedViews; Take next; welcome-back; empty | PASS | n/a | PASS | Exact-filters sheet sometimes intercepts click — not a FAIL |
| `/reviews` (Проверки) | unfiltered list; filters; Take next; empty | PASS | n/a | PASS | Exact-filters sheet sometimes intercepts click — not a FAIL |
| `/reviews/[conversationId]` | **#118 first repro (visual closed `13eadb0`)**: **модули оценки** = controlled `<details>` / `<summary>`. Click + Enter: open, close, **hold**. **Группа процесса** + per-criterion summaries; score; finalize + finalize_next; hotkeys; AI draft if present; appeal | PASS | n/a | PASS | #118 open/close+Enter hold `4f2ba3a`. #117 = chevron, not CopyButton. visual PASS ≠ aria. aria-expanded lag → #125 |
| `/dashboard` | residual URL: KPI (no Lead sparkline / нагрузка — no `peer_quality:read`); empty triage **Открыть сегодня** (href home, not Take next) | PASS | n/a | n/a | no hero chart |
| `/reports` | period; **Обзор** = trend + drivers; drill; export — mini charts OK | PASS | PASS | n/a | |
| `/calibration` | create / complete | PASS | n/a | PASS | |
| `/coaching` | manage | PASS | PASS | PASS | |
| `/admin` | **Доступные разделы**; card **Расписания отчетов** only | PASS | n/a | PASS | |
| `/admin/report-schedules` | create/edit schedule | PASS | n/a | PASS | |
| `/admin/scorecards` (deep-link) | **Недостаточно прав** | PASS | n/a | n/a | |

---

## EXEC — exec@example.com — `[x]` PASS (`4f2ba3a`)

Home `/dashboard` = ExecRiskHome. Nav: Сегодня / Проверки / Аналитика. **No** Калибровка / Обучение / Настройки. **No** pulse Очередь/Риск. **No** Take next.

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO → `/dashboard` | PASS | n/a | PASS | |
| (shell) | **«Сменить роль»**; 3 nav areas; ⌘K Сегодня + **Открыть просроченные SLA** + **Открыть аналитику за квартал**; no Take next; no pulse | PASS | n/a | PASS | leaked Take next = FAIL. Role-switch Admin→Exec walked |
| `/dashboard` | 3 KPI: **Просрочено SLA** / **Высокий риск** / **Очередь без старта** (LIVE seed often 8 / 13 / 4); triage action → queue; **Сигналы риска**: **3 SVG bars** (`<svg class="recharts-surface">`), **not** `.recharts-wrapper` / Recharts `BarChart`; bar click = same KPI href; summary table beside chart; **EmptyState** «Нет сигналов за период» (`queueFilterResetHref` → `/reviews`) — force empty / unit path; **no** Take next | PASS | PASS | n/a | #119 LIVE paint + overdue drill `4f2ba3a`. CODE SoT Recharts vs static SVG → [#148](https://github.com/m0llusca/Stemma/issues/148) |
| `/reviews` | read filters + apply SavedViews; **no** create/rename/delete; **no** Take next; **no** preview submit | PASS | n/a | PASS | Exact-filters sheet sometimes intercepts click — not a FAIL |
| `/reviews/[conversationId]` | read workbench; no finalize / draft save; modules = controlled `<details>` / `<summary>` if present — visual open/close+hold (click+Enter) | PASS | n/a | PASS | #118 open/close+Enter hold. #117 = chevron, not CopyButton. aria → #125 |
| `/reports` | period; **Обзор** = trend + drivers; drill; export | PASS | PASS | n/a | |
| `/calibration` | **Недостаточно прав** | PASS | n/a | n/a | |
| `/coaching` | **Недостаточно прав** | PASS | n/a | n/a | |
| `/admin` | **Недостаточно прав** | PASS | n/a | n/a | |
| `/self-review` | **Недостаточно прав** | PASS | n/a | n/a | |

---

## SUPPORT_AGENT — ivan@example.com — `[x]` PASS (`4f2ba3a`)

Home `/self-review`. Nav: **Моя обратная связь** + **Обучение**. Brand → self-review, not ops pulse. **No** Проверки / Сегодня / Калибровка / Аналитика / Настройки. **No** pulse. **No** Take next.

Also walk olga.agent@ / denis.agent@ / elena.agent@ if inbox empty for Иван.

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO → `/self-review` | PASS | n/a | PASS | |
| (shell) | **«Сменить роль»**; 2 nav areas; ⌘K **Моя обратная связь** + **Перейти к обучению**; no Take next; no pulse | PASS | n/a | PASS | |
| `/self-review` | feedback pack: цитата → снятие → как исправить → апелляция; deduction expand/collapse; **Принять оценку**; appeal CTA or disabled+reason; training **Готово**; personal ScoreSparkline (no public ranks / FAIL spectacle); empty honesty (never-assigned ≠ «Все разборы закрыты») | PASS | PASS | PASS | sparkline = personal, not vanity |
| `/coaching` | consume: own assignments, status **Готово**; **no** Создать план / Создать задачу | PASS | n/a | PASS | |
| `/admin` | **Недостаточно прав** + **Вернуться** → `/self-review` | PASS | n/a | n/a | required honesty |
| `/admin/users` | **Недостаточно прав** | PASS | n/a | n/a | |
| `/dashboard` | remap → `/self-review` (not ops pulse) | PASS | n/a | n/a | |
| `/reviews` | no top-nav; deep-link scoped read only — must not sell ops queue chrome / Take next | PASS | n/a | n/a | |

---

## VIEWER — viewer@example.com — `[x]` PASS (`4f2ba3a`)

Home `/auth/pending-access`. `AppNav` null — no empty areas, no ⌘K.

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO picker includes Гость / viewer@ → pending-access | PASS | n/a | PASS | |
| `/auth/pending-access` | identity email + role; logout; **«Сменить роль»** when `QC_DEMO_AUTH` (one account menu, not extra header button) | PASS | n/a | PASS | |
| `/dashboard` | login remap ignores returnTo → pending-access. If already signed in as VIEWER and URL forced: **Недостаточно прав** (`reviews:read` missing) | PASS | n/a | n/a | |
| `/reviews` | same: pending-access on login, or forbidden if session already VIEWER | PASS | n/a | n/a | |
| `/reviews/[id]`, `/reports`, `/admin`, `/self-review`, `/coaching` | pending-access / **Недостаточно прав** as designed — never product chrome | PASS | n/a | n/a | |

---

## How to use

Джамал: LIVE walk **PASS** on tip `4f2ba3a` (0 FAIL). Cells above reflect that walk. Visual dead click on other surfaces → [#118](https://github.com/m0llusca/Stemma/issues/118). `aria-expanded` mismatch on `[data-slot=review-disclosure-trigger]` → [#125](https://github.com/m0llusca/Stemma/issues/125), not a visual FAIL. Charts LIVE paint → [#119](https://github.com/m0llusca/Stemma/issues/119); CODE SoT still [#148](https://github.com/m0llusca/Stemma/issues/148). Morph → [#117](https://github.com/m0llusca/Stemma/issues/117): Copy↔Check on `/admin/tokens`; chevron on review/accordion.

ДеШон: adversarial still open — try the no-op, the impostor filter, leaked Take next on Exec/Agent, VIEWER deep-link.

Close [#116](https://github.com/m0llusca/Stemma/issues/116) only when: this matrix `PASS` + Marques UX-ACCEPT + ДеШон PASS + [#148](https://github.com/m0llusca/Stemma/issues/148) residual closed. Do not close on this walk alone.

---

## Related

- [app-shell.md](app-shell.md) — role homes, pulse/Take-next gates, forbidden UX
- [ux-queue-hotkeys-contract.md](ux-queue-hotkeys-contract.md) — j/k, Enter toggles module, finalize_next, Take next = one path
- [#125](https://github.com/m0llusca/Stemma/issues/125) — P1 `aria-expanded` sync on review disclosure (split from #118)
- [#148](https://github.com/m0llusca/Stemma/issues/148) — residual: chart CODE SoT, OTRS webhook, Playwright demo-data-current
- [research-kinetics-recharts.md](research-kinetics-recharts.md) — Exec = static SVG bars; drill SoT; no vanity
- [research-morphicons.md](research-morphicons.md) — #117 on tip `4f2ba3a`: CopyButton gate `/admin/tokens`; chevron on review/accordion; top-nav Menu/Search
- [ux-agent-feedback-contract.md](ux-agent-feedback-contract.md) — self-review pack
- [semantic-status-colors.md](semantic-status-colors.md) — probe-before-save, cert ≠ step
