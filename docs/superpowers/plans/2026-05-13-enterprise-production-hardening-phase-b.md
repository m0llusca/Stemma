# Enterprise Production Hardening Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current native helpdesk/CRM preview support into contract-certified adapter boundaries for Zendesk, Freshdesk, Intercom, HubSpot, Salesforce, ServiceNow, and Dynamics without making unverified live-production claims.

**Architecture:** Keep Phase A's certification registry and existing normalized conversation import model. Add a shared adapter boundary, official-docs evidence metadata, source-specific request builders, local stub coverage, diagnostics, and runner wiring. Each adapter must move through docs, contract, stub, and optional live gates independently.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, Vitest, Playwright, local Node HTTP stubs, Context7/vendor official docs, existing `customConversationSchema`, `IntegrationRun`, `IntegrationRunItem`, and `integrationCapabilities`.

---

## Scope

Phase B implements helpdesk and CRM adapters only.

In scope:

- Zendesk, Freshdesk, Intercom, HubSpot, Salesforce, ServiceNow, and Dynamics adapter contracts.
- Official-docs evidence records for every Phase B source.
- Source-specific request builders and response normalizers into `CustomConversationInput`.
- Local stub servers and fixtures for success, pagination, auth failure, malformed JSON, malformed payload, and redacted diagnostics.
- Integration runner wiring for preview/import through the shared adapter boundary.
- API/OpenAPI/catalog readiness fields that distinguish docs, contract, stub, and live certification.
- Admin UI readiness copy for adapter capabilities, limitations, and live-cert prerequisites.

Out of scope:

- Live certification without real protected tenants and credentials.
- Enterprise identity providers; those belong to Phase C.
- Windows GPO integration. Authorization policy remains app roles, directory groups, provisioning groups, and mappings.
- Replacing OTRS-family internals unless a shared boundary needs a non-breaking adapter wrapper.

## Official Documentation Grounding

Before implementation, workers must re-fetch current official documentation. Use Context7 first where available. If Context7 lacks useful coverage, use the vendor's official docs directly.

Context7 precheck from 2026-05-13:

- Zendesk: `/websites/developer_zendesk_api-reference`
  - Verify `GET /api/v2/tickets/{ticket_id}.json`, `GET /api/v2/tickets/{ticket_id}/comments`, pagination, Basic auth with API token, comment `public`, attachments, and webhook/event options.
- Freshdesk: `/websites/developers_freshdesk_api`
  - Verify `GET /api/v2/tickets/{id}?include=conversations`, `GET /api/v2/tickets/{id}/conversations`, API-key Basic auth, `private`, `incoming`, attachments, and webhook/event options.
- HubSpot: `/websites/developers_hubspot_api_crm`
  - Verify ticket object reads, ticket pipelines/stages, associations/activities strategy, OAuth/private-app scopes, pagination, and webhook support.

Docs still requiring first-party recheck at implementation time:

- Intercom: conversations, conversation parts/source, API version header, auth scopes, pagination, and webhooks.
- Salesforce Service Cloud: Case, CaseComment/FeedItem/activity strategy, REST API versioning, OAuth scopes, pagination, and platform events/webhooks.
- ServiceNow CSM: case table/API names, journal/comments strategy, OAuth/basic auth, sysparm pagination, attachments, and webhooks/business rules.
- Dynamics 365 Customer Service: Dataverse incident, annotations/activitypointer/email strategy, OAuth scopes, OData paging, and webhooks/change tracking.

---

## File Structure

Create:

- `apps/web/src/lib/integrations/helpdesk-adapters/types.ts`
  - Shared adapter interfaces, request/diagnostic/result types, and certification evidence types.
- `apps/web/src/lib/integrations/helpdesk-adapters/errors.ts`
  - Source-neutral connector errors and safe diagnostic serialization.
- `apps/web/src/lib/integrations/helpdesk-adapters/http.ts`
  - Shared fetch transport with timeout, max response bytes, auth header helpers, JSON parsing, and redaction hooks.
- `apps/web/src/lib/integrations/helpdesk-adapters/source-contracts.ts`
  - Official-docs evidence table, endpoint matrix, required secrets, operations, and live-cert prerequisites.
- `apps/web/src/lib/integrations/helpdesk-adapters/zendesk.ts`
- `apps/web/src/lib/integrations/helpdesk-adapters/freshdesk.ts`
- `apps/web/src/lib/integrations/helpdesk-adapters/intercom.ts`
- `apps/web/src/lib/integrations/helpdesk-adapters/hubspot.ts`
- `apps/web/src/lib/integrations/helpdesk-adapters/salesforce.ts`
- `apps/web/src/lib/integrations/helpdesk-adapters/servicenow.ts`
- `apps/web/src/lib/integrations/helpdesk-adapters/dynamics.ts`
  - Source-specific request builders and payload loaders.
- `apps/web/src/lib/integrations/helpdesk-adapters/index.ts`
  - Registry lookup and adapter factory.
- `apps/web/src/lib/integrations/helpdesk-adapters/service.ts`
  - Integration row + credentials to adapter execution boundary.
- `apps/web/tests/fixtures/helpdesk-adapter-server.ts`
  - Local stub server covering all Phase B sources.
- `apps/web/tests/fixtures/helpdesk-adapter-fixtures.ts`
  - Typed sample payloads per source.
- `apps/web/tests/unit/helpdesk-adapter-contracts.test.ts`
- `apps/web/tests/unit/helpdesk-adapter-http.test.ts`
- `apps/web/tests/unit/helpdesk-adapter-service.test.ts`
- `apps/web/tests/e2e/helpdesk-adapter-readiness.spec.ts`

Modify:

- `apps/web/src/lib/normalizers/native-helpdesk.ts`
  - Keep existing normalization entrypoint; extend fixture shape support only where source docs require it.
- `apps/web/src/lib/integrations/capabilities.ts`
  - Derive Phase B registry metadata from `source-contracts.ts`.
- `apps/web/src/lib/integrations/runner.ts`
  - Replace inline native-helpdesk fetching with adapter service calls.
- `apps/web/src/lib/integration-import-service.ts`
  - Ensure queue metadata is compatible with adapter diagnostics and cursor payloads.
- `apps/web/src/lib/api/openapi.ts`
  - Document adapter certification evidence and diagnostics response contracts.
- `apps/web/src/app/admin/integrations/page.tsx`
- `apps/web/src/app/admin/integrations/[integrationId]/page.tsx`
- `apps/web/src/components/integrations/integration-setup-workspace.tsx`
  - Surface adapter docs, limitations, diagnostics, and live-cert requirements without overclaiming readiness.
- Existing tests:
  - `apps/web/tests/unit/native-helpdesk-normalizer.test.ts`
  - `apps/web/tests/unit/integration-capabilities.test.ts`
  - `apps/web/tests/unit/integration-runner-ledger.test.ts`
  - `apps/web/tests/unit/openapi.test.ts`
  - `apps/web/tests/e2e/otrs-integration-cockpit.spec.ts`

---

### Task 1: Create Phase B Docs Evidence Contract

**Files:**

- Create: `apps/web/src/lib/integrations/helpdesk-adapters/types.ts`
- Create: `apps/web/src/lib/integrations/helpdesk-adapters/source-contracts.ts`
- Test: `apps/web/tests/unit/helpdesk-adapter-contracts.test.ts`

- [ ] **Step 1: Re-fetch current official docs**

Use Context7 or official vendor docs before writing code.

Minimum docs lookup targets:

