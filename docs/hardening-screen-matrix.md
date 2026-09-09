# Screen matrix — hardening #116

Walk checklist for epic [#116](https://github.com/m0llusca/Stemma/issues/116). ACCEPT for #116 = this matrix all green + Джамал UX-ACCEPT + ДеШон PASS.

Child streams:

- [#118](https://github.com/m0llusca/Stemma/issues/118) dead clicks / expand-collapse / silent no-op — **visual** closed on master [`13eadb0`](https://github.com/m0llusca/Stemma/commit/13eadb008fc863b286a8fa7954e6051042d49408) (PR #123). Remaining P1: [#125](https://github.com/m0llusca/Stemma/issues/125) `aria-expanded` sync — **not** a merge blocker
- [#119](https://github.com/m0llusca/Stemma/issues/119) charts (Exec SVG bars, Lead sparkline, `/reports`)
- [#117](https://github.com/m0llusca/Stemma/issues/117) Morphicons — reopen of reject [#108](https://github.com/m0llusca/Stemma/issues/108)

### #118 status

Visual open/close+hold on score modules (click + Enter) shipped in #123 / master `13eadb0` (accepted tip **`b6d4a6c`**). LIVE SoT = **controlled `<details>` / `<summary>`**. `#118` cells stay `—` until Джамал marks the walk; note «visual fixed `13eadb0`; walk remaining surfaces». `aria-expanded` lag ≠ visual FAIL → [#125](https://github.com/m0llusca/Stemma/issues/125).

LIVE: https://offering-vendor-late-homes.trycloudflare.com (ephemeral; tip `master`).

Demo seed emails, no password, all `@example.com`: `admin@`, `qa@`, `lead@`, `maria.qa@`, `exec@`, `ivan@`, `olga.agent@`, `denis.agent@`, `elena.agent@`, `viewer@`.

**PASS** = control works **and** BE is honest (no silent no-op, no fake-green, no impostor `/reviews?status=unreviewed`). Soft smoke (login / bars / role-switch) is **not** enough.

Status cells start `—` (pending). After walk: `PASS` or `FAIL` + issue link. `n/a` = stream has no surface on that row.

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
| Account menu | identity, logout, **«Сменить роль»** (DEMO) → lands on new role home | — | n/a | — | #117: menu↔X / chevron if wired |
| Top-nav | only areas from the table above; no dead href; no forbidden page from a visible item | — | n/a | — | |
| ⌘K | modes for this role; **Взять следующий** writers only; Exec: overdue + quarter analytics, no Take next; Agent: **Перейти к обучению**, no Take next / overdue | — | n/a | — | |
| Ops pulse | **Очередь** / **Риск** + pulse **Взять следующий** — Admin/Lead/QA only. Exec/Agent: absent, not disabled-looking | — | n/a | n/a | |

---

## ADMIN — admin@example.com — `[ ]` PASS

Home `/dashboard`. Nav: Сегодня / Проверки / Калибровка / Обучение / Аналитика / Настройки. Pulse + Take next on.

### Auth + chrome

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO picker, login → `/dashboard`, logout → login | — | n/a | — | |
| (shell) | account **«Сменить роль»**, top-nav 6 areas, ⌘K (Сегодня/Работа/Качество/Команда/Система + Take next), pulse Очередь/Риск | — | n/a | — | |

### Dashboard + reviews + reports

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/dashboard` | welcome-back **«Сбросить к очереди дня»**; triage **Разобрать** / empty **Взять следующий**; KPI **Просрочено SLA** / **Высокий риск** / **Проверок за неделю** / **Активных обучений** → honest hrefs (never `status=unreviewed`); sparkline **Качество команды · 7 дней** (цель 90, point → period queue); **Нагрузка проверяющих** name/counts → queue; **Ещё в фокусе** | — | — | n/a | #119 Lead/Admin sparkline |
| `/reviews` | filters (Итог, Статус проверки, Проверяющий, Срок, Риск, Sheet редких срезов); **Сбросить фильтры** → `/reviews`; SavedViews apply + create/rename/delete; **Взять следующий**; next-case preview collapse/expand + CTA; welcome-back reset; empty **Очередь пуста** / **В текущем представлении нет кейсов** | — | n/a | — | |
| `/reviews/[conversationId]` | **Roman P0**: **модули оценки** = **controlled `<details>` / `<summary>`** (tip `b6d4a6c` / master `13eadb0`). Click + Enter: visual open/close+hold. Steps **Оценка по критериям** / **Итог проверки** / **Дополнительно**; **Группа процесса** blocks; per-criterion summary (Enter/Esc); score 1/2/3; **Сохранить черновик**; **Завершить проверку**; **Завершить и взять следующий** (⌘↩); `?` legend; AI draft Принять/Отклонить/Изменить if present; appeal/feedback under Дополнительно | — | n/a | — | visual fixed `13eadb0`; walk remaining. aria lag → #125, not visual FAIL |
| `/reports` | period: **Текущий период 22-21** / прошлый 22-21 / календарный месяц / квартал / произвольный; KPI + chart panels (static SVG / `StaticChartContainer`, not blank `.recharts-wrapper`); bar/point → evidence sheet or filtered queue; export CSV/XLSX/PDF if menu present | — | — | n/a | |
| `/calibration` | **Новая сессия** / **Скрыть форму**; **Создать сессию**; session tabs; **Завершить**; matrix / agreement rows clickable → session or queue | — | n/a | — | accordion/chevron → #117 |
| `/coaching` | views active/overdue/week/mine/unlinked/done/all; KPI drills; **Создать план** / **Создать задачу**; assignment **Готово** / **Вернуть**; theme/filter submit | — | — | — | sparkline on coaching if shown |

### Admin hub (full rail)

Each row: rail link works, expand/collapse if any, save/probe persists or errors honestly. Dead click → #118.

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/admin` | cards + quick actions (Подключить источник, Изменить форму оценки, Добавить выборку, …); rail all groups; accent/cert tone honest (not fake «в рабочем состоянии») | — | n/a | — | |
| `/admin/scorecards` | create/edit version, criteria, save → redirect overview | — | n/a | — | |
| `/admin/sampling` | **Новое правило** / **Сохранить правило** / **Создать правило** | — | n/a | — | |
| `/admin/ai-scoring` | **Сохранить движок**; provider key **Сохранить**; no silent empty save | — | n/a | — | |
| `/admin/integrations` | list, **Подключить** / new; cert chips ≠ live without cert | — | n/a | — | |
| `/admin/integrations/[id]` | probe / capability / save; green only after live cert | — | n/a | — | |
| `/admin/users` | **Создать пользователя**; row **Сохранить** role/line | — | n/a | — | |
| `/admin/access` | **Сохранить провайдера**; **Проверить вход**; group Switch + **Сохранить группу**; probe ≠ live SSO | — | n/a | — | |
| `/admin/channels` | channel save; probe-honesty (not «connected» without probe) | — | n/a | — | |
| `/admin/system` | **Проверить окружение** / **Проверить SSO**; job links | — | n/a | — | |
| `/admin/appearance` | theme / density / palette apply; **Применено** only after save | — | n/a | — | |
| `/admin/localization` | locale enable + publish/save texts | — | n/a | — | |
| `/admin/tokens` | create / revoke key | — | n/a | — | |
| `/admin/audit` | filters above list; row expand; empty «Под текущий фильтр нет записей» | — | n/a | — | |
| `/admin/report-schedules` | create/edit schedule, recipients, enable | — | n/a | — | |

---

## TEAM_LEAD — lead@example.com — `[ ]` PASS

Home `/dashboard`. Nav same six areas as Admin. Pulse + Take next on.

Admin rail **only**: Формы оценки, Правила выборки, Журнал действий, Расписания отчетов (+ Обзор).

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO → `/dashboard` | — | n/a | — | |
| (shell) | **«Сменить роль»**, 6 nav areas, ⌘K + Take next, pulse Очередь/Риск | — | n/a | — | |
| `/dashboard` | same Lead/Admin ops pulse as Admin (4 KPI, triage, Take next, sparkline, нагрузка) | — | — | n/a | |
| `/reviews` | filters, SavedViews mutate, Take next, welcome-back, empty | — | n/a | — | |
| `/reviews/[conversationId]` | **модули оценки**: controlled `<details>` / `<summary>` (`b6d4a6c` / `13eadb0`). Visual open/close+hold on click+Enter; finalize; hotkeys; AI draft; appeal | — | n/a | — | visual fixed `13eadb0`. aria → #125 |
| `/reports` | period, charts, drill, export | — | — | n/a | |
| `/calibration` | create / complete session | — | n/a | — | |
| `/coaching` | manage plans/tasks (not consume-only) | — | — | — | |
| `/admin` | cards: scorecards, sampling, audit, report-schedules only. Title **Доступные разделы** if no cert health — not cert-green | — | n/a | — | |
| `/admin/scorecards` | edit/save form | — | n/a | — | |
| `/admin/sampling` | create/save rule | — | n/a | — | |
| `/admin/audit` | filters + expand | — | n/a | — | |
| `/admin/report-schedules` | create/edit | — | n/a | — | |
| `/admin/users` (deep-link) | **Недостаточно прав** + **Вернуться** → `/dashboard` | — | n/a | n/a | honesty |
| `/admin/integrations` (deep-link) | **Недостаточно прав** | — | n/a | n/a | |

---

## QA_ANALYST — qa@example.com — `[ ]` PASS

Home `/reviews?qaAssignee=<имя>&due=overdue` (maria.qa@ — свой inbox). Nav: Сегодня (= inbox) / Проверки / Калибровка / Обучение / Аналитика / Настройки. Pulse + Take next on.

`/dashboard` still opens by URL (residual `DASHBOARD_ROLES`) — not a ⌘K «Пульс дня».

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO → mine+overdue inbox | — | n/a | — | |
| (shell) | **«Сменить роль»**; Сегодня highlights only on exact inbox query; Проверки = bare `/reviews`; ⌘K Сегодня = **Мои + просрочено** (no Пульс дня); Take next; pulse Очередь/Риск | — | n/a | — | |
| `/reviews` (Сегодня) | inbox filters pre-set; **Сбросить фильтры** → same inbox (not bare `/reviews`); SavedViews; Take next; welcome-back; empty | — | n/a | — | |
| `/reviews` (Проверки) | unfiltered list; filters; Take next; empty | — | n/a | — | |
| `/reviews/[conversationId]` | **#118 first repro (visual closed `13eadb0`)**: **модули оценки** = controlled `<details>` / `<summary>` (`b6d4a6c`). Click + Enter: open, close, **hold**. **Группа процесса** + per-criterion summaries; score; finalize + finalize_next; hotkeys; AI draft if present; appeal | — | n/a | — | visual PASS ≠ aria. aria-expanded lag → #125 |
| `/dashboard` | residual URL: KPI (no Lead sparkline / нагрузка — no `peer_quality:read`); empty triage **Открыть сегодня** (href home, not Take next) | — | n/a | n/a | no hero chart |
| `/reports` | period, charts, drill, export — mini charts OK | — | — | n/a | |
| `/calibration` | create / complete | — | n/a | — | |
| `/coaching` | manage | — | — | — | |
| `/admin` | **Доступные разделы**; card **Расписания отчетов** only | — | n/a | — | |
| `/admin/report-schedules` | create/edit schedule | — | n/a | — | |
| `/admin/scorecards` (deep-link) | **Недостаточно прав** | — | n/a | n/a | |

---

## EXEC — exec@example.com — `[ ]` PASS

Home `/dashboard` = ExecRiskHome. Nav: Сегодня / Проверки / Аналитика. **No** Калибровка / Обучение / Настройки. **No** pulse Очередь/Риск. **No** Take next.

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO → `/dashboard` | — | n/a | — | |
| (shell) | **«Сменить роль»**; 3 nav areas; ⌘K Сегодня + **Открыть просроченные SLA** + **Открыть аналитику за квартал**; no Take next; no pulse | — | n/a | — | leaked Take next = FAIL |
| `/dashboard` | 3 KPI: **Просрочено SLA** / **Высокий риск** / **Очередь без старта** (LIVE seed often 8 / 13 / 4); triage action → queue; **Сигналы риска**: **3 SVG bars** (`<svg class="recharts-surface">`), **not** `.recharts-wrapper` / Recharts `BarChart`; bar click = same KPI href; summary table beside chart; **EmptyState** «Нет сигналов за период» (`queueFilterResetHref` → `/reviews`) — force empty / unit path; **no** Take next | — | — | n/a | #119 visual + drill |
| `/reviews` | read filters + apply SavedViews; **no** create/rename/delete; **no** Take next; **no** preview submit | — | n/a | — | |
| `/reviews/[conversationId]` | read workbench; no finalize / draft save; modules = controlled `<details>` / `<summary>` if present — visual open/close+hold (click+Enter) | — | n/a | — | aria → #125 |
| `/reports` | period, charts, drill, export | — | — | n/a | |
| `/calibration` | **Недостаточно прав** | — | n/a | n/a | |
| `/coaching` | **Недостаточно прав** | — | n/a | n/a | |
| `/admin` | **Недостаточно прав** | — | n/a | n/a | |
| `/self-review` | **Недостаточно прав** | — | n/a | n/a | |

---

## SUPPORT_AGENT — ivan@example.com — `[ ]` PASS

Home `/self-review`. Nav: **Моя обратная связь** + **Обучение**. Brand → self-review, not ops pulse. **No** Проверки / Сегодня / Калибровка / Аналитика / Настройки. **No** pulse. **No** Take next.

Also walk olga.agent@ / denis.agent@ / elena.agent@ if inbox empty for Иван.

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO → `/self-review` | — | n/a | — | |
| (shell) | **«Сменить роль»**; 2 nav areas; ⌘K **Моя обратная связь** + **Перейти к обучению**; no Take next; no pulse | — | n/a | — | |
| `/self-review` | feedback pack: цитата → снятие → как исправить → апелляция; deduction expand/collapse; **Принять оценку**; appeal CTA or disabled+reason; training **Готово**; personal ScoreSparkline (no public ranks / FAIL spectacle); empty honesty (never-assigned ≠ «Все разборы закрыты») | — | — | — | sparkline = personal, not vanity |
| `/coaching` | consume: own assignments, status **Готово**; **no** Создать план / Создать задачу | — | n/a | — | |
| `/admin` | **Недостаточно прав** + **Вернуться** → `/self-review` | — | n/a | n/a | required honesty |
| `/admin/users` | **Недостаточно прав** | — | n/a | n/a | |
| `/dashboard` | remap → `/self-review` (not ops pulse) | — | n/a | n/a | |
| `/reviews` | no top-nav; deep-link scoped read only — must not sell ops queue chrome / Take next | — | n/a | n/a | |

---

## VIEWER — viewer@example.com — `[ ]` PASS

Home `/auth/pending-access`. `AppNav` null — no empty areas, no ⌘K.

| Route | Surface / controls | #118 | #119 | #117 | Notes |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | DEMO picker includes Гость / viewer@ → pending-access | — | n/a | — | |
| `/auth/pending-access` | identity email + role; logout; **«Сменить роль»** when `QC_DEMO_AUTH` (one account menu, not extra header button) | — | n/a | — | |
| `/dashboard` | login remap ignores returnTo → pending-access. If already signed in as VIEWER and URL forced: **Недостаточно прав** (`reviews:read` missing) | — | n/a | n/a | |
| `/reviews` | same: pending-access on login, or forbidden if session already VIEWER | — | n/a | n/a | |
| `/reviews/[id]`, `/reports`, `/admin`, `/self-review`, `/coaching` | pending-access / **Недостаточно прав** as designed — never product chrome | — | n/a | n/a | |

---

## How to use

Джамал: walk LIVE per role. Fill Notes. Score-module visual is fixed on `13eadb0` — still mark the `#118` cell after walk. Visual dead click on other surfaces → [#118](https://github.com/m0llusca/Stemma/issues/118). `aria-expanded` mismatch on `[data-slot=review-disclosure-trigger]` → [#125](https://github.com/m0llusca/Stemma/issues/125), not a visual FAIL. Charts → [#119](https://github.com/m0llusca/Stemma/issues/119). Morph → [#117](https://github.com/m0llusca/Stemma/issues/117).

ДеШон: adversarial per PR that claims a row green — try the no-op, the impostor filter, the missing Take next on Exec/Agent, VIEWER deep-link.

Close [#116](https://github.com/m0llusca/Stemma/issues/116) only when: this matrix all `PASS` + UX-ACCEPT + ДеШон PASS.

---

## Related

- [app-shell.md](app-shell.md) — role homes, pulse/Take-next gates, forbidden UX
- [ux-queue-hotkeys-contract.md](ux-queue-hotkeys-contract.md) — j/k, Enter toggles module, finalize_next, Take next = one path
- [#125](https://github.com/m0llusca/Stemma/issues/125) — P1 `aria-expanded` sync on review disclosure (split from #118)
- [research-kinetics-recharts.md](research-kinetics-recharts.md) — Exec = static SVG bars; drill SoT; no vanity
- [research-morphicons-reject.md](research-morphicons-reject.md) — #108 reject. **#117 reopens Morphicons** (wire ≥2 surfaces or Roman-accepted reject)
- [ux-agent-feedback-contract.md](ux-agent-feedback-contract.md) — self-review pack
- [semantic-status-colors.md](semantic-status-colors.md) — probe-before-save, cert ≠ step
