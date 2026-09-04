# Prisma 6 → 7/8 upgrade blocker (2026-09-04)

## Decision

**Stay on Prisma `6.19.3` for now.** Do not ship Prisma 7/8 in this improvement pass.

## Evidence

| Check | Result |
|-------|--------|
| Locked versions | `@prisma/client` / `prisma` = `6.19.3` |
| Latest stable ORM line | Prisma **7.10.0** (npm registry reachable 2026-09-04) |
| Prisma 8 | Only pre-release (`8.0.0-rc.12` / `8.1.0-dev.*`) — not acceptable for production |
| App stack | Next.js 16 App Router, dense compound FKs (identity/group maps), custom `lib/db.ts` client |

## Why not upgrade in this pass

Prisma 7 is a **breaking** major:

1. **Driver adapters required** for PostgreSQL (`@prisma/adapter-pg` + `pg`) — client construction changes (`new PrismaClient({ adapter })`).
2. **`prisma.config.ts`** becomes the datasource URL home; CLI migrate flags change (`--from-config-datasource`).
3. Engine / generate defaults change; Next.js hot-reload singleton must be re-validated.
4. This repo has **36 migrations** and identity/SCIM/LDAPS models — migrate dry-run + full unit/integration/e2e must pass on an isolated branch before merge.

An in-tree upgrade during the audit hardening pass would dominate the sprint and risk false “green” without e2e browsers (Playwright CDN install currently `ECONNREFUSED`).

## Maximal safe prep landed elsewhere

- Unit/integration suites stay green on 6.19.3.
- Postgres 16 via Compose remains the supported local DB.
- No schema changes in this pass depend on Prisma 7 APIs.

## Next upgrade runbook (when scheduled)

1. Branch only: `chore/prisma-7`.
2. `npm i prisma@7.10.0 @prisma/client@7.10.0 @prisma/adapter-pg pg` (+ `@types/pg`).
3. Add `prisma.config.ts`; move datasource URL out of `schema.prisma` per Prisma 7 docs.
4. Rewrite `src/lib/db.ts` singleton to use `PrismaPg` adapter.
5. `prisma generate` → `migrate diff` / deploy against verify DB → `npm run typecheck` → full `npm run test` → `test:integration` → e2e.
6. Abort and revert if any gate fails within one day.

## Related

Official upgrade notes: Prisma ORM 7 PostgreSQL / Next.js guides (driver adapter + `prisma.config.ts`).