```text
Zendesk Support API tickets comments auth pagination attachments webhooks
Freshdesk API tickets conversations auth pagination private notes attachments webhooks
Intercom conversations API conversation parts auth pagination webhooks
HubSpot CRM tickets associations activities scopes pagination webhooks
Salesforce Service Cloud Case REST API comments feed items OAuth pagination platform events
ServiceNow CSM case REST API comments journal fields OAuth pagination webhooks
Dynamics 365 Customer Service Dataverse incident annotations activities OAuth OData paging webhooks
```

Expected: Every source has a first-party URL or Context7 library ID recorded before status can be `docs_checked`.

- [ ] **Step 2: Write the failing contract test**

Create `apps/web/tests/unit/helpdesk-adapter-contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { phaseBHelpdeskSources, phaseBSourceContracts } from "@/lib/integrations/helpdesk-adapters/source-contracts";

describe("Phase B helpdesk adapter source contracts", () => {
  it("defines docs, operations, secrets, and live-cert prerequisites for every Phase B source", () => {
    expect(phaseBHelpdeskSources).toEqual([
      "zendesk",
      "freshdesk",
      "intercom",
      "hubspot",
      "salesforce",
      "servicenow",
      "dynamics"
    ]);

    for (const source of phaseBHelpdeskSources) {
      const contract = phaseBSourceContracts[source];

      expect(contract.source).toBe(source);
      expect(contract.displayName).toEqual(expect.any(String));
      expect(contract.officialDocs.length).toBeGreaterThan(0);
      expect(contract.officialDocs.every((doc) => doc.href.startsWith("https://") || doc.context7Id?.startsWith("/"))).toBe(true);
      expect(contract.operations.length).toBeGreaterThan(0);
      expect(contract.requiredSecrets.length).toBeGreaterThan(0);
      expect(contract.liveCertification.requiredEnvironment.length).toBeGreaterThan(0);
      expect(contract.certification.gates.live).toBe("waiting_for_access");
      expect(contract.certification.summary.productionReady).toBe(false);
    }
  });

  it("keeps enterprise CRM sources out of live-certified status until real tenants are tested", () => {
    expect(phaseBSourceContracts.salesforce.certification.summary.status).not.toBe("live_certified");
    expect(phaseBSourceContracts.servicenow.certification.summary.status).not.toBe("live_certified");
    expect(phaseBSourceContracts.dynamics.certification.summary.status).not.toBe("live_certified");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-contracts.test.ts
```

Expected: FAIL because `source-contracts.ts` does not exist.

- [ ] **Step 4: Add shared types**

Create `apps/web/src/lib/integrations/helpdesk-adapters/types.ts`:

```ts
import type { CertificationGateSummary, CertificationSummary } from "@/lib/certification/status";
import type { CustomConversationInput } from "@/lib/validation/custom-api";

export type PhaseBHelpdeskSource =
  | "zendesk"
  | "freshdesk"
  | "intercom"
  | "hubspot"
  | "salesforce"
  | "servicenow"
  | "dynamics";

export type HelpdeskAdapterOperation =
  | "ticket_get"
  | "ticket_search"
  | "comments_get"
  | "conversations_get"
  | "activities_get"
  | "case_get"
  | "webhook_ingest"
  | "diagnostics"
  | "fixture_import";

export type HelpdeskOfficialDoc = {
  label: string;
  href: string;
  context7Id?: string;
  checkedAt: string;
  notes: string[];
};

export type HelpdeskLiveCertificationRequirement = {
  requiredEnvironment: string[];
  smokeTestCommand: string;
  neverRunByDefault: true;
};

export type HelpdeskSourceContract = {
  source: PhaseBHelpdeskSource;
  displayName: string;
  type: "native_helpdesk" | "enterprise";
  authModes: string[];
  operations: HelpdeskAdapterOperation[];
  supportedEvents: string[];
  requiredSecrets: string[];
  docsHref: string;
  payloadLimits: {
    batchSize: number;
    importLimit: number;
  };
  officialDocs: HelpdeskOfficialDoc[];
  liveCertification: HelpdeskLiveCertificationRequirement;
  certification: {
    gates: CertificationGateSummary;
    summary: CertificationSummary;
    limitations: string[];
  };
};

export type HelpdeskAdapterLoadInput = {
  source: PhaseBHelpdeskSource;
  baseUrl: string;
  externalId: string;
  token?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type HelpdeskAdapterLoadResult = {
  source: PhaseBHelpdeskSource;
  externalId: string;
  payload: unknown;
  conversations: CustomConversationInput[];
  diagnostics: {
    requests: Array<{
      operation: HelpdeskAdapterOperation;
      method: "GET" | "POST";
      url: string;
      statusCode: number;
    }>;
  };
};
```

- [ ] **Step 5: Add source contract registry**

Create `apps/web/src/lib/integrations/helpdesk-adapters/source-contracts.ts`:

