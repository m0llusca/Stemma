# Morphicons: adopted (#117)

**Verdict: implement.** Isolated PR — not the #111 mega-PR reject.

Roman (2026-09-09) reversed the #108 documented reject: Morphicons must be wired, not deferred. Parent epic: #116.

## Provenance

| Item | Value |
| --- | --- |
| Package | `morphicons@1.7.1` |
| License | MIT ([upstream LICENSE](https://github.com/guillermolg00/morphicons/blob/main/LICENSE), © 2026 Guillermo) |
| Repo | https://github.com/guillermolg00/morphicons |
| Site | https://www.morphicons.com/ |
| Icon data | `lucide@0.468.0` (ISC) — same IconNode generation as `lucide-react@0.468.0` |

Kinetics itself has no LICENSE ([audit](memory/2026-07-28-kinetics-evilcharts-provenance-audit.md)); we still do not copy Kinetics React demos. Morphicons is a separate MIT npm package with a published license, so the Kinetics bar is met.

`lucide@0.x` ships a tree `["svg", attrs, children]`. `asMorphIcon` unwraps that to the flat `IconNode` Morphicons consumes. Do not import `lucide-react` components into `MorphIcon`.

## Surfaces (wired)

| Surface | Morph | Why |
| --- | --- | --- |
| Account / role menu | ChevronDown ↔ ChevronUp | #117: account/menu |
| Accordion trigger | ChevronDown ↔ ChevronUp | #117: accordion/chevron (replaces CSS rotate) |
| Nav compact trigger | Menu ↔ X; active-area icon on md | nav chrome, not every link |
| CopyButton | Copy ↔ Check | Kinetics Copy Button / Success Check |
| Ticket / assessment disclosures | ChevronDown ↔ ChevronUp | review modules, workflow, conversation, scorecards |

## Out of scope (no morph spam)

- Queue chrome (`QueueNextCasePreview`, saved-view chevrons)
- Chart chrome (#119)
- Select / combobox / calendar / native-select chevrons
- Blanket replace of `lucide-react`

Status pills stay on Kinetics CSS (`--motion-duration-morph` on `Badge` / `Chip` / `StatusBadge`). That is color/width morph, not an icon pair.

## Reduced motion

Product wrapper always passes `reducedMotion="user"`. Morphicons then instant-swaps while `prefers-reduced-motion: reduce` is on. Spring preset is `snappy` (subtle overshoot, same slot as `--motion-duration-morph` 350ms).

## Helper

- `apps/web/src/components/ui/morph-icon.tsx` — `MorphIcon`
- `apps/web/src/components/ui/disclosure-morph-chevron.tsx` — disclosure pair
- `apps/web/src/lib/ui/lucide-morph.ts` — Lucide 0.x unwrap

## Related

- Issues #117, #116 (reopen of #108)
- `docs/research-kinetics-recharts.md` — Icon Morph Swap was Conditional; this is the product need
- `apps/web/components.json` — static icons remain `iconLibrary: lucide`
