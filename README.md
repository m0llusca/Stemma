# Stemma

**Omnichannel QA Hub** for support quality control — reviews, scorecards, integrations, coaching signals, and certification evidence.

Product UI is Russian (`КК поддержки`). Stack: Next.js App Router, React 19, Prisma / PostgreSQL, Vitest, Playwright, shadcn/ui.

Repository: [github.com/m0llusca/Stemma](https://github.com/m0llusca/Stemma)

## Features

- Quality reviews and scorecards (points-based scoring)
- Helpdesk / CRM import adapters (Zendesk, Freshdesk, Intercom, HubSpot, Jira, Salesforce, ServiceNow, Dynamics, OTRS/Znuny/OTOBO)
- Data-source import (YDB with static / IAM token / Yandex Cloud service-account keys, YTsaurus)
- Enterprise identity hooks (OIDC, SAML, LDAPS) and secret references
- Integration cockpit with certification readiness and gated live smoke
- Admin: users, permissions, appearance, integrations
- Background jobs worker (`npm run jobs:run`)

## Requirements

- Node.js **22+** (CI uses 22; local 20.19+ may work for YDB SDK)
- Docker (PostgreSQL via Compose)
- npm

## Quick start

```bash
git clone https://github.com/m0llusca/Stemma.git
cd Stemma

# Database
docker compose up -d postgres

# App
cd apps/web
cp .env.example .env
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Default local auth comes from the demo seed (see seed output / docs).

PostgreSQL listens on **localhost:55432** (`qc_app` / `qc_app` / database `qc_app`).

## Scripts (`apps/web`)

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build |
| `npm run typecheck` | Prisma generate + TypeScript |
| `npm test` | Unit / API Vitest |
| `npm run test:integration` | DB-backed integration tests |
| `npm run test:e2e` | Playwright |
| `npm run db:deploy` / `db:seed` | Migrate + demo seed |
| `npm run jobs:run` | Process background jobs |
| `npm run test:otrs:live` | Gated OTRS live smoke |
| `npm run test:live:data-source` | Gated YDB / YTsaurus live smoke |

Live suites stay **fail-closed**: they require explicit `*_LIVE_SMOKE=1` and credentials. See `docs/otrs-live-smoke.md` and `apps/web/tests/live/`.

## Project layout

```
Stemma/
├── apps/web/          # Next.js app, Prisma, tests
├── compose.yaml       # Local PostgreSQL
├── docs/              # Operations notes, plans, specs
└── .github/workflows/ # CI + protected live smoke workflows
```

## Configuration

Copy `apps/web/.env.example` → `apps/web/.env`. Minimum:

- `DATABASE_URL` — Prisma connection string
- `QC_PUBLIC_ORIGIN` / `QC_PUBLIC_ORIGIN_ALLOWLIST` — public origin for auth / links

Secrets for integrations should use encrypted `v1:` payloads or `env:` references (see `apps/web/src/lib/auth/secret-refs.ts`). Do not commit `.env` or service-account keys.

## Documentation

- [OTRS live smoke](docs/otrs-live-smoke.md)
- [Jobs scheduling](docs/jobs-scheduling.md)
- [Integration install contracts](docs/integration-install-contracts.md)
- [Operations](docs/operations/)
- Design / implementation plans under `docs/superpowers/`

## Development notes

- UI system: **shadcn/ui** (Base UI, `base-nova`) — see `docs/memory/shadcn-ui-knowledge.md`
- Agent guidance for this repo: `AGENTS.md`
- Graphify / Lazyweb / personal research dumps stay gitignored

## License

MIT — see [LICENSE](LICENSE).

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