```ts
import { summarizeCertification } from "@/lib/certification/status";
import type { HelpdeskSourceContract, PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";

export const phaseBHelpdeskSources = [
  "zendesk",
  "freshdesk",
  "intercom",
  "hubspot",
  "salesforce",
  "servicenow",
  "dynamics"
] as const satisfies readonly PhaseBHelpdeskSource[];

const adapterReadyGates = {
  docs: "docs_checked",
  contract: "contract_certified",
  stub: "stub_certified",
  live: "waiting_for_access"
} as const;

const defaultPayloadLimits = {
  batchSize: 25,
  importLimit: 100
};

function contract(input: Omit<HelpdeskSourceContract, "certification" | "payloadLimits"> & {
  limitations: string[];
  payloadLimits?: HelpdeskSourceContract["payloadLimits"];
}): HelpdeskSourceContract {
  return {
    ...input,
    payloadLimits: input.payloadLimits ?? defaultPayloadLimits,
    certification: {
      gates: adapterReadyGates,
      summary: summarizeCertification(adapterReadyGates),
      limitations: input.limitations
    }
  };
}

export const phaseBSourceContracts = {
  zendesk: contract({
    source: "zendesk",
    displayName: "Zendesk",
    type: "native_helpdesk",
    authModes: ["api_token", "bearer_token"],
    operations: ["ticket_get", "comments_get", "webhook_ingest", "diagnostics", "fixture_import"],
    supportedEvents: ["conversation.upsert"],
    requiredSecrets: ["auth_password"],
    docsHref: "https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/",
    officialDocs: [
      {
        label: "Zendesk Ticketing API",
        href: "https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/",
        context7Id: "/websites/developer_zendesk_api-reference",
        checkedAt: "2026-05-13",
        notes: ["Verify tickets, comments, attachments, pagination, and auth before implementation."]
      }
    ],
    liveCertification: {
      requiredEnvironment: ["ZENDESK_BASE_URL", "ZENDESK_API_TOKEN", "ZENDESK_TEST_TICKET_ID"],
      smokeTestCommand: "npm run test -- tests/live/zendesk-smoke.test.ts",
      neverRunByDefault: true
    },
    limitations: ["Живая сертификация требует Zendesk sandbox и защищенный API token."]
  }),
  freshdesk: contract({
    source: "freshdesk",
    displayName: "Freshdesk",
    type: "native_helpdesk",
    authModes: ["api_token"],
    operations: ["ticket_get", "conversations_get", "webhook_ingest", "diagnostics", "fixture_import"],
    supportedEvents: ["conversation.upsert"],
    requiredSecrets: ["auth_password"],
    docsHref: "https://developers.freshdesk.com/api/",
    officialDocs: [
      {
        label: "Freshdesk API",
        href: "https://developers.freshdesk.com/api/",
        context7Id: "/websites/developers_freshdesk_api",
        checkedAt: "2026-05-13",
        notes: ["Verify ticket conversations, private notes, attachments, pagination, and auth before implementation."]
      }
    ],
    liveCertification: {
      requiredEnvironment: ["FRESHDESK_BASE_URL", "FRESHDESK_API_TOKEN", "FRESHDESK_TEST_TICKET_ID"],
      smokeTestCommand: "npm run test -- tests/live/freshdesk-smoke.test.ts",
      neverRunByDefault: true
    },
    limitations: ["Живая сертификация требует Freshdesk sandbox и защищенный API token."]
  }),
  intercom: contract({
    source: "intercom",
    displayName: "Intercom",
    type: "native_helpdesk",
    authModes: ["bearer_token"],
    operations: ["conversations_get", "webhook_ingest", "diagnostics", "fixture_import"],
    supportedEvents: ["conversation.upsert"],
    requiredSecrets: ["auth_password"],
    docsHref: "https://developers.intercom.com/docs/references/rest-api/api.intercom.io/conversations/retrieveaconversation/",
    officialDocs: [
      {
        label: "Intercom Conversations API",
        href: "https://developers.intercom.com/docs/references/rest-api/api.intercom.io/conversations/retrieveaconversation/",
        checkedAt: "2026-05-13",
        notes: ["Recheck API version header, conversation parts, contacts, pagination, and webhooks before implementation."]
      }
    ],
    liveCertification: {
      requiredEnvironment: ["INTERCOM_BASE_URL", "INTERCOM_ACCESS_TOKEN", "INTERCOM_TEST_CONVERSATION_ID"],
      smokeTestCommand: "npm run test -- tests/live/intercom-smoke.test.ts",
      neverRunByDefault: true
    },
    limitations: ["Живая сертификация требует Intercom workspace и защищенный access token."]
  }),
  hubspot: contract({
    source: "hubspot",
    displayName: "HubSpot Service Hub",
    type: "native_helpdesk",
    authModes: ["bearer_token"],
    operations: ["ticket_get", "activities_get", "webhook_ingest", "diagnostics", "fixture_import"],
    supportedEvents: ["conversation.upsert"],
    requiredSecrets: ["auth_password"],
    docsHref: "https://developers.hubspot.com/docs/api/crm/tickets",
    officialDocs: [
      {
        label: "HubSpot CRM Tickets API",
        href: "https://developers.hubspot.com/docs/api/crm/tickets",
        context7Id: "/websites/developers_hubspot_api_crm",
        checkedAt: "2026-05-13",
        notes: ["Verify tickets, properties, associations, activities, scopes, pagination, and webhooks before implementation."]
      }
    ],
    liveCertification: {
      requiredEnvironment: ["HUBSPOT_BASE_URL", "HUBSPOT_PRIVATE_APP_TOKEN", "HUBSPOT_TEST_TICKET_ID"],
      smokeTestCommand: "npm run test -- tests/live/hubspot-smoke.test.ts",
      neverRunByDefault: true
    },
    limitations: ["Живая сертификация требует HubSpot sandbox/private app token."]
  }),
  salesforce: contract({
    source: "salesforce",
    displayName: "Salesforce Service Cloud",
    type: "enterprise",
    authModes: ["oauth_client_credentials"],
    operations: ["case_get", "activities_get", "webhook_ingest", "diagnostics", "fixture_import"],
    supportedEvents: ["conversation.upsert"],
    requiredSecrets: ["oauth_client_credentials"],
    docsHref: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_sobject_basic_info.htm",
    officialDocs: [
      {
        label: "Salesforce REST API sObject resources",
        href: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_sobject_basic_info.htm",
        checkedAt: "2026-05-13",
        notes: ["Recheck Case, CaseComment/FeedItem/activity strategy, OAuth, pagination, and platform events before implementation."]
      }
    ],
    liveCertification: {
      requiredEnvironment: ["SALESFORCE_INSTANCE_URL", "SALESFORCE_CLIENT_ID", "SALESFORCE_CLIENT_SECRET", "SALESFORCE_TEST_CASE_ID"],
      smokeTestCommand: "npm run test -- tests/live/salesforce-smoke.test.ts",
      neverRunByDefault: true
    },
    limitations: ["Adapter будет contract/stub-certified до появления Salesforce sandbox."]
  }),
  servicenow: contract({
    source: "servicenow",
    displayName: "ServiceNow CSM",
    type: "enterprise",
    authModes: ["oauth_client_credentials", "basic"],
    operations: ["case_get", "activities_get", "webhook_ingest", "diagnostics", "fixture_import"],
    supportedEvents: ["conversation.upsert"],
    requiredSecrets: ["oauth_client_credentials"],
    docsHref: "https://developer.servicenow.com/dev.do#!/reference/api",
    officialDocs: [
      {
        label: "ServiceNow REST API",
        href: "https://developer.servicenow.com/dev.do#!/reference/api",
        checkedAt: "2026-05-13",
        notes: ["Recheck CSM case table names, journal fields, auth, sysparm pagination, attachments, and webhooks before implementation."]
      }
    ],
    liveCertification: {
      requiredEnvironment: ["SERVICENOW_INSTANCE_URL", "SERVICENOW_CLIENT_ID", "SERVICENOW_CLIENT_SECRET", "SERVICENOW_TEST_CASE_SYS_ID"],
      smokeTestCommand: "npm run test -- tests/live/servicenow-smoke.test.ts",
      neverRunByDefault: true
    },
    limitations: ["Adapter будет contract/stub-certified до появления ServiceNow sandbox."]
  }),
  dynamics: contract({
    source: "dynamics",
    displayName: "Dynamics 365 Customer Service",
    type: "enterprise",
    authModes: ["oauth_client_credentials"],
    operations: ["case_get", "activities_get", "webhook_ingest", "diagnostics", "fixture_import"],
    supportedEvents: ["conversation.upsert"],
    requiredSecrets: ["oauth_client_credentials"],
    docsHref: "https://learn.microsoft.com/power-apps/developer/data-platform/webapi/overview",
    officialDocs: [
      {
        label: "Dataverse Web API",
        href: "https://learn.microsoft.com/power-apps/developer/data-platform/webapi/overview",
        checkedAt: "2026-05-13",
        notes: ["Recheck incident, annotations/activitypointer/email strategy, OAuth scopes, OData paging, and webhooks before implementation."]
      }
    ],
    liveCertification: {
      requiredEnvironment: ["DYNAMICS_ORG_URL", "DYNAMICS_CLIENT_ID", "DYNAMICS_CLIENT_SECRET", "DYNAMICS_TEST_INCIDENT_ID"],
      smokeTestCommand: "npm run test -- tests/live/dynamics-smoke.test.ts",
      neverRunByDefault: true
    },
    limitations: ["Adapter будет contract/stub-certified до появления Dynamics sandbox."]
  })
} satisfies Record<PhaseBHelpdeskSource, HelpdeskSourceContract>;
```

- [ ] **Step 6: Run test**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/integrations/helpdesk-adapters/types.ts apps/web/src/lib/integrations/helpdesk-adapters/source-contracts.ts apps/web/tests/unit/helpdesk-adapter-contracts.test.ts
git commit -m "feat: add phase b adapter source contracts"
```

---

### Task 2: Add Shared Adapter HTTP Boundary

**Files:**

- Create: `apps/web/src/lib/integrations/helpdesk-adapters/errors.ts`
- Create: `apps/web/src/lib/integrations/helpdesk-adapters/http.ts`
- Test: `apps/web/tests/unit/helpdesk-adapter-http.test.ts`

- [ ] **Step 1: Write failing HTTP boundary tests**

Create `apps/web/tests/unit/helpdesk-adapter-http.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HelpdeskAdapterError } from "@/lib/integrations/helpdesk-adapters/errors";
import { createHelpdeskHttpClient, redactHelpdeskDiagnostic } from "@/lib/integrations/helpdesk-adapters/http";

