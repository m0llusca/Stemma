# Agent notes (Stemma)

- Web app: `apps/web`
- Install: `npm install` in `apps/web`
- Local Postgres: Docker Compose (`compose.yaml`) → `localhost:55432`
- Primary commands: `npm run dev`, `npm run test`, `npm run test:e2e`, `npm run typecheck`
- Playwright verify DB (demo-seed freshness, fail-closed bypass): `docs/e2e-verify-database.md`

## Graphify

Local tool. Optional. Not in git.

- You may query or update a local graph of `apps/web/src`.
- Never commit `graphify-out/`, `GRAPH_REPORT.md`, or generated graphify docs. Git ignores them.
- If the CLI writes under `apps/web/src/graphify-out/`, leave that dump on disk. Do not copy it into the repo.

## UI (shadcn)

- Config: `apps/web/components.json` (Base UI, style **base-nova**, lucide)
- Theme tokens: `apps/web/src/app/globals.css` (Tailwind v4)
- Domain wrappers must compose `@/components/ui/*` — not legacy BEM / native `<dialog class="admin-dialog">`
- Base UI: `render` prop (not `asChild`). Forms with FormData: prefer `NativeSelect`. Toasts: sonner via `useToast`
- Deeper notes: `docs/memory/shadcn-ui-knowledge.md`

## Product

Stemma is an omnichannel support QA hub (Russian UI). Prefer fail-closed live integration gates and honest certification evidence.
