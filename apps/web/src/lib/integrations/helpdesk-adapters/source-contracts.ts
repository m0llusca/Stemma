import { summarizeCertification } from "@/lib/certification/status";
import type {
  HelpdeskAdapterOperation,
  HelpdeskLiveCertificationRequirement,
  HelpdeskOfficialDoc,
  HelpdeskSourceContract,
  PhaseBHelpdeskSource
} from "@/lib/integrations/helpdesk-adapters/types";

const defaultCheckedAt = "2026-06-28";
const defaultPayloadLimits = { batchSize: 25, importLimit: 100 } as const;
const phaseBGates = {
  docs: "docs_checked",
  contract: "contract_certified",
  stub: "stub_certified",
  live: "waiting_for_access"
} as const;
const nativeRuntimeSecrets = ["auth_password"] as const;
const enterpriseRuntimeSecrets = ["oauth_client_credentials"] as const;
const genericLiveSmokeEnvironment = [
  "HELPDESK_LIVE_SMOKE",
  "HELPDESK_LIVE_SOURCE",
  "HELPDESK_LIVE_BASE_URL",
  "HELPDESK_LIVE_TOKEN",
  "HELPDESK_LIVE_EXTERNAL_ID"
] as const;

export const phaseBHelpdeskSources = [
  "zendesk",
  "freshdesk",
  "intercom",
  "hubspot",
  "jira",
  "salesforce",
  "servicenow",
  "dynamics"
] as const satisfies readonly PhaseBHelpdeskSource[];

function docs(officialDocs: readonly (Omit<HelpdeskOfficialDoc, "checkedAt"> & { checkedAt?: string })[]) {
  return officialDocs.map(({ checkedAt, ...doc }) => ({ ...doc, checkedAt: checkedAt ?? defaultCheckedAt, notes: [...doc.notes] }));
}

function liveCertification(
  requiredEnvironment: readonly string[],
  smokeTestCommand: string
): HelpdeskLiveCertificationRequirement {
  return {
    requiredEnvironment: [...requiredEnvironment],
    smokeTestCommand: smokeTestCommand.includes("HELPDESK_LIVE_SMOKE=1")
      ? smokeTestCommand
      : `HELPDESK_LIVE_SMOKE=1 ${smokeTestCommand}`,
    neverRunByDefault: true
  };
}

function contract(config: Omit<HelpdeskSourceContract, "payloadLimits" | "certification">): HelpdeskSourceContract {
  return {
    ...config,
    authModes: [...config.authModes],
    operations: [...config.operations],
    supportedEvents: [...config.supportedEvents],
    requiredSecrets: [...config.requiredSecrets],
    payloadLimits: { ...defaultPayloadLimits },
    officialDocs: config.officialDocs.map((doc) => ({ ...doc, notes: [...doc.notes] })),
    liveCertification: {
      ...config.liveCertification,
      requiredEnvironment: [...config.liveCertification.requiredEnvironment]
    },
    certification: {
      gates: { ...phaseBGates },
      summary: summarizeCertification(phaseBGates),
      limitations: [
        "Контракт Phase B основан на документации и fixture/stub проверках.",
        "Живая сертификация не запускалась: нужны доступы к промышленному или sandbox окружению источника.",
        "Источник нельзя считать production-ready до успешного live smoke test."
      ]
    }
  };
}

const nativeOperations = [
  "ticket_get",
  "ticket_search",
  "comments_get",
  "conversations_get",
  "webhook_ingest",
  "diagnostics",
  "fixture_import"
] as const satisfies readonly HelpdeskAdapterOperation[];

const enterpriseOperations = [
  "case_get",
  "ticket_search",
  "activities_get",
  "webhook_ingest",
  "diagnostics",
  "fixture_import"
] as const satisfies readonly HelpdeskAdapterOperation[];

