# Screen matrix — hardening #116

Walk checklist for epic [#116](https://github.com/m0llusca/Stemma/issues/116) (**closed**). ACCEPT for #116 = this matrix all green + Marques UX-ACCEPT + Дешон PASS.

LIVE stand: https://nvqawe-ip-184-193-214-193.tunnelmole.net (ephemeral; tip **`3aedc85`** (docs [#179](https://github.com/m0llusca/Stemma/pull/179); soft code [#178](https://github.com/m0llusca/Stemma/pull/178) / [#175](https://github.com/m0llusca/Stemma/issues/175); login 200). Dead: `hospital-studies…`, `therapeutic-pond…`, `numerous-housewares…`, `bailey-pat…`. #116 walk package stayed on `dc5de92` / walk `4f2ba3a` — cells below are that walk, not a new epic pass. Density SoT: [ux-density-contract.md](ux-density-contract.md). Smoke P0 closed on `2556e9e`. Soft [#175](https://github.com/m0llusca/Stemma/issues/175) Admin `/reviews/queue` **closed** on `005ab49`: relative **307** → `/reviews?qaStatus=QUEUED` (no separate page; not `0.0.0.0`).

Master tip **`dc5de92`** (squash of [#148](https://github.com/m0llusca/Stemma/issues/148); PR tip was `1a12803`). [#148](https://github.com/m0llusca/Stemma/issues/148) is **merged**. LIVE walk **PASS** on `4f2ba3a` (Джамал, 0 FAIL): QA / Exec / Admin / Lead / Agent / Viewer + role-switch Admin→Exec. Matthew ACK: cells PASS with walk tip SHA. Role headers stay walk PASS on `4f2ba3a`; package is master `dc5de92`. [#116](https://github.com/m0llusca/Stemma/issues/116) **closed**. Chart SoT = Recharts (LIVE + #148). #152 docs≠code closed. Login/tokens Next 0 Issues LIVE PASS (Джамал + André probe). Soft `/reports` «1 Issue» NACK (Дешон / Джамал) — not a blocker. Do not invent PASS for the master epic re-walk.

Child streams (code on master **`dc5de92`**):

- [#118](https://github.com/m0llusca/Stemma/issues/118) dead clicks / expand-collapse / silent no-op — **visual** closed on master [`13eadb0`](https://github.com/m0llusca/Stemma/commit/13eadb008fc863b286a8fa7954e6051042d49408) (PR #123). LIVE: score modules open/close+Enter hold **PASS**. [#125](https://github.com/m0llusca/Stemma/issues/125) `aria-expanded` sync is **implemented** (`review-disclosure.tsx` React SoT); aria lag is not a visual FAIL
- [#119](https://github.com/m0llusca/Stemma/issues/119) charts — LIVE paint **PASS** (Exec Recharts 3 bars + overdue drill). Docs SoT = Recharts (matches LIVE + #148). #152 folded here
- [#117](https://github.com/m0llusca/Stemma/issues/117) Morphicons — LIVE **PASS** (Copy↔Check on `/admin/tokens`)

### #118 / #117 / #125 status

Master tip **`dc5de92`** (`dc5de92a21f943df97b26275643f31b3f4e4a17c`). #148 squash; PR tip `1a12803`. Walk PASS = Jamal LIVE on `4f2ba3a`. Master has Waves A–C ([`84370da`](https://github.com/m0llusca/Stemma/commit/84370da): jobs hardening, reports split, OTRS honesty, ingress rate limits, calibration ritual defaults, activation/cert evidence) + chart fixes (`5ebcd01`, `27ebbff`, `28af033`) + Morphicons + #148 (Recharts SoT, OTRS webhook scoped, tokens create/Copy fail-closed, login/tokens hydrate, logout public origin).

LIVE SoT = controlled `<details>` / `<summary>` with React `open` + `aria-expanded` (`review-disclosure.tsx`).

#117 Copy↔Check LIVE gate: Admin `/admin/tokens` (also `/admin/access` SCIM and `/admin/integrations` CodeBlock). **Not** the review workbench. Chevron / score-module morph stays on review accordion.

Exact-filters Sheet stays closed until the user opens it (no auto-open overlay on the inbox).

Login / tokens Next Issues **0** LIVE PASS (Джамал + André probe). Soft `/reports` «1 Issue» NACK (Дешон / Джамал) — not a blocker. Walk PASS on `/auth/login` is DEMO picker / land / logout.

LIVE: https://nvqawe-ip-184-193-214-193.tunnelmole.net (ephemeral; current stand tip `3aedc85`, #178 / #175 soft closed). #116 walk package stayed on `dc5de92`. Dead: `hospital-studies…`, `therapeutic-pond…`, `numerous-housewares…`, `bailey-pat…`.

Demo seed emails, no password, all `@example.com`: `admin@`, `qa@`, `lead@`, `maria.qa@`, `exec@`, `ivan@`, `olga.agent@`, `denis.agent@`, `elena.agent@`, `viewer@`.

**PASS** = control works **and** BE is honest (no silent no-op, no fake-green, no impostor `/reviews?status=unreviewed`). Soft smoke (login / bars / role-switch) is **not** enough.

Cells below: `PASS` = Jamal LIVE on tip `4f2ba3a`. Not a master-`dc5de92` epic re-walk; #116 closed. Current stand tip `3aedc85`. `n/a` = stream has no surface on that row.

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

Ops pulse **Очередь** / **Риск** (/ **Обучение**) badges: `reviews:write` only — Admin / Lead / QA. **Not** Exec / Agent / Viewer.

⌘K **Взять следующий**: same write-gate. Exec/Agent must not see it.

Account menu **«Сменить роль»**: only when `QC_DEMO_AUTH=enabled`. Same seeded identities as login.

**PASS** = control works **and** BE is honest (no silent no-op, no fake-green, no impostor `/reviews?status=unreviewed`). Soft smoke (login / bars / role-switch) is **not** enough.

Cells below: `PASS` = Jamal LIVE on tip `4f2ba3a`. Not a master-`dc5de92` epic re-walk; #116 closed. Current stand tip `3aedc85`. `n/a` = stream has no surface on that row.

SoT: [`role-home.ts`](../apps/web/src/lib/auth/role-home.ts), [`navigation.ts`](../apps/web/src/lib/shell/navigation.ts) `visibleTopNavAreas`, [app-shell.md](app-shell.md).

---

## Related

- [app-shell.md](app-shell.md)
- [ux-density-contract.md](ux-density-contract.md) — chrome **`dca6c00`** (#166/#167); soft package **`e325df6`** (#170/#169); **#172/#173** tip **`67635ab`**. Reports P0 + coaching empty. Open: criteria/timeline bloat; no fake empty chart points
- [ux-queue-hotkeys-contract.md](ux-queue-hotkeys-contract.md)
- [#125](https://github.com/m0llusca/Stemma/issues/125)