describe("helpdesk adapter HTTP boundary", () => {
  it("parses JSON and records safe diagnostics", async () => {
    const client = createHelpdeskHttpClient({
      transport: async (request) => ({
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, url: request.url })
      })
    });

    const result = await client.requestJson({
      source: "zendesk",
      operation: "ticket_get",
      method: "GET",
      url: "https://example.zendesk.com/api/v2/tickets/1.json",
      headers: { authorization: "Bearer secret-token" },
      timeoutMs: 15000,
      maxResponseBytes: 500000
    });

    expect(result.body).toEqual({ ok: true, url: "https://example.zendesk.com/api/v2/tickets/1.json" });
    expect(result.diagnostic.statusCode).toBe(200);
    expect(JSON.stringify(result.diagnostic)).not.toContain("secret-token");
  });

  it("maps non-2xx, invalid JSON, and oversized responses to safe connector errors", async () => {
    const failingClient = createHelpdeskHttpClient({
      transport: async () => ({ statusCode: 401, body: JSON.stringify({ token: "secret-token" }) })
    });

    await expect(
      failingClient.requestJson({
        source: "zendesk",
        operation: "ticket_get",
        method: "GET",
        url: "https://example.zendesk.com/api/v2/tickets/1.json?token=secret-token",
        headers: {},
        timeoutMs: 15000,
        maxResponseBytes: 500000
      })
    ).rejects.toMatchObject({
      code: "auth_failed",
      safeMessage: "Источник отклонил учетные данные."
    });
  });

  it("redacts auth fragments from diagnostics", () => {
    expect(
      redactHelpdeskDiagnostic({
        url: "https://example.test/path?access_token=secret-token",
        headers: { authorization: "Bearer secret-token" },
        body: { password: "secret-token", keep: "visible" }
      })
    ).toEqual({
      url: "https://example.test/path?access_token=[REDACTED]",
      headers: { authorization: "[REDACTED]" },
      body: { password: "[REDACTED]", keep: "visible" }
    });
  });

  it("exposes typed errors", () => {
    const error = new HelpdeskAdapterError({
      code: "invalid_json",
      source: "freshdesk",
      operation: "ticket_get",
      safeMessage: "Источник вернул ответ не в JSON-формате.",
      diagnostic: { statusCode: 200 }
    });

    expect(error.message).toBe("Источник вернул ответ не в JSON-формате.");
    expect(error.source).toBe("freshdesk");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-http.test.ts
```

Expected: FAIL because HTTP boundary files do not exist.

- [ ] **Step 3: Implement `errors.ts`**

Create `apps/web/src/lib/integrations/helpdesk-adapters/errors.ts`:

```ts
import type { HelpdeskAdapterOperation, PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";

export type HelpdeskAdapterErrorCode =
  | "auth_failed"
  | "http_error"
  | "invalid_json"
  | "response_too_large"
  | "timeout"
  | "network_error"
  | "malformed_payload"
  | "unsupported_operation";

export class HelpdeskAdapterError extends Error {
  readonly code: HelpdeskAdapterErrorCode;
  readonly source: PhaseBHelpdeskSource;
  readonly operation: HelpdeskAdapterOperation;
  readonly safeMessage: string;
  readonly diagnostic: unknown;

  constructor(input: {
    code: HelpdeskAdapterErrorCode;
    source: PhaseBHelpdeskSource;
    operation: HelpdeskAdapterOperation;
    safeMessage: string;
    diagnostic?: unknown;
  }) {
    super(input.safeMessage);
    this.name = "HelpdeskAdapterError";
    this.code = input.code;
    this.source = input.source;
    this.operation = input.operation;
    this.safeMessage = input.safeMessage;
    this.diagnostic = input.diagnostic ?? null;
  }
}
```

- [ ] **Step 4: Implement `http.ts`**

Create `apps/web/src/lib/integrations/helpdesk-adapters/http.ts` with:

```ts
import { Buffer } from "node:buffer";
import http from "node:http";
import https from "node:https";
import { HelpdeskAdapterError } from "@/lib/integrations/helpdesk-adapters/errors";
import type { HelpdeskAdapterOperation, PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";

type TransportRequest = {
  source: PhaseBHelpdeskSource;
  operation: HelpdeskAdapterOperation;
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

type TransportResponse = {
  statusCode: number;
  headers?: Record<string, string | string[] | undefined>;
  body: string | Buffer | Uint8Array;
};

export type HelpdeskTransport = (request: TransportRequest) => Promise<TransportResponse>;

const sensitiveKeyPattern = /authorization|password|secret|token|api[_-]?key|client[_-]?secret/i;
const redactedValue = "[REDACTED]";

export function bearerHeaders(token: string | undefined): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function basicApiTokenHeaders(token: string | undefined, suffix = "X"): Record<string, string> {
  return token ? { authorization: `Basic ${Buffer.from(`${token}:${suffix}`).toString("base64")}` } : {};
}

export function redactHelpdeskDiagnostic<T>(value: T): T {
  return redactValue(value) as T;
}

export function createHelpdeskHttpClient(input: { transport?: HelpdeskTransport } = {}) {
  const transport = input.transport ?? nodeTransport;

  return {
    async requestJson(request: TransportRequest) {
      const response = await transport(request).catch((error) => {
        throw new HelpdeskAdapterError({
          code: "network_error",
          source: request.source,
          operation: request.operation,
          safeMessage: "Не удалось выполнить запрос к источнику.",
          diagnostic: redactHelpdeskDiagnostic({ error: serializeError(error), request })
        });
      });
      const bodyBuffer = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);

      if (bodyBuffer.byteLength > request.maxResponseBytes) {
        throw new HelpdeskAdapterError({
          code: "response_too_large",
          source: request.source,
          operation: request.operation,
          safeMessage: "Ответ источника превышает лимит размера.",
          diagnostic: redactHelpdeskDiagnostic({ statusCode: response.statusCode, responseBytes: bodyBuffer.byteLength, request })
        });
      }

      const text = bodyBuffer.toString("utf8");

      if (response.statusCode === 401 || response.statusCode === 403) {
        throw new HelpdeskAdapterError({
          code: "auth_failed",
          source: request.source,
          operation: request.operation,
          safeMessage: "Источник отклонил учетные данные.",
          diagnostic: redactHelpdeskDiagnostic({ statusCode: response.statusCode, responseBody: text, request })
        });
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new HelpdeskAdapterError({
          code: "http_error",
          source: request.source,
          operation: request.operation,
          safeMessage: `Источник вернул HTTP ${response.statusCode}.`,
          diagnostic: redactHelpdeskDiagnostic({ statusCode: response.statusCode, responseBody: text, request })
        });
      }

      try {
        return {
          body: text ? (JSON.parse(text) as unknown) : {},
          diagnostic: redactHelpdeskDiagnostic({
            operation: request.operation,
            method: request.method,
            url: request.url,
            statusCode: response.statusCode
          })
        };
      } catch (error) {
        throw new HelpdeskAdapterError({
          code: "invalid_json",
          source: request.source,
          operation: request.operation,
          safeMessage: "Источник вернул ответ не в JSON-формате.",
          diagnostic: redactHelpdeskDiagnostic({ parseError: serializeError(error), responseBody: text, request })
        });
      }
    }
  };
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactUrl(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sensitiveKeyPattern.test(key) ? redactedValue : redactValue(item)])
    );
  }

  return value;
}

function redactUrl(value: string) {
  try {
    const url = new URL(value);

    for (const key of Array.from(url.searchParams.keys())) {
      if (sensitiveKeyPattern.test(key)) {
        url.searchParams.set(key, redactedValue);
      }
    }

    return url.toString().replaceAll("%5BREDACTED%5D", redactedValue);
  } catch {
    return value;
  }
}

function serializeError(error: unknown) {
  return error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
}

function nodeTransport(request: TransportRequest): Promise<TransportResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(request.url);
    const client = url.protocol === "https:" ? https : http;
    const timer = setTimeout(() => {
      req.destroy(new Error("Request timed out."));
    }, request.timeoutMs);
    const req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers: request.headers
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          clearTimeout(timer);
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    if (request.body) {
      req.write(request.body);
    }
    req.end();
  });
}
```

- [ ] **Step 5: Run HTTP tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-http.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/integrations/helpdesk-adapters/errors.ts apps/web/src/lib/integrations/helpdesk-adapters/http.ts apps/web/tests/unit/helpdesk-adapter-http.test.ts
git commit -m "feat: add shared helpdesk adapter http boundary"
```

