# Stemma UX — Adversarial Persona Synthesis (FINAL)

**Дата:** 2026-09-04  
**Вход:** 20 persona-интервью + UI map (`/dashboard`, `/reviews`, `/reviews/[id]`, `/self-review`, `/calibration`, `/coaching`, `/reports`, `/admin/*`)  
**Статус:** decision document — без реализации кода

---

## 1. Кластеры и конфликты

| Кластер | Кто | Суть | Конфликт |
|--------|-----|------|----------|
| **A. Честность статуса** | Анна, Алина, Елена, Сергей, Дарья, Red team, Максим | Status ≠ state; зелёный только после live cert/probe; audit trail | Dual status / лживые чипы vs «всё зелёное = ок» для exec |
| **B. Queue density vs calm** | Павел, Никита, Роман vs Мария, Ольга, Артём | Excel-строки + hotkeys vs воздух, tour, personal feedback | Dense table vs airy cards; speed vs newbie safety |
| **C. Chrome vs inbox** | Red team, Юлия, Ольга, Виктор | Sticky/KPI/Focus map съедают высоту; translucency; focus trap | Sticky filters (Анна keep) vs cut chrome (Red team) |
| **D. Role-homepages** | Игорь/Кирилл/Наталья vs Анна/Роман | Risk narrative / SLA / chart→queue vs reviewer default «взять следующий» | One `/dashboard` for all roles breaks someone |
| **E. Trust & compliance** | Елена, Максим, Татьяна, Мария | Immutable scores, SSO fail-closed, appeal, sampling trust | Ops convenience vs silent edits / privilege elevate |
| **F. Filters memory** | Анна, Светлана, Артём, Ольга | Saved views + default «Мои+просрочено» vs remembered-trap | Power defaults vs infrequent-user trap |
| **G. Admin IA** | Сергей, Дарья | Channels/notifications/integrations/SSO путаница; probe-before-save | Rename vs deep regroup |

---

## 2. Adversarial pass (атака популярных идей)

**«Убить next-case preview» (Роман).** Выигрыш кликов у power QA. Проигрыш Артёма (day-1) и Виктора (нет контекста до Enter). Вердикт: не убивать — **схлопнуть по умолчанию**, открывать по hotkey/`?` или для роли newbie.

**«Плотный Excel vs airy cards».** Cards = theater для Павла, медленнее j/k. Airy = спокойнее для Марии на detail, не на queue. Вердикт: **queue = rows**; calm layout только на agent feedback / self-review.

**«Exec risk homepage на /dashboard».** Наталья/Игорь правы про 30s narrative — но Анна/Роман живут в inbox. Один hero-dashboard для всех = anti-pattern charts без action (Игорь). Вердикт: **role-gated home**, не единый marketing dashboard.

**«Sticky + KPI + Focus map».** После `bg-card/95` Red team всё ещё бьёт translucency и высоту; Виктор — sticky DOM swap = focus loss (blocker). Вердикт: **solid sticky под topbar token**; резать **одну** chrome-зону (Focus map **или** KPI strip, не оба).

**«Shared saved views для lead».** Полезно Игорю; опасно Светлане (чужой/старый filter trap) и compliance (shared view ≠ audit). Вердикт: shared views **opt-in workspace**, с welcome-back reset.

**«Advanced filters всегда видны».** Overload (Анна), morning-only (Роман), mobile one-layer (Ольга). Вердикт: advanced = **drawer/sheet**, не permanent chrome.

---

## 3. Winners (≤8) — prioritized

| # | Рекомендация | Кому польза | Кто теряет | Почему проходит adversarial | Effort | Pri |
|---|--------------|-------------|------------|------------------------------|--------|-----|
| 1 | **Unify status vocabulary:** «Состояние»→«Статус проверки»; один chip = один source of truth; overdue announce | Алина, Анна, Виктор, Red team | Кто привык к dual labels | Без честных чипов остальное — theater | M | **P0** |
| 2 | **Solid sticky + a11y contract:** opaque `bg-card` (не /95), focus restore после sticky remount, live region on filter apply | Юлия, Виктор, Red team, Анна | «Glass» aesthetic | Translucency и focus — доказанные blockers | S–M | **P0** |
| 3 | **Role-default home + queue default view:** Analyst → queue «Мои+просрочено»; Lead → SLA/load/coaching tail drill-down; Agent → calm self-review; Exec → 30s risk (ops chrome hidden) | Анна, Игорь, Мария, Наталья | «Один dashboard для всех» | Конфликт D решается сегментацией, не компромиссом-кашей | L | **P0** |
| 4 | **Cut chrome budget:** на queue оставить sticky filters + Take next; убрать Focus map **или** KPI strip (не оба); advanced → sheet | Red team, Ольга, Роман, Павел | Fans of dashboard-in-queue | Inbox > chrome — единственный способ вернуть высоту без потери filters | M | **P0** |
| 5 | **Finish-and-next + hotkeys immutable:** j/k Enter Esc digits; never silent next-case logic change; hotkey-in-input guard | Никита, Анна, Роман | Preview-first UI | Scores 8–9; удаление = регресс доверия power users | S | **P0** |
| 6 | **Admin honesty gate:** rename Channels; probe-before-save; capability matrix; write-only secrets; green только после live cert; SSO fail-closed; 401≠403 | Сергей, Дарья, Максим, Елена | Fake «connected» UX | Certification — product promise Stemma | M–L | **P1** |
| 7 | **Agent feedback trust pack:** quote + how-to-fix per deduction; appeal path; no public ranks / red FAIL spectacle | Мария, Елена, Татьяна | Rankings vanity | Fear-driven UX ломает adoption агентов | M | **P1** |
| 8 | **Welcome-back + glossary/tour:** safe reset remembered filters; 3-step day-1; tooltips на SLA/OTRS | Светлана, Артём | Zero onboarding cost | Infrequent + newbie — иначе churn на фильтрах | M | **P2** |

