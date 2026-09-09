# Morphicons: adopted spike (#117)

**Verdict: implement.** Isolated PR. Supersedes the #108 reject note.

Roman (2026-09-09): implement, not defer. Parent epic: #116.
Marques UX-ACCEPT: thin spike — CopyButton + accordion/score-module chevron. Account-menu chevron is optional third.

## Provenance

| Item | Value |
| --- | --- |
| Package | `morphicons@1.7.1` |
| License | MIT ([upstream LICENSE](https://github.com/guillermolg00/morphicons/blob/main/LICENSE), © 2026 Guillermo) |
| Repo | https://github.com/guillermolg00/morphicons |
| Site | https://www.morphicons.com/ |
| Icon data | `lucide@0.468.0` (ISC) — same generation as `lucide-react@0.468.0` |

Kinetics itself has no LICENSE ([audit](memory/2026-07-28-kinetics-evilcharts-provenance-audit.md)); we still do not copy Kinetics React demos. Morphicons is a separate MIT npm package, so the Kinetics license bar is met.

`lucide@0.x` ships a tree `["svg", attrs, children]`. `asMorphIcon` unwraps that to the flat `IconNode` Morphicons consumes. Do not import `lucide-react` components into `MorphIcon`.

## Surfaces (this spike)

| Surface | Morph | Notes |
| --- | --- | --- |
| CopyButton | Copy ↔ Check | Required ACCEPT |
| Accordion trigger | ChevronDown ↔ ChevronUp | Required ACCEPT; replaces CSS rotate |
| Review / scorecard score modules | ChevronDown ↔ ChevronUp | Same accordion pair on Collapsible score modules |
| Account / role menu | ChevronDown ↔ ChevronUp | Optional 3rd (wired; not required for ACCEPT) |

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
- `apps/web/src/lib/ui/lucide-morph.ts` — Lucide 0.x unwrap

## Related

- Issues #117, #116 (reopen of #108)
- Marques UX-ACCEPT: https://github.com/m0llusca/Stemma/issues/117#issuecomment-5597686664
- `docs/research-kinetics-recharts.md` — Icon Morph Swap was Conditional; this is the product need
- `apps/web/components.json` — static icons remain `iconLibrary: lucide`
