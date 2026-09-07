# Background jobs & scheduling

Stemma processes background work (`BackendJob`) with an **on-demand worker** — there is
no in-process cron. You drive the queue from outside; pick one of the options below for
production.

## What the worker drains

`runDueBackendJobs()` claims and runs due jobs of every type:

- `INTEGRATION_IMPORT` — includes OTRS selected import (`otrs_selected_import`). Lock TX, heartbeats, and crash/resume: [otrs-selected-import.md](otrs-selected-import.md).
- `WEBHOOK_INGEST`, `DIRECTORY_SYNC`, `RETENTION_CLEANUP`
- `REPORT_EXPORT` — on-demand and recurring (see schedules below)
- `AI_SCORE` — per-conversation AI quality scoring (provider per workspace; deterministic fallback)
- `MESSAGING_DELIVERY` — webhook notification delivery

At the start of every run it also **materializes due recurring report schedules**
(`ReportSchedule`) into `REPORT_EXPORT` jobs, so running the worker on a cadence is all
that's needed to drive scheduled exports.

## Two entry points

### 1. CLI worker (`apps/web`)

```bash
npm run jobs:run            # poll loop, default every 5s, all workspaces
npm run jobs:run -- --once  # single drain pass, then exit (ideal for cron)
# flags: --limit=N (default 10), --interval=Ms, --queue=NAME, --worker=ID
```

Requires `DATABASE_URL` in the environment (and the provider keys below for live AI
scoring). Run it as a long-lived sidecar (systemd unit / Docker service) for continuous
processing, or via `--once` on a timer.

### 2. Authenticated HTTP (`POST /api/v1/jobs/run`)

Workspace-scoped. Auth is an **admin UI session** with the `backend_jobs:manage`
permission (ADMIN role), plus same-origin CSRF checks (`Origin` / `Referer` must match
the app origin). There is **no Bearer API-token path** for this endpoint today.

Body: `{ "limit"?: 1..20, "workerId"?: string }`. Intended for interactive/admin use
from the app (or a same-origin caller that already holds a session cookie), not for
unattended platform cron with a static token.

```bash
# Example: session cookie + CSRF-safe Origin from an authenticated browser/admin context
curl -fsS -X POST https://<host>/api/v1/jobs/run \
  -H "cookie: qc_session=<session>" \
  -H "origin: https://<host>" \
  -H "content-type: application/json" \
  -d '{"limit":20}'
```

For unattended production drains, prefer the **CLI worker** below. A future machine-auth
option (e.g. signed cron secret or scoped API token) may be added later; until then do
not rely on Bearer tokens for `/jobs/run`.

## Cron examples

System crontab (every 2 minutes, CLI `--once`) — preferred for production:

```cron
*/2 * * * *  cd /srv/qc_app/apps/web && DATABASE_URL=... /usr/bin/npm run jobs:run -- --once >> /var/log/qc-jobs.log 2>&1
```

A 1–5 minute CLI cadence keeps AI scoring, notification delivery, and scheduled exports
responsive. The HTTP endpoint is per-workspace (session user’s workspace); the CLI loop
covers all workspaces in one process.

> **Note:** Hitting `/api/v1/jobs/run` from Vercel Cron (or similar) will **not** work
> without a browser session + CSRF-compliant Origin. Use `npm run jobs:run -- --once`
> instead until machine auth exists.

## AI scoring provider keys

Per-workspace engine and API keys are managed on `/admin/ai-scoring`. Keys entered
there are **encrypted at rest** in the DB (`AiProviderCredential`, AES-256-GCM via
`QC_SECRET_KEY`) and take effect immediately — no `.env` edit or restart. The
environment variables below remain a fallback when no DB key is set (and are how the
CLI jobs worker authenticates if you don't store keys per workspace). When the chosen
provider has no key from either source, scoring uses the deterministic fallback.

- YandexGPT: `YANDEX_GPT_API_KEY` + `YANDEX_GPT_CATALOG_ID` (+ `YANDEX_GPT_MODEL`)
- Claude (Anthropic): `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`, default `claude-opus-4-8`)
- ChatGPT (OpenAI): `OPENAI_API_KEY` (+ `OPENAI_MODEL` default `gpt-4o`, + `OPENAI_ORG_ID`)

`QC_SECRET_KEY` must be set (and stable) in every process that reads or writes these
keys — the web app and the jobs worker — or stored keys can't be decrypted.
