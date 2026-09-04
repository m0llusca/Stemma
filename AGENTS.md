# Agent notes (Stemma)

- Web app: `apps/web`
- Install: `npm install` in `apps/web`
- Local Postgres: Docker Compose (`compose.yaml`) → `localhost:55432`
- Primary commands: `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run typecheck`

## UI (shadcn)

- Config: `apps/web/components.json` (Base UI, style **base-nova**, lucide)
- Theme tokens: `apps/web/src/app/globals.css` (Tailwind v4)
- Domain wrappers must compose `@/components/ui/*` — not legacy BEM / native `<dialog class="admin-dialog">`
- Base UI: `render` prop (not `asChild`). Forms with FormData: prefer `NativeSelect`. Toasts: sonner via `useToast`
- Deeper notes: `docs/memory/shadcn-ui-knowledge.md`

## Product

Stemma is an omnichannel support QA hub (Russian UI). Prefer fail-closed live integration gates and honest certification evidence.
