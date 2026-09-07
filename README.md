# Stemma

**Language:** English · [Русский](README.ru.md)

Stemma is a QA hub for support teams. Import conversations from helpdesks and data sources, score them, coach agents, and keep an audit trail of what you certified.

UI is in Russian (`КК поддержки`). Stack: Next.js, React 19, Prisma, PostgreSQL.

Repo: [github.com/m0llusca/Stemma](https://github.com/m0llusca/Stemma)

## What it does

- Reviews and scorecards (points)
- Import from Zendesk, Freshdesk, Intercom, HubSpot, Jira, Salesforce, ServiceNow, Dynamics, OTRS / Znuny / OTOBO
- Import from YDB and YTsaurus (static key, IAM token, or Yandex Cloud service account)
- Sign-in via OIDC, SAML, LDAPS; secrets via encrypted refs
- Integration cockpit: readiness checks and gated live smoke
- Admin: users, permissions, appearance, integrations
- Background jobs: `npm run jobs:run`

## Requirements

- Node.js 22+ (what CI uses; 20.19+ may work locally for YDB)
- Docker
- npm

## Quick start

```bash
git clone https://github.com/m0llusca/Stemma.git
cd Stemma

docker compose up -d postgres

cd apps/web
cp .env.example .env
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Demo users come from the seed — check the seed output for emails.

Postgres: `localhost:55432`, user/password/db `qc_app`.

## Commands (`apps/web`)

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` · `npm start` | Production |
| `npm run typecheck` | Prisma generate + TypeScript |
| `npm test` | Unit and API tests |
| `npm run test:integration` | Tests against Postgres |
| `npm run test:e2e` | Playwright |
| `npm run db:deploy` · `db:seed` | Migrations and demo data |
| `npm run jobs:run` | Drain the job queue |
| `npm run test:otrs:live` | OTRS live smoke (opt-in) |
| `npm run test:live:data-source` | YDB / YTsaurus live smoke (opt-in) |

Live smoke stays off until you set `*_LIVE_SMOKE=1` and real credentials. Details: `docs/otrs-live-smoke.md`, `apps/web/tests/live/`.

## Layout

```
Stemma/
├── apps/web/           # App, Prisma, tests
├── compose.yaml        # Local Postgres
├── docs/               # Ops notes and specs
└── .github/workflows/  # CI and protected live smoke
```

## Config

Copy `apps/web/.env.example` → `apps/web/.env`. You need at least:

- `DATABASE_URL` — Postgres connection string
- `QC_PUBLIC_ORIGIN` and `QC_PUBLIC_ORIGIN_ALLOWLIST` — public URL for auth and links

Store integration secrets as `v1:` ciphertext or `env:` refs (`apps/web/src/lib/auth/secret-refs.ts`). Do not commit `.env` or service-account keys.

## Docs

- [OTRS live smoke](docs/otrs-live-smoke.md)
- [Job scheduling](docs/jobs-scheduling.md)
- [Integration install contracts](docs/integration-install-contracts.md)
- [Operations](docs/operations/)

UI kit: shadcn/ui (Base UI, `base-nova`) — `docs/memory/shadcn-ui-knowledge.md`. Agent notes: `AGENTS.md`.

## License and security

MIT — [LICENSE](LICENSE).

Report vulnerabilities in private — [SECURITY.md](SECURITY.md).
