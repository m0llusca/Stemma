# Morphicons: adopted spike (#117)

**Verdict: implement.** Isolated PR. Supersedes the #108 reject note.

Roman (2026-09-09): implement, not defer. Parent epic: #116.
Marques UX-ACCEPT: **exactly 2** surfaces — CopyButton + accordion/score-module chevron. Account-menu chevron is later, not in this spike.

## Provenance

| Item | Value |
| --- | --- |
| Package | `morphicons@1.7.1` |
| License | MIT ([upstream LICENSE](https://github.com/guillermolg00/morphicons/blob/main/LICENSE), © 2026 Guillermo) |
| Repo | https://github.com/guillermolg00/morphicons |
| Site | https://www.morphicons.com/ |
| Icon data | `lucide-react@0.468.0` (ISC) — same package the rest of the app imports |

Colorion Kinetics has no public npm (gallery-only); Stemma ships first-party `@stemma/kinetics` for spring tokens only and still does not copy Colorion React demos ([audit](memory/2026-07-28-kinetics-evilcharts-provenance-audit.md)). Morphicons remains a separate MIT npm package.

Call sites import from `lucide-react` (already on the stand). `asMorphIcon` unwraps those components to the flat `IconNode` Morphicons consumes. Do not add a bare `lucide` package.

## Surfaces (this spike)

| Surface | Morph | Notes |
| --- | --- | --- |
| CopyButton | Copy ↔ Check | Required ACCEPT |
| Accordion / score-module chevron | ChevronDown ↔ ChevronUp | Required ACCEPT: `Accordion` + review/scorecard modules |

## Out of scope (no morph spam)

- Queue chrome (`QueueNextCasePreview`, saved-view chevrons, Take next)
- Chart chrome (#119)
- Nav Menu↔X / every top-bar icon
- Select / combobox / calendar / native-select chevrons
- Blanket replace of `lucide-react`

Status pills stay on Kinetics CSS (`--motion-duration-morph` on `Badge` / `Chip` / `StatusBadge`).

## Reduced motion

Product wrapper always passes `reducedMotion="user"`. Morphicons instant-swaps while `prefers-reduced-motion: reduce` is on. Spring preset is `snappy` (~Kinetics `--motion-duration-morph` 350ms).

## Helper

- `apps/web/src/components/ui/morph-icon.tsx` — `MorphIcon`
- `apps/web/src/components/ui/disclosure-morph-chevron.tsx` — disclosure pair
- `apps/web/src/lib/ui/lucide-morph.ts` — lucide-react unwrap

## Related

- Issues #117, #116 (reopen of #108)
- Marques UX-ACCEPT: https://github.com/m0llusca/Stemma/issues/117#issuecomment-5597686664
- `docs/research-kinetics-recharts.md` — Icon Morph Swap was Conditional; this is the product need
- `apps/web/components.json` — static icons remain `iconLibrary: lucide`