---

## 4. Kill list (не делать)

1. **Не** менять next-case / Take next логику тихо (Анна blocker).
2. **Не** зелёный badge / «connected» без live probe+cert (Сергей, Дарья, Red team).
3. **Не** silent score edits / privilege elevate (Елена, Максим deal-breaker).
4. **Не** публичные ranks / FAIL-as-spectacle для агентов (Мария).
5. **Не** vanity avg score / charts без drill-to-queue (Кирилл, Игорь).
6. **Не** cards на queue вместо rows (Павел).
7. **Не** оставлять `bg-card/95` как «fix» translucency (Red team).
8. **Не** держать Focus map **и** KPI strip одновременно на queue.
9. **Не** BEM / native dialog leftovers — только `@/components/ui/*` (Юлия).
10. **Не** единый exec-hero homepage для QA Analyst default.

---

## 5. North-star IA (по одной фразе)

- **Queue:** «Inbox просроченного и моего — строки, скучные фильтры, Take next; chrome не конкурирует с делом.»
- **Agent feedback:** «Спокойная личная оценка: цитата → вывод балла → как исправить → апелляция; без публичного позора.»
- **Admin:** «Интеграции и доступ fail-closed: probe, evidence, secret refs; зелёный = сертифицировано, иначе warning/neutral.»

---

## 6. Scorecard — UX health

**Общая оценка: 5.5 / 10**

Продукт уже близок к power-user inbox (hotkeys, saved views, Take next), но честность статусов, chrome/высота, role-homepages и agent trust тянут ниже «готово к масштабу».

**Сильные стороны (3)**  
1. Saved views + Finish-and-next — ядро workflow QA (Анна, Никита).  
2. Role-aware product surface уже намечена в shell nav.  
3. Fail-closed / certification — правильный north star для Stemma (admin/security personas).

**Риски (5)**  
1. Dual status / лживые чипы → потеря trust (Red team craft honesty 4).  
2. Sticky translucency + focus loss → a11y blocker.  
3. Chrome > inbox → triage на mobile/dense desktop ломается.  
4. Один dashboard для всех ролей → anti-action theater.  
5. Agent fear (FAIL/ranks) + silent compliance gaps → adoption + audit failure.

---

## 7. P0 backlog (≤5, порядок)

1. **Status truth:** переименовать «Состояние»→«Статус проверки»; один chip; overdue в a11y/date.  
2. **Sticky solid + focus restore** (убрать /95; live region на apply filters).  
3. **Queue chrome cut:** выбрать cut Focus map **или** KPI; advanced → sheet; mobile one-layer.  
4. **Role-default entry:** Analyst→queue default «Мои+просрочено»; Lead SLA drill; Agent calm feedback home.  
5. **Lock Take next / hotkeys contract** (документировать + тест; без silent logic change).

---

*Synthesis lead verdict: ship honesty and inbox density before polish. Popular «kill preview / more KPIs / glass sticky» ideas fail adversarial tests against accessibility, trust, and day-1 survival.*


## Appendix: Lazyweb evidence

**Status: FAILED_AUTH** — Lazyweb MCP (`user-lazyweb`) unreachable this run: live tool discovery error, `mcp_auth` rejected (`Server disconnected`), and `lazyweb_search` timed out waiting for connection. No agentic search was finalized; no Lazyweb URLs.

### Industry takeaways (no Lazyweb evidence)

1. **Queue-first density** — Mature QA / support review products treat the ticket list as the primary surface: dense rows, scannable SLA/overdue signals, minimal chrome above the fold.
2. **Sticky filters stay solid** — Sticky filter/command bars over long lists use opaque backgrounds and clear focus restore after apply; translucent/glass sticky layers hurt readability and keyboard a11y.
3. **Next-case as a contract** — "Take next" / next-case panels succeed when they are a predictable shortcut into the same filtered queue, not a separate product mode that silently changes sort or eligibility.
4. **Role-homed workspaces** — Analysts land on queue + saved views; agents land on calm personal feedback; leads land on SLA drill-downs — one shared dashboard for all roles reads as theater.
5. **Status honesty over badges** — Dual or decorative status chips erode trust; one true review status plus overdue on date/a11y text matches how operators actually triage.