---

### Task 3: Add Local Helpdesk Stub Server And Fixtures

**Files:**

- Create: `apps/web/tests/fixtures/helpdesk-adapter-fixtures.ts`
- Create: `apps/web/tests/fixtures/helpdesk-adapter-server.ts`
- Test: `apps/web/tests/unit/helpdesk-adapter-contracts.test.ts`

- [ ] **Step 1: Extend contract test with fixture coverage**

Add to `apps/web/tests/unit/helpdesk-adapter-contracts.test.ts`:

```ts
import { createHelpdeskAdapterServer } from "../fixtures/helpdesk-adapter-server";
import { helpdeskAdapterFixtures } from "../fixtures/helpdesk-adapter-fixtures";

it("provides local stub fixtures for every Phase B source", async () => {
  for (const source of phaseBHelpdeskSources) {
    expect(helpdeskAdapterFixtures[source].success).toBeDefined();
    expect(helpdeskAdapterFixtures[source].malformed).toBeDefined();
  }

  const server = await createHelpdeskAdapterServer({ source: "zendesk", mode: "success" });

  try {
    const response = await fetch(`${server.baseUrl}/api/v2/tickets/35436.json`);

    await expect(response.json()).resolves.toMatchObject({ ticket: { id: 35436 } });
    expect(server.requests[0]).toMatchObject({
      source: "zendesk",
      operation: "ticket_get"
    });
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-contracts.test.ts
```

Expected: FAIL because fixtures and server do not exist.

- [ ] **Step 3: Create fixture file**

Create `apps/web/tests/fixtures/helpdesk-adapter-fixtures.ts`.

Include one success payload and one malformed payload per source:

```ts
import type { PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";
import { nativeHelpdeskImportExamples } from "@/lib/normalizers/native-helpdesk";

export const helpdeskAdapterFixtures = {
  zendesk: {
    success: nativeHelpdeskImportExamples.zendesk,
    malformed: { ticket: { id: 35436 }, comments: [{ id: null, body: null }] }
  },
  freshdesk: {
    success: nativeHelpdeskImportExamples.freshdesk,
    malformed: { ticket: { id: 20 }, conversations: [{ id: null, body: null }] }
  },
  intercom: {
    success: nativeHelpdeskImportExamples.intercom,
    malformed: { conversation: { id: "conv_123", conversation_parts: {} } }
  },
  hubspot: {
    success: nativeHelpdeskImportExamples.hubspot,
    malformed: { ticket: { id: "987654321", properties: {} }, activities: [] }
  },
  salesforce: {
    success: {
      case: {
        Id: "500xx0000012345",
        CaseNumber: "00001001",
        Subject: "Refund request from Salesforce",
        Status: "Closed",
        Priority: "High",
        CreatedDate: "2026-04-25T10:00:00.000+0000",
        LastModifiedDate: "2026-04-25T10:18:00.000+0000"
      },
      comments: [
        {
          Id: "00axx000001",
          CommentBody: "Заказ задержан, хочу возврат.",
          CreatedDate: "2026-04-25T10:00:00.000+0000",
          CreatedBy: { Name: "Анна Смирнова" }
        }
      ]
    },
    malformed: { case: { Id: "500xx0000012345" }, comments: [] }
  },
  servicenow: {
    success: {
      case: {
        sys_id: "sn-case-1",
        number: "CS0001001",
        short_description: "Refund request from ServiceNow",
        state: "closed",
        priority: "2",
        opened_at: "2026-04-25 10:00:00",
        sys_updated_on: "2026-04-25 10:18:00"
      },
      journal: [
        {
          sys_id: "journal-1",
          element: "comments",
          value: "Заказ задержан, хочу возврат.",
          sys_created_on: "2026-04-25 10:00:00",
          sys_created_by: "anna@example.com"
        }
      ]
    },
    malformed: { case: { sys_id: "sn-case-1" }, journal: [] }
  },
  dynamics: {
    success: {
      incident: {
        incidentid: "incident-1",
        ticketnumber: "CAS-01001",
        title: "Refund request from Dynamics",
        statecode: 1,
        prioritycode: 1,
        createdon: "2026-04-25T10:00:00Z",
        modifiedon: "2026-04-25T10:18:00Z"
      },
      activities: [
        {
          activityid: "activity-1",
          subject: "Customer message",
          description: "Заказ задержан, хочу возврат.",
          createdon: "2026-04-25T10:00:00Z",
          sender: "Анна Смирнова"
        }
      ]
    },
    malformed: { incident: { incidentid: "incident-1" }, activities: [] }
  }
} satisfies Record<PhaseBHelpdeskSource, { success: unknown; malformed: unknown }>;
```

- [ ] **Step 4: Create local stub server**

Create `apps/web/tests/fixtures/helpdesk-adapter-server.ts`.

The server must:

- record requests;
- route source-specific success endpoints;
- support modes: `success`, `auth_failure`, `invalid_json`, `malformed_payload`, `not_found`;
- close cleanly.

Use the OTRS fixture server pattern from `apps/web/tests/fixtures/otrs-genericinterface-server.ts`.

- [ ] **Step 5: Run contract tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests/fixtures/helpdesk-adapter-fixtures.ts apps/web/tests/fixtures/helpdesk-adapter-server.ts apps/web/tests/unit/helpdesk-adapter-contracts.test.ts
git commit -m "test: add phase b helpdesk adapter stubs"
```

---

### Task 4: Implement Zendesk And Freshdesk Adapters

**Files:**

- Create: `apps/web/src/lib/integrations/helpdesk-adapters/zendesk.ts`
- Create: `apps/web/src/lib/integrations/helpdesk-adapters/freshdesk.ts`
- Create: `apps/web/src/lib/integrations/helpdesk-adapters/index.ts`
- Test: `apps/web/tests/unit/helpdesk-adapter-service.test.ts`
- Modify: `apps/web/src/lib/normalizers/native-helpdesk.ts`

- [ ] **Step 1: Write failing adapter tests**

Create or extend `apps/web/tests/unit/helpdesk-adapter-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters";
import { createHelpdeskAdapterServer } from "../fixtures/helpdesk-adapter-server";