export const phaseBSourceContracts = {
  zendesk: contract({
    source: "zendesk",
    displayName: "Zendesk Support",
    type: "native_helpdesk",
    authModes: ["basic_api_token"],
    operations: nativeOperations,
    supportedEvents: ["ticket.created", "ticket.updated", "comment.created"],
    requiredSecrets: nativeRuntimeSecrets,
    docsHref: "https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/",
    officialDocs: docs([
      {
        label: "Zendesk Tickets API",
        href: "https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/",
        context7Id: "/websites/developer_zendesk_api-reference",
        notes: [
          "Confirmed ticket retrieval under /api/v2/tickets/{id}.json with Basic API token auth.",
          "Ticket list pagination remains page/per_page based; production readiness still needs live smoke evidence."
        ]
      },
      {
        label: "Zendesk Ticket Comments API",
        href: "https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/",
        context7Id: "/websites/developer_zendesk_api-reference",
        notes: ["Confirmed /api/v2/tickets/{ticket_id}/comments.json, public flag handling, and attachment fields."]
      },
      {
        label: "Zendesk Search API",
        href: "https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/",
        context7Id: "/websites/developer_zendesk_api-reference",
        notes: [
          "Confirmed cursor pagination fields links.next, meta.has_more, and meta.after_cursor.",
          "Search endpoint remains rate-limited separately and also counts toward global API limits."
        ]
      },
      {
        label: "Zendesk Webhooks",
        href: "https://developer.zendesk.com/documentation/webhooks/",
        context7Id: "/websites/developer_zendesk_api-reference",
        notes: ["Webhook platform reference checked; adapter does not auto-register vendor webhooks in the current flow."]
      },
      {
        label: "Zendesk Ticket Event Types",
        href: "https://developer.zendesk.com/api-reference/webhooks/event-types/ticket-events/",
        context7Id: "/websites/developer_zendesk_api-reference",
        notes: ["Ticket event payload reference checked for future webhook contract mapping."]
      }
    ]),
    liveCertification: liveCertification(
      genericLiveSmokeEnvironment,
      "HELPDESK_LIVE_SOURCE=zendesk npm run test:live:helpdesk"
    )
  }),
  freshdesk: contract({
    source: "freshdesk",
    displayName: "Freshdesk",
    type: "native_helpdesk",
    authModes: ["basic_api_key"],
    operations: nativeOperations,
    supportedEvents: ["ticket_created", "ticket_updated", "conversation_created"],
    requiredSecrets: nativeRuntimeSecrets,
    docsHref: "https://developers.freshdesk.com/api/",
    officialDocs: docs([
      {
        label: "Freshdesk API",
        href: "https://developers.freshdesk.com/api/",
        context7Id: "/websites/developers_freshdesk_api",
        notes: [
          "Confirmed GET /api/v2/tickets/[id] and include=conversations behavior.",
          "Confirmed GET /api/v2/tickets/[id]/conversations, page pagination, API-key Basic auth token:X, visibility fields, and attachments.",
          "Webhook support remains a declared capability only; automatic vendor webhook provisioning is not implemented."
        ]
      }
    ]),
    liveCertification: liveCertification(
      genericLiveSmokeEnvironment,
      "HELPDESK_LIVE_SOURCE=freshdesk npm run test:live:helpdesk"
    )
  }),
  intercom: contract({
    source: "intercom",
    displayName: "Intercom",
    type: "native_helpdesk",
    authModes: ["bearer_token"],
    operations: ["conversations_get", "webhook_ingest", "diagnostics", "fixture_import"],
    supportedEvents: ["conversation.created", "conversation.user.replied", "conversation.admin.replied"],
    requiredSecrets: nativeRuntimeSecrets,
    docsHref: "https://developers.intercom.com/docs/references/2.14/rest-api/api.intercom.io/conversations/retrieveconversation",
    officialDocs: docs([
      {
        label: "Intercom Retrieve Conversation",
        href: "https://developers.intercom.com/docs/references/2.14/rest-api/api.intercom.io/conversations/retrieveconversation",
        context7Id: "/websites/developers_intercom",
        notes: [
          "Confirmed GET /conversations/{conversation_id}, bearer token auth, and Intercom-Version header.",
          "Conversation search/list responses use pages pagination; adapter remains pinned to an explicit Intercom-Version until re-certified."
        ]
      },
      {
        label: "Intercom Webhook Models",
        href: "https://developers.intercom.com/docs/references/webhooks/webhook-models",
        context7Id: "/websites/developers_intercom",
        notes: ["Webhook model reference checked; current install flow does not create Intercom webhook subscriptions."]
      }
    ]),
    liveCertification: liveCertification(
      genericLiveSmokeEnvironment,
      "HELPDESK_LIVE_SOURCE=intercom npm run test:live:helpdesk"
    )
  }),
  hubspot: contract({
    source: "hubspot",
    displayName: "HubSpot Service Hub",
    type: "native_helpdesk",
    authModes: ["private_app_token", "oauth"],
    operations: ["ticket_get", "ticket_search", "activities_get", "webhook_ingest", "diagnostics", "fixture_import"],
    supportedEvents: ["ticket.creation", "ticket.propertyChange", "ticket.deletion"],
    requiredSecrets: nativeRuntimeSecrets,
    docsHref: "https://developers.hubspot.com/docs/api-reference/latest/crm/objects/tickets/guide",
    officialDocs: docs([
      {
        label: "HubSpot CRM Tickets Guide",
        href: "https://developers.hubspot.com/docs/api-reference/latest/crm/objects/tickets/guide",
        context7Id: "/websites/developers_hubspot",
        notes: [
          "Confirmed tickets batch/read and ticket object endpoints, properties, pipeline, and stage fields.",
          "Confirmed associations endpoints use after/pageSize cursor pagination for related objects."
        ]
      },
      {
        label: "HubSpot Webhooks Guide",
        href: "https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide",
        context7Id: "/websites/developers_hubspot",
        notes: [
          "Webhook subscriptions and delivery reference checked for ticket events.",
          "Current flow does not perform OAuth app webhook subscription registration."
        ]
      }
    ]),
    liveCertification: liveCertification(
      genericLiveSmokeEnvironment,
      "HELPDESK_LIVE_SOURCE=hubspot npm run test:live:helpdesk"
    )
  }),
  jira: contract({
    source: "jira",
    displayName: "Jira Service Management",
    type: "native_helpdesk",
    authModes: ["basic_api_token"],
    operations: ["ticket_get", "comments_get", "webhook_ingest", "diagnostics", "fixture_import"],
    supportedEvents: ["request.created", "request.updated", "comment.created"],
    requiredSecrets: nativeRuntimeSecrets,
    docsHref: "https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-request/",
    officialDocs: docs([
      {
        label: "Jira Service Management Request API",
        href: "https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-request/",
        notes: [
          "Official Atlassian docs checked for request fields including issueId, issueKey, reporter, currentStatus, requestFieldValues, and paged values shapes.",
          "Basic API token flow remains token-only; OAuth/Connect app scopes are not wired in this install flow."
        ]
      },
      {
        label: "Jira Service Management Request Comments API",
        href: "https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-request/#api-rest-servicedeskapi-request-issueidorkey-comment-get",
        context7Id: "/websites/developer_atlassian_cloud_jira_platform_rest_v3",
        notes: [
          "Official Atlassian docs checked for request comments and Jira issue comment fields.",
          "Comments are paged values with author/body/created fields and public flags for internal versus public comment visibility.",
          "Webhook readiness requires separate Atlassian webhook registration and is not automatic here."
        ]
      }
    ]),
    liveCertification: liveCertification(
      genericLiveSmokeEnvironment,
      "HELPDESK_LIVE_SOURCE=jira npm run test:live:helpdesk"
    )
  }),
  salesforce: contract({
    source: "salesforce",
    displayName: "Salesforce Service Cloud",
    type: "enterprise",
    authModes: ["oauth_connected_app"],
    operations: enterpriseOperations,
    supportedEvents: ["platform_event", "change_data_capture"],
    requiredSecrets: enterpriseRuntimeSecrets,
    docsHref: "https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/api_rest.pdf",
    officialDocs: docs([
      {
        label: "Salesforce REST API Developer Guide",
        href: "https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/api_rest.pdf",
        notes: [
          "Context7 lookup did not return usable endpoint chunks; first-party Salesforce guide is the fallback.",
          "Checked REST resources, sObject Rows retrieve, SOQL query/queryMore behavior, OAuth connected-app context, and API limit considerations."
        ]
      },
      {
        label: "Salesforce Platform APIs Object Access",
        href: "https://developer.salesforce.com/blogs/2024/04/accessing-object-data-with-salesforce-platform-apis",
        notes: ["Checked object access guidance for Case and related object reads through platform APIs."]
      },
      {
        label: "Salesforce Connected App API Integration",
        href: "https://help.salesforce.com/s/articleView?id=sf.connected_app_create_api_integration.htm&language=en_US",
        notes: ["Checked OAuth connected app setup; current Stemma install flow does not implement marketplace OAuth redirect/callback."]
      },
      {
        label: "Salesforce Pub/Sub Supported Event Types",
        href: "https://developer.salesforce.com/docs/platform/pub-sub-api/guide/supported-event-types.html",
        notes: ["Checked Platform Events, Change Data Capture, and Pub/Sub event coverage for later ingestion."]
      }
    ]),
    liveCertification: liveCertification(
      genericLiveSmokeEnvironment,
      "HELPDESK_LIVE_SOURCE=salesforce npm run test:live:helpdesk"
    )
  }),
  servicenow: contract({
    source: "servicenow",
    displayName: "ServiceNow Customer Service",
    type: "enterprise",
    authModes: ["basic", "oauth"],
    operations: enterpriseOperations,
    supportedEvents: ["record.inserted", "record.updated"],
    requiredSecrets: enterpriseRuntimeSecrets,
    docsHref: "https://www.servicenow.com/docs/r/api-reference/rest-api-explorer/c_RESTAPI.html",
    officialDocs: docs([
      {
        label: "ServiceNow REST API Explorer",
        href: "https://www.servicenow.com/docs/r/api-reference/rest-api-explorer/c_RESTAPI.html",
        notes: [
          "Context7 lookup did not return usable Table API chunks; first-party ServiceNow docs are the fallback.",
          "Checked REST API Explorer/Table API discovery, ACL-aware access, and sysparm query conventions."
        ]
      },
      {
        label: "ServiceNow Attachment API",
        href: "https://www.servicenow.com/docs/r/api-reference/rest-apis/c_AttachmentAPI.html",
        notes: ["Checked Attachment API plus sysparm_limit/sysparm_offset pagination evidence for related payload collection."]
      },
      {
        label: "ServiceNow Developer API Reference",
        href: "https://developer.servicenow.com/dev.do#!/reference/api",
        notes: ["Developer reference entrypoint checked; webhook-style record events require separate platform configuration."]
      }
    ]),
    liveCertification: liveCertification(
      genericLiveSmokeEnvironment,
      "HELPDESK_LIVE_SOURCE=servicenow npm run test:live:helpdesk"
    )
  }),
  dynamics: contract({
    source: "dynamics",
    displayName: "Dynamics 365 Customer Service",
    type: "enterprise",
    authModes: ["oauth"],
    operations: enterpriseOperations,
    supportedEvents: ["incident.create", "incident.update", "activitypointer.create"],
    requiredSecrets: enterpriseRuntimeSecrets,
    docsHref: "https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview",
    officialDocs: docs([
      {
        label: "Dataverse Web API Overview",
        href: "https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview",
        context7Id: "/microsoftdocs/dynamics-365-customer-engagement",
        notes: ["Confirmed Dataverse Web API, OData surface, and OAuth context for Dynamics 365 Customer Service."]
      },
      {
        label: "Dataverse Web API Service Documents",
        href: "https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/web-api-service-documents",
        context7Id: "/microsoftdocs/dynamics-365-customer-engagement",
        notes: ["Checked service document evidence for endpoint discovery and change tracking annotations."]
      },
      {
        label: "Dynamics Incident Entity",
        href: "https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/entities/incident?view=op-9-1",
        context7Id: "/microsoftdocs/dynamics-365-customer-engagement",
        notes: ["Checked Case/Incident entity field reference for case retrieval and relation shape."]
      },
      {
        label: "Dynamics ActivityPointer Entity",
        href: "https://learn.microsoft.com/en-us/dynamics365/developer/reference/entities/activitypointer",
        context7Id: "/microsoftdocs/dynamics-365-customer-engagement",
        notes: [
          "Checked ActivityPointer and annotations references for timeline/notes retrieval.",
          "OData reads can require paging/filtering; Dataverse business events/change tracking need separate tenant configuration."
        ]
      }
    ]),
    liveCertification: liveCertification(
      genericLiveSmokeEnvironment,
      "HELPDESK_LIVE_SOURCE=dynamics npm run test:live:helpdesk"
    )
  })
} satisfies Record<PhaseBHelpdeskSource, HelpdeskSourceContract>;
