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

Workspace-scoped. Auth is either:

1. **Admin UI session** with `backend_jobs:manage` (ADMIN), plus same-origin CSRF
   (`Origin` / `Referer` must match the app origin), or
2. **API token** with scope `jobs:write` (`Authorization: Bearer …` or `x-api-key`).

Claiming uses Postgres `FOR UPDATE SKIP LOCKED`, so multiple workers can drain safely.

Body: `{ "limit"?: 1..20, "workerId"?: string }`.

```bash
# Session (interactive / admin UI)
curl -fsS -X POST https://<host>/api/v1/jobs/run \
  -H "cookie: qc_session=<session>" \
  -H "origin: https://<host>" \
  -H "content-type: application/json" \
  -d '{"limit":20}'

# Machine auth (cron / sidecar)
curl -fsS -X POST https://<host>/api/v1/jobs/run \
  -H "authorization: Bearer <api-token-with-jobs:write>" \
  -H "content-type: application/json" \
  -d '{"limit":20,"workerId":"cron-1"}'
```

For multi-workspace unattended drains, the **CLI worker** still covers all workspaces
in one process. The HTTP endpoint always scopes to the session/token workspace.

## Queue age SLO

`/admin/system` shows **Возраст очереди** — age of the oldest `QUEUED` job.
Alert when ≥ 15 min (`QUEUE_OLDEST_AGE_ALERT_MS` in `queue-health.ts`). Soft SLO:
check the worker and the `jobs:write` cron.

## Webhook ingress

Rate limit persists in Prisma `IngressRateLimit` (workspace + `routeKey` + window).
Shared across workers — not a process-local Map.

## Cron examples

System crontab (every 2 minutes, CLI `--once`) — preferred for multi-workspace:

```cron
*/2 * * * *  cd /srv/qc_app/apps/web && DATABASE_URL=... /usr/bin/npm run jobs:run -- --once >> /var/log/qc-jobs.log 2>&1
```

Or HTTP with a `jobs:write` token on a 1–5 minute cadence for a single workspace.

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