describe("Zendesk and Freshdesk adapters", () => {
  it("loads a Zendesk ticket and comments through the source-specific endpoints", async () => {
    const server = await createHelpdeskAdapterServer({ source: "zendesk", mode: "success" });

    try {
      const adapter = createHelpdeskAdapter("zendesk");
      const result = await adapter.loadConversation({
        source: "zendesk",
        baseUrl: server.baseUrl,
        externalId: "35436",
        token: "test-token"
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "zendesk",
        externalId: "35436",
        channel: "email"
      });
      expect(result.conversations[0]?.messages.length).toBeGreaterThan(1);
      expect(server.requests.map((request) => request.operation)).toEqual(["ticket_get", "comments_get"]);
      expect(JSON.stringify(result.diagnostics)).not.toContain("test-token");
    } finally {
      await server.close();
    }
  });

  it("loads a Freshdesk ticket with conversations", async () => {
    const server = await createHelpdeskAdapterServer({ source: "freshdesk", mode: "success" });

    try {
      const adapter = createHelpdeskAdapter("freshdesk");
      const result = await adapter.loadConversation({
        source: "freshdesk",
        baseUrl: server.baseUrl,
        externalId: "20",
        token: "freshdesk-token"
      });

      expect(result.conversations[0]).toMatchObject({
        externalSource: "freshdesk",
        externalId: "20",
        status: "resolved"
      });
      expect(server.requests.map((request) => request.operation)).toContain("ticket_get");
      expect(JSON.stringify(result.diagnostics)).not.toContain("freshdesk-token");
    } finally {
      await server.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-service.test.ts
```

Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement Zendesk adapter**

Create `apps/web/src/lib/integrations/helpdesk-adapters/zendesk.ts`.

The adapter must:

- call `/api/v2/tickets/{id}.json`;
- call `/api/v2/tickets/{id}/comments.json`;
- use Bearer token when configured, with Basic token support left to Task 8 setup UI if needed;
- merge ticket/comments payload into existing `normalizeNativeHelpdeskPayload`.

- [ ] **Step 4: Implement Freshdesk adapter**

Create `apps/web/src/lib/integrations/helpdesk-adapters/freshdesk.ts`.

The adapter must:

- call `/api/v2/tickets/{id}?include=conversations`;
- if `conversations` is missing, call `/api/v2/tickets/{id}/conversations`;
- use Basic API token auth with `token:X`;
- merge payload into existing `normalizeNativeHelpdeskPayload`.

- [ ] **Step 5: Implement adapter index**

Create `apps/web/src/lib/integrations/helpdesk-adapters/index.ts`:

```ts
import type { PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";
import { createFreshdeskAdapter } from "@/lib/integrations/helpdesk-adapters/freshdesk";
import { createZendeskAdapter } from "@/lib/integrations/helpdesk-adapters/zendesk";

export function createHelpdeskAdapter(source: PhaseBHelpdeskSource) {
  if (source === "zendesk") {
    return createZendeskAdapter();
  }

  if (source === "freshdesk") {
    return createFreshdeskAdapter();
  }

  throw new Error(`Adapter ${source} is not implemented in this task.`);
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-service.test.ts tests/unit/native-helpdesk-normalizer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/integrations/helpdesk-adapters/zendesk.ts apps/web/src/lib/integrations/helpdesk-adapters/freshdesk.ts apps/web/src/lib/integrations/helpdesk-adapters/index.ts apps/web/tests/unit/helpdesk-adapter-service.test.ts apps/web/src/lib/normalizers/native-helpdesk.ts
git commit -m "feat: add zendesk and freshdesk adapter boundary"
```

---

### Task 5: Implement Intercom And HubSpot Adapters

**Files:**

- Create: `apps/web/src/lib/integrations/helpdesk-adapters/intercom.ts`
- Create: `apps/web/src/lib/integrations/helpdesk-adapters/hubspot.ts`
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/index.ts`
- Modify: `apps/web/src/lib/normalizers/native-helpdesk.ts`
- Test: `apps/web/tests/unit/helpdesk-adapter-service.test.ts`

- [ ] **Step 1: Add failing tests for Intercom and HubSpot**

Extend `apps/web/tests/unit/helpdesk-adapter-service.test.ts`:

```ts
it("loads an Intercom conversation with source and conversation parts", async () => {
  const server = await createHelpdeskAdapterServer({ source: "intercom", mode: "success" });

  try {
    const adapter = createHelpdeskAdapter("intercom");
    const result = await adapter.loadConversation({
      source: "intercom",
      baseUrl: server.baseUrl,
      externalId: "conv_123",
      token: "intercom-token"
    });

    expect(result.conversations[0]).toMatchObject({
      externalSource: "intercom",
      externalId: "conv_123",
      channel: "messenger"
    });
    expect(server.requests[0]).toMatchObject({
      operation: "conversations_get"
    });
  } finally {
    await server.close();
  }
});

it("loads a HubSpot ticket and associated activities", async () => {
  const server = await createHelpdeskAdapterServer({ source: "hubspot", mode: "success" });

  try {
    const adapter = createHelpdeskAdapter("hubspot");
    const result = await adapter.loadConversation({
      source: "hubspot",
      baseUrl: server.baseUrl,
      externalId: "987654321",
      token: "hubspot-token"
    });

    expect(result.conversations[0]).toMatchObject({
      externalSource: "hubspot",
      externalId: "987654321"
    });
    expect(result.conversations[0]?.tags).toContain("HIGH");
    expect(server.requests.map((request) => request.operation)).toContain("ticket_get");
  } finally {
    await server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-service.test.ts
```

Expected: FAIL because Intercom and HubSpot adapters are not wired.

- [ ] **Step 3: Implement Intercom adapter**

Create `apps/web/src/lib/integrations/helpdesk-adapters/intercom.ts`.

The adapter must:

- call `/conversations/{id}`;
- send `authorization: Bearer <token>`;
- send a version header after official-doc verification;
- preserve source message + conversation parts for `normalizeNativeHelpdeskPayload`.

- [ ] **Step 4: Implement HubSpot adapter**

Create `apps/web/src/lib/integrations/helpdesk-adapters/hubspot.ts`.

The adapter must:

- call `/crm/v3/objects/tickets/{id}` with required ticket properties;
- request or stub associated activities through documented association/activity endpoints;
- normalize the combined payload through `normalizeNativeHelpdeskPayload`;
- use Bearer/private-app token auth.

- [ ] **Step 5: Wire adapter index**

Update `apps/web/src/lib/integrations/helpdesk-adapters/index.ts` so `createHelpdeskAdapter("intercom")` and `createHelpdeskAdapter("hubspot")` return concrete adapters.

- [ ] **Step 6: Run tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-service.test.ts tests/unit/native-helpdesk-normalizer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/integrations/helpdesk-adapters/intercom.ts apps/web/src/lib/integrations/helpdesk-adapters/hubspot.ts apps/web/src/lib/integrations/helpdesk-adapters/index.ts apps/web/src/lib/normalizers/native-helpdesk.ts apps/web/tests/unit/helpdesk-adapter-service.test.ts
git commit -m "feat: add intercom and hubspot adapter boundary"
```

---

### Task 6: Add Enterprise CRM Adapter Boundaries

**Files:**

- Create: `apps/web/src/lib/integrations/helpdesk-adapters/salesforce.ts`
- Create: `apps/web/src/lib/integrations/helpdesk-adapters/servicenow.ts`
- Create: `apps/web/src/lib/integrations/helpdesk-adapters/dynamics.ts`
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/index.ts`
- Modify: `apps/web/src/lib/normalizers/native-helpdesk.ts`
- Test: `apps/web/tests/unit/helpdesk-adapter-service.test.ts`

- [ ] **Step 1: Add failing enterprise adapter tests**

Extend `apps/web/tests/unit/helpdesk-adapter-service.test.ts`:

```ts
for (const source of ["salesforce", "servicenow", "dynamics"] as const) {
  it(`loads ${source} fixture through a contract-certified enterprise adapter`, async () => {
    const server = await createHelpdeskAdapterServer({ source, mode: "success" });

    try {
      const adapter = createHelpdeskAdapter(source);
      const result = await adapter.loadConversation({
        source,
        baseUrl: server.baseUrl,
        externalId: source === "salesforce" ? "500xx0000012345" : source === "servicenow" ? "sn-case-1" : "incident-1",
        token: "enterprise-token"
      });

      expect(result.conversations[0]?.externalSource).toBe(source);
      expect(result.conversations[0]?.messages.length).toBeGreaterThan(0);
      expect(JSON.stringify(result.diagnostics)).not.toContain("enterprise-token");
    } finally {
      await server.close();
    }
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-service.test.ts
```

Expected: FAIL because enterprise adapters are not wired.

- [ ] **Step 3: Extend normalizer source support**

Update `apps/web/src/lib/normalizers/native-helpdesk.ts`:

- add `salesforce`, `servicenow`, and `dynamics` to `nativeHelpdeskSources` or create a separate union if the UI must keep them in enterprise group;
- add source labels;
- normalize the fixture shapes from Task 3 into `CustomConversationInput`;
- ensure no malformed fixture produces a valid conversation.

- [ ] **Step 4: Implement enterprise adapters**

Create the three adapter files.

Each adapter must:

- use source-specific endpoint paths verified in official docs;
- use Bearer/OAuth token headers;
- combine case/incident and comments/activity payloads into the normalizer shape;
- return diagnostics with redacted URLs/headers;
- remain `ready_for_live_certification`, not `live_certified`.

- [ ] **Step 5: Run tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/helpdesk-adapter-service.test.ts tests/unit/native-helpdesk-normalizer.test.ts tests/unit/integration-capabilities.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/integrations/helpdesk-adapters/salesforce.ts apps/web/src/lib/integrations/helpdesk-adapters/servicenow.ts apps/web/src/lib/integrations/helpdesk-adapters/dynamics.ts apps/web/src/lib/integrations/helpdesk-adapters/index.ts apps/web/src/lib/normalizers/native-helpdesk.ts apps/web/tests/unit/helpdesk-adapter-service.test.ts apps/web/tests/unit/native-helpdesk-normalizer.test.ts
git commit -m "feat: add enterprise crm adapter boundaries"
```

---

### Task 7: Wire Adapter Service Into Integration Runner

**Files:**

- Create: `apps/web/src/lib/integrations/helpdesk-adapters/service.ts`
- Modify: `apps/web/src/lib/integrations/runner.ts`
- Modify: `apps/web/tests/unit/integration-import-service.test.ts`
- Modify: `apps/web/tests/unit/integration-runner-ledger.test.ts`

- [ ] **Step 1: Add failing runner/service test**

Create assertions that native helpdesk sources go through the adapter service, not inline URL branches.

Example expectation in `apps/web/tests/unit/integration-runner-ledger.test.ts`:

```ts
expect(result.source).toBe("zendesk");
expect(result.mode).toBe("native_helpdesk");
expect(result.checkedCount).toBe(1);
expect(result.importedCount).toBe(1);
expect(result.externalIds).toEqual(["35436"]);
```

- [ ] **Step 2: Run runner tests to verify failure**

Run:

```bash
cd apps/web && npm run test -- tests/unit/integration-runner-ledger.test.ts tests/unit/integration-import-service.test.ts
```

Expected: FAIL until the service and runner are wired.

- [ ] **Step 3: Implement adapter service**

Create `apps/web/src/lib/integrations/helpdesk-adapters/service.ts`.

The service must:

- load integration row and credentials;
- validate source is in `phaseBHelpdeskSources`;
- decrypt `auth_password` or OAuth secret slot using existing credential helpers;
- call `createHelpdeskAdapter(source).loadConversation(...)`;
- validate every output with `customConversationSchema`;
- return safe diagnostics and normalized conversations.

- [ ] **Step 4: Replace inline native helpdesk fetch in runner**

In `apps/web/src/lib/integrations/runner.ts`:

- keep OTRS-family logic unchanged;
- replace `loadNativeHelpdeskPayload` and source-specific inline fetch logic with `loadHelpdeskAdapterConversations`;
- preserve current `IntegrationRunResult` shape.

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/integration-runner-ledger.test.ts tests/unit/integration-import-service.test.ts tests/unit/helpdesk-adapter-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/integrations/helpdesk-adapters/service.ts apps/web/src/lib/integrations/runner.ts apps/web/tests/unit/integration-import-service.test.ts apps/web/tests/unit/integration-runner-ledger.test.ts
git commit -m "feat: route helpdesk imports through adapter service"
```

---

### Task 8: Update Certification Registry, Catalog, And OpenAPI

**Files:**

- Modify: `apps/web/src/lib/integrations/capabilities.ts`
- Modify: `apps/web/tests/unit/integration-capabilities.test.ts`
- Modify: `apps/web/tests/unit/integration-catalog-route.test.ts`
- Modify: `apps/web/src/lib/api/openapi.ts`
- Modify: `apps/web/tests/unit/openapi.test.ts`

- [ ] **Step 1: Add failing registry assertions**

Extend `apps/web/tests/unit/integration-capabilities.test.ts`:

```ts
it("surfaces Phase B adapter evidence without live-production overclaiming", () => {
  for (const source of ["zendesk", "freshdesk", "intercom", "hubspot", "salesforce", "servicenow", "dynamics"]) {
    const capability = getIntegrationCapability(source);

    expect(capability.certification.docs.length).toBeGreaterThan(0);
    expect(capability.certification.summary.productionReady).toBe(false);
    expect(capability.certification.summary.status).not.toBe("live_certified");
    expect(capability.operations).toContain("diagnostics");
  }

  expect(getIntegrationCapability("zendesk")).toMatchObject({
    setupStatus: "available",
    readiness: "adapter_ready"
  });
  expect(getIntegrationCapability("salesforce")).toMatchObject({
    setupStatus: "preview",
    readiness: "adapter_ready"
  });
});
```

- [ ] **Step 2: Add failing OpenAPI assertions**

Extend `apps/web/tests/unit/openapi.test.ts`:

```ts
expect(document.components.schemas.IntegrationCapability.properties.certification).toEqual({
  $ref: "#/components/schemas/Certification"
});
expect(document.components.schemas.IntegrationCapability.properties.operations.items.type).toBe("string");
expect(document.paths["/integrations/catalog"].get.responses["200"].content["application/json"].schema).toEqual({
  $ref: "#/components/schemas/IntegrationCatalogResponse"
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
cd apps/web && npm run test -- tests/unit/integration-capabilities.test.ts tests/unit/integration-catalog-route.test.ts tests/unit/openapi.test.ts
```

Expected: FAIL until capabilities derive Phase B metadata.

- [ ] **Step 4: Derive capability entries from source contracts**

In `apps/web/src/lib/integrations/capabilities.ts`:

- import `phaseBSourceContracts`;
- replace duplicated Phase B fields with contract-derived metadata;
- set `setupStatus: "available"` only for adapters wired in Tasks 4-7;
- set enterprise CRM sources to `preview`, not `planned`, after stub/contract tests pass;
- keep `summary.productionReady === false`.

- [ ] **Step 5: Update OpenAPI if schema lacks any Phase B fields**

In `apps/web/src/lib/api/openapi.ts`, ensure catalog response includes:

- operations;
- supported events;
- docs;
- limitations;
- certification gates/summary;
- request ID header/body from Phase A.

- [ ] **Step 6: Run tests**

Run:

```bash
cd apps/web && npm run test -- tests/unit/integration-capabilities.test.ts tests/unit/integration-catalog-route.test.ts tests/unit/openapi.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/integrations/capabilities.ts apps/web/tests/unit/integration-capabilities.test.ts apps/web/tests/unit/integration-catalog-route.test.ts apps/web/src/lib/api/openapi.ts apps/web/tests/unit/openapi.test.ts
git commit -m "feat: expose phase b adapter readiness contracts"
```

---

### Task 9: Update Admin UI Readiness And Diagnostics

**Files:**

- Modify: `apps/web/src/app/admin/integrations/page.tsx`
- Modify: `apps/web/src/app/admin/integrations/[integrationId]/page.tsx`
- Modify: `apps/web/src/components/integrations/integration-setup-workspace.tsx`
- Modify: `apps/web/tests/e2e/helpdesk-adapter-readiness.spec.ts`
- Modify: `apps/web/tests/e2e/otrs-integration-cockpit.spec.ts`

- [ ] **Step 1: Add failing e2e readiness spec**

Create `apps/web/tests/e2e/helpdesk-adapter-readiness.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("shows Phase B adapter readiness without live certification overclaiming", async ({ page }) => {
  await page.goto("/admin/integrations/new");

  await page.getByLabel("Система-источник").selectOption("native:zendesk");
  await expect(page.locator(".source-selected-card")).toContainText("Zendesk");
  await expect(page.locator(".source-selected-card")).toContainText("Готово к живой сертификации");
  await expect(page.locator(".source-selected-card")).not.toContainText("Живая сертификация пройдена");

  await page.getByLabel("Система-источник").selectOption("native:salesforce");
  await expect(page.locator(".source-selected-card")).toContainText("Salesforce Service Cloud");
  await expect(page.locator(".source-selected-card")).toContainText("Готово к живой сертификации");
  await expect(page.locator(".source-selected-card")).not.toContainText("Живая сертификация пройдена");
});
```

- [ ] **Step 2: Run e2e to verify failure**

Run:

```bash
cd apps/web && npm run test:e2e -- tests/e2e/helpdesk-adapter-readiness.spec.ts
```

Expected: FAIL until setup UI exposes Phase B sources and readiness correctly.

- [ ] **Step 3: Add Phase B sources to setup UI**

In `apps/web/src/components/integrations/integration-setup-workspace.tsx`:

- source options must come from `phaseBSourceContracts` instead of a hard-coded native list;
- show official docs label/link;
- show limitations;
- show required secret slots;
- show live-cert prerequisites as Russian copy;
- keep statuses Russian and conservative.

- [ ] **Step 4: Update integration overview and cockpit**

In admin integration pages:

- display adapter operation list;
- display certification gates;
- display diagnostics action only when credentials and base URL exist;
- show "Ожидает доступы" or "Готово к живой сертификации" for contract/stub-certified adapters.

- [ ] **Step 5: Run e2e specs**

Run:

```bash
cd apps/web && npm run test:e2e -- tests/e2e/helpdesk-adapter-readiness.spec.ts tests/e2e/otrs-integration-cockpit.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/integrations/page.tsx apps/web/src/app/admin/integrations/[integrationId]/page.tsx apps/web/src/components/integrations/integration-setup-workspace.tsx apps/web/tests/e2e/helpdesk-adapter-readiness.spec.ts apps/web/tests/e2e/otrs-integration-cockpit.spec.ts
git commit -m "feat: surface phase b adapter readiness in admin ui"
```

---

### Task 10: Add Optional Live Smoke Harness Gates

**Files:**

- Create: `apps/web/tests/live/helpdesk-live-smoke.test.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/source-contracts.ts`

- [ ] **Step 1: Add live smoke test that skips by default**

Create `apps/web/tests/live/helpdesk-live-smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters";

const liveSource = process.env.HELPDESK_LIVE_SOURCE;
const liveBaseUrl = process.env.HELPDESK_LIVE_BASE_URL;
const liveToken = process.env.HELPDESK_LIVE_TOKEN;
const liveExternalId = process.env.HELPDESK_LIVE_EXTERNAL_ID;

const runLive = liveSource && liveBaseUrl && liveToken && liveExternalId;

describe.skipIf(!runLive)("live helpdesk adapter smoke", () => {
  it("loads one live conversation through the selected adapter", async () => {
    const adapter = createHelpdeskAdapter(liveSource as never);
    const result = await adapter.loadConversation({
      source: liveSource as never,
      baseUrl: liveBaseUrl!,
      externalId: liveExternalId!,
      token: liveToken!
    });

    expect(result.conversations.length).toBeGreaterThan(0);
    expect(result.conversations[0]?.messages.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Add package script**

In `apps/web/package.json`, add:

```json
"test:live:helpdesk": "vitest run tests/live/helpdesk-live-smoke.test.ts"
```

- [ ] **Step 3: Run live test without env**

Run:

```bash
cd apps/web && npm run test:live:helpdesk
```

Expected: PASS with skipped suite when env vars are absent.

- [ ] **Step 4: Ensure source contracts reference the live command**

Verify every `liveCertification.smokeTestCommand` in `source-contracts.ts` points to a command that is not run by default.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/live/helpdesk-live-smoke.test.ts apps/web/package.json apps/web/src/lib/integrations/helpdesk-adapters/source-contracts.ts
git commit -m "test: add gated helpdesk live smoke harness"
```

---

### Task 11: Final Verification For Phase B

**Files:**

- No new files expected.
- Verify all files touched by Tasks 1-10.

- [ ] **Step 1: Search for forbidden live-production overclaims**

Run:

```bash
cd apps/web && rg -n "Живая сертификация пройдена|productionReady:\\s*true|live_certified" src tests
```

Expected:

- `custom_api` may remain live-certified from Phase A.
- Phase B sources must not be live-certified unless a real live smoke with protected credentials was run and committed separately with evidence.

- [ ] **Step 2: Search for missing source coverage**

Run:

```bash
cd apps/web && for s in zendesk freshdesk intercom hubspot salesforce servicenow dynamics; do rg -n "$s" src/lib/integrations src/lib/normalizers tests || exit 1; done
```

Expected: every source appears in contracts, adapter implementation, fixtures, tests, and capability assertions.

- [ ] **Step 3: Typecheck**

Run:

```bash
cd apps/web && npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Unit/API tests**

Run:

```bash
cd apps/web && npm run test
```

Expected: PASS.

- [ ] **Step 5: E2E tests**

Run:

```bash
cd apps/web && npm run test:e2e
```

Expected: PASS.

- [ ] **Step 6: Inspect git state**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended Phase B files are modified. Existing unrelated dirty files must not be reverted.

- [ ] **Step 7: Commit final fixes if needed**

If Steps 1-6 require fixes:

```bash
git add apps/web
git commit -m "chore: complete phase b adapter verification"
```

If Steps 1-6 pass without additional changes, skip this commit.

---

## Phase B Completion Criteria

Phase B is complete when:

1. Every Phase B source has official-docs evidence with first-party URL or Context7 ID.
2. Zendesk, Freshdesk, Intercom, HubSpot, Salesforce, ServiceNow, and Dynamics have adapter boundaries.
3. All Phase B adapters normalize into `customConversationSchema`.
4. All Phase B adapters have local stub coverage for success and failure paths.
5. Integration runner uses the adapter service for native helpdesk/CRM imports instead of inline source-specific fetch branches.
6. Admin UI shows source-specific readiness, limitations, docs, required secrets, and live-cert prerequisites in Russian.
7. API catalog/OpenAPI expose stable Phase B capability metadata.
8. Phase B sources are not marked `live_certified` unless a real protected live smoke has been run and evidence is committed.
9. `npm run typecheck`, `npm run test`, and `npm run test:e2e` pass.

## Handoff Notes

- Use one implementer subagent per task. Do not run multiple implementers in parallel because most tasks touch shared adapter files and tests.
- Run spec compliance review and code quality review after each task.
- Re-fetch vendor docs at execution time; do not rely solely on the Context7 precheck in this plan.
- Keep Phase C identity work out of this branch.
