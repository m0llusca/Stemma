# OTRS Live Smoke Harness

The live smoke harness is a manual, fail-closed check for an OTRS CE 6 GenericInterface WebService. It never runs unless `OTRS_LIVE_SMOKE=1` is present, and it defaults to read-only preview mode.

## Required OTRS WebService Operations

Configure an OTRS GenericInterface REST WebService with these operations:

- `TicketSearch`: used to find one candidate ticket when `OTRS_TEST_TICKET_ID` is not supplied.
- `TicketGet`: used to fetch the manual ticket or the first search result with article data.

The default WebService name is `GenericTicketConnectorREST`. The app expects the OTRS CE 6 REST shape `/nph-genericinterface.pl/Webservice/<WebServiceName>`, with `POST /Ticket` for `TicketSearch` and `GET /Ticket/{TicketID}` for `TicketGet`.

## OTRS User

Use a dedicated least-privilege OTRS user such as `qc_api`. Grant only the queues and ticket read permissions needed for smoke coverage. Do not reuse an admin account. Only enable selected import in a protected environment after confirming the target workspace.

## Internal CA Bundle

If OTRS uses a private or internal CA, write the PEM bundle to a local file and pass its path:

```bash
OTRS_CA_BUNDLE_PATH=/path/to/internal-ca.pem
```

The harness reads the PEM and passes it to Node TLS. It prints only path, byte count, and a redacted SHA-256 metadata field; it never prints PEM contents.

## Diagnostics-Only Smoke

This command runs diagnostics plus a read-only preview. If `OTRS_TEST_TICKET_ID` is set, it fetches that ticket directly; otherwise it searches by queue and state type and fetches the first result.

```bash
cd apps/web
OTRS_LIVE_SMOKE=1 \
OTRS_BASE_URL=https://support.example.com/otrs \
OTRS_WEBSERVICE_NAME=GenericTicketConnectorREST \
OTRS_USER_LOGIN=qc_api \
OTRS_PASSWORD=change-me-in-protected-secret-store \
OTRS_CA_BUNDLE_PATH=/path/to/internal-ca.pem \
OTRS_TEST_TICKET_ID=42 \
OTRS_LIVE_IMPORT=0 \
npm run test:otrs:live
```

Search-based smoke:

```bash
cd apps/web
OTRS_LIVE_SMOKE=1 \
OTRS_BASE_URL=https://support.example.com/otrs \
OTRS_WEBSERVICE_NAME=GenericTicketConnectorREST \
OTRS_USER_LOGIN=qc_api \
OTRS_PASSWORD=change-me-in-protected-secret-store \
OTRS_SEARCH_QUEUE=Raw \
OTRS_SEARCH_STATE_TYPE=open \
OTRS_LIVE_IMPORT=0 \
npm run test:otrs:live
```

## Selected Import Smoke

Selected import is opt-in and persists the normalized preview into the configured workspace. It requires `OTRS_LIVE_IMPORT=1`, `DATABASE_URL`, and `OTRS_LIVE_WORKSPACE_ID`.

```bash
cd apps/web
OTRS_LIVE_SMOKE=1 \
OTRS_BASE_URL=https://support.example.com/otrs \
OTRS_WEBSERVICE_NAME=GenericTicketConnectorREST \
OTRS_USER_LOGIN=qc_api \
OTRS_PASSWORD=change-me-in-protected-secret-store \
OTRS_CA_BUNDLE_PATH=/path/to/internal-ca.pem \
OTRS_TEST_TICKET_ID=42 \
OTRS_LIVE_IMPORT=1 \
DATABASE_URL=postgresql://user:password@localhost:55432/qc_app \
OTRS_LIVE_WORKSPACE_ID=workspace-id \
npm run test:otrs:live
```

## CI Safety

CI must run this workflow only with protected secrets and a protected environment. Do not add `push`, `pull_request`, `schedule`, or cron triggers. Store the OTRS password, base URL, optional CA PEM, database URL, and import workspace ID in protected GitHub environment secrets or equivalent secret storage.
