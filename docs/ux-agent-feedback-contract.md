# Agent feedback trust pack

Locked UX contract for SUPPORT_AGENT feedback after a finalized review (P0 #92). Changing the deduction order, quote honesty, appeal phases, or anti-spectacle rules needs an explicit product decision — never a silent drift.

Primary surface: `/self-review` detail of a finalized review assigned to the agent.  
Secondary: coaching assignment linked from the same review (`/coaching`, how-to-fix link).  
**Not** on `/reviews` queue chrome (Agent already has no ops chrome — do not regress #73).

## North star

Calm personal loop: **цитата → снятие → как исправить → апелляция**. No public shame, no FAIL spectacle.

## Per deduction card

One deduction = one block. Required order:

| # | Block | Contract |
| --- | --- | --- |
| 1 | **Цитата** | Exact conversation snippet from the linked evidence message. If missing: «цитата недоступна». Never invent. |
| 2 | **Снятие** | Criterion name + points impact on the 0–100 review total. Same weighted math as `calculateReviewScore`; display only. |
| 3 | **Как исправить** | 1–3 concrete actions. Training/coaching link if assigned. Discard generic «будьте внимательнее». If no reviewer comment, use short honest copy — do not invent what the agent should have said. |
| 4 | **Апелляция** | Visible CTA when status allows. Disabled + reason when not. |

Expand/collapse is allowed. Collapsed header must still show criterion + impact + that quote/fix exist.

## Appeal

- SUPPORT_AGENT starts appeal from the deduction block or the review footer in ≤2 clicks.
- Backend statuses are unchanged (`none` / `open` / `calibration` / `confirmed` / `corrected`).
- Agent-facing phases (RU only, no English enums): **не подана → подана → на рассмотрении → решена**.
- After submit: confirmation toast + next steps (who reviews, 2-day SLA, status does not change).
- Fail: honest toast / forbidden copy. Do not dump the agent into `error.tsx`.

## Anti-spectacle

Kill on agent surfaces:

- public ranks / peer leaderboard
- big red FAIL banner
- score shaming («вы провалили»)

Criterion FAIL is an honest chip on the deduction (`не зачтено` / warning|danger), not page spectacle.

Empty states stay honest:

- never-assigned ≠ «Все разборы закрыты» (#61)
- pending reply is not success-green theater (#57)

## Out of scope

Queue chrome, Exec risk home, Lead peer quality, changing score math or silent edits, Analyst write UI.
