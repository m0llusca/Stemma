# Morphicons: reject for now (#108)

**Verdict: do not land.** Spike note only — no wired surfaces.

Roman (2026-09-08): consider [morphicons](https://www.morphicons.com/) for Lucide stroke morphs. Issue #108 accepts either 1–2 wired surfaces **or** a documented reject. This is the reject.

## Why not now

1. **No helper exists.** There is no `MorphIcon` wrapper, `fitIcon` adapter, or `morphicons` dependency in `apps/web`. Icons are `lucide-react` **components**, not Lucide `IconNode` data (`import { … } from "lucide"`). Morphicons cannot drop in without a new package plus a data-node helper.

2. **Provenance is unchecked.** #108 requires the same license bar as Kinetics. Kinetics source was not copied because GitHub had no `LICENSE` ([audit](memory/2026-07-28-kinetics-evilcharts-provenance-audit.md)). Morphicons has not been audited; do not add the dep on a live demo PR.

3. **Kinetics already parked this pattern.** “Icon Morph Swap” is **Conditional**, not Accept — needs a concrete product need, `prefers-reduced-motion` instant swap, and focused tests. Motion on chrome already uses CSS spring tokens in `globals.css` ([Kinetics + Recharts fit](research-kinetics-recharts.md)). A second JS morph runtime is not justified yet.

4. **This branch is the wrong place.** PR #111 is a fail-closed demo role-switch (`QC_DEMO_AUTH`). Account-menu and charts are contested by other agents — out of scope even if a helper existed. The one existing icon swap (`CopyButton` Copy↔Check) is a ternary of `lucide-react` icons; wiring Morphicons there still requires the missing helper.

## Revisit when

- Isolated branch (not this mega-PR).
- Provenance/license note (same bar as Kinetics).
- Thin helper: Lucide data nodes → `MorphIcon`, `prefers-reduced-motion` = instant swap (library default).
- Then **one** low-risk surface first: `CopyButton` Copy↔Check. Do not morph account-menu chevrons or chart chrome.

## Related

- Issue #108
- `apps/web/src/components/copy-button.tsx` — current Copy↔Check swap
- `apps/web/components.json` — `iconLibrary: lucide` (React components)
