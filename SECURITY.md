# Security Policy

## Supported versions

Security fixes are applied on the `master` branch of this repository.

## Reporting a vulnerability

Do **not** open a public GitHub issue for security problems.

Email the maintainer via GitHub: [@m0llusca](https://github.com/m0llusca), or use GitHub Security Advisories on [m0llusca/Stemma](https://github.com/m0llusca/Stemma) if enabled.

Please include:

- Affected component / path
- Reproduction steps or proof of concept
- Impact assessment (auth bypass, secret leak, RCE, etc.)

You should receive an acknowledgement within a few days. Please give reasonable time for a fix before public disclosure.

## Production required environment

Set these before starting a production process (boot fails closed without them):

- `DATABASE_URL`
- `AUTH_SECRET` (or `NEXTAUTH_SECRET`)
- `QC_SECRET_KEY` — encrypts integration/webhook/AI secret material at rest
- `QC_PUBLIC_ORIGIN` / `QC_PUBLIC_ORIGIN_ALLOWLIST` — HTTPS public origin for auth callbacks

**Forbidden in production:**

- `QC_DEMO_AUTH=enabled` — process refuses to start
- `ALLOW_SEED=1` / running `db:seed` against production
- `QC_ALLOW_PRIVATE_BASE_URLS=1` on shared/multi-tenant SaaS
- Live-smoke credentials (`*_LIVE_SMOKE`) against production or third-party systems you do not own

`compose.yaml` is **local-only** (default `qc_app` password, localhost-bound port). Use managed Postgres with private networking and strong unique credentials in production.

Terminate TLS at a reverse proxy (or the platform) and prefer security headers (CSP/HSTS/frame denial) at the app or ingress. See `apps/web/next.config.ts` when headers are configured.

Public webhook ingest (`/api/v1/webhooks/...`) is a separate trust tier from live-certified integration imports: it requires HMAC, workspace header, and per-endpoint rate limits, but not live-cert evidence. Treat leaked webhook secrets as write access to that workspace.

## AuditLog (append-only)

`"AuditLog"` is append-only in PostgreSQL: INSERT is allowed; UPDATE and DELETE raise an exception (DB trigger). App-layer deletes cannot bypass this. Legal retention purge requires DBA export-then-break-glass (export rows, temporarily drop the forbid triggers, delete under dual control, restore triggers). See migration `20260907094600_audit_log_append_only`.

## Secrets and live environments

- Never commit `.env`, service-account JSON keys, OAuth tokens, or production URLs with credentials.
- Live smoke tests (`OTRS_LIVE_SMOKE`, `HELPDESK_LIVE_SMOKE`, `DATA_SOURCE_LIVE_SMOKE`, `IDENTITY_LIVE_SMOKE`) are opt-in and must run only against environments you own or are authorized to test.
