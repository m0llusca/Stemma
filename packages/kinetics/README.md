# `@stemma/kinetics`

First-party Kinetics spring catalog for Stemma.

[Colorion Kinetics](https://kinetics.colorion.co/#library) is a **gallery** (CSS + React copy-paste). It is **not** published to npm (`ckissi/kinetics` is `private: true`). The registry name `kinetics` is an unrelated accelerometer package — do not install it.

This package owns:

- published spring **duration / cubic-bezier** tokens (`tokens.css`)
- JS mirrors + transition helpers (`index.ts`)
- optional `usePrefersReducedMotion` (`react`)

It does **not** vendor Colorion React demos (magnetic cursor, liquid glass, trails, etc.).

## Install (workspace)

```json
"@stemma/kinetics": "file:../../packages/kinetics"
```

```css
@import "@stemma/kinetics/tokens.css";
```

```ts
import { kineticsTransition, kineticsSurfaces } from "@stemma/kinetics";
```
