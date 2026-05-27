import { summarizeCertification } from "@/lib/certification/status";
import type {
  HelpdeskAdapterOperation,
  HelpdeskLiveCertificationRequirement,
  HelpdeskOfficialDoc,
  HelpdeskSourceContract,
  PhaseBHelpdeskSource
} from "@/lib/integrations/helpdesk-adapters/types";

const checkedAt = "2026-05-13";
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

function docs(officialDocs: readonly Omit<HelpdeskOfficialDoc, "checkedAt">[]) {
  return officialDocs.map((doc) => ({ ...doc, checkedAt, notes: [...doc.notes] }));
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
        notes: ["Confirmed ticket retrieval, ticket fields, Basic API token auth, and page/per_page pagination."]
      },
      {
        label: "Zendesk Ticket Comments API",
        href: "https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/",
        context7Id: "/websites/developer_zendesk_api-reference",
        notes: ["Confirmed comments endpoint, public flag, and attachments."]
      },
      {
        label: "Zendesk Webhooks",
        href: "https://developer.zendesk.com/documentation/webhooks/",
        notes: ["Webhook platform reference for later live event ingestion."]
      },
      {
        label: "Zendesk Ticket Event Types",
        href: "https://developer.zendesk.com/api-reference/webhooks/event-types/ticket-events/",
        notes: ["Ticket event payload evidence for webhook contract mapping."]
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
          "Confirmed ticket include=conversations, conversations endpoint, API-key Basic auth token:X, visibility fields, attachments, and page pagination."
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
        context7Id: "/intercom/intercom-openapi",
        notes: [
          "Confirmed GET /conversations/{id}, source, conversation_parts, 500 part cap, bearer auth, and Intercom-Version header."
        ]
      },
      {
        label: "Intercom Webhook Models",
        href: "https://developers.intercom.com/docs/references/webhooks/webhook-models",
        notes: ["Webhook model reference for future event ingestion."]
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
        context7Id: "/websites/developers_hubspot_api_crm",
        notes: ["Confirmed ticket retrieve/list endpoints, properties, associations, pipeline, stage, and scopes."]
      },
      {
        label: "HubSpot Webhooks Guide",
        href: "https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide",
        notes: ["Webhook subscriptions and delivery reference for ticket events."]
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
        context7Id: "/websites/developer_atlassian_cloud_jira_service-desk_rest_api-group-servicedesk",
        notes: [
          "Context7 confirmed request fields including issueId, issueKey, reporter, currentStatus, requestFieldValues, and paged values shapes."
        ]
      },
      {
        label: "Jira Service Management Request Comments API",
        href: "https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-request/#api-rest-servicedeskapi-request-issueidorkey-comment-get",
        context7Id: "/websites/developer_atlassian_cloud_jira_service-desk_rest_api-group-servicedesk",
        notes: [
          "Context7 confirmed request comments include paged values, author/body/created fields, and public flags for internal versus public comment mapping."
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
        notes: ["First-party fallback for REST resources, sObject rows, and SOQL query behavior."]
      },
      {
        label: "Salesforce Platform APIs Object Access",
        href: "https://developer.salesforce.com/blogs/2024/04/accessing-object-data-with-salesforce-platform-apis",
        notes: ["Developer guidance for object data access through platform APIs."]
      },
      {
        label: "Salesforce Connected App API Integration",
        href: "https://help.salesforce.com/s/articleView?id=sf.connected_app_create_api_integration.htm&language=en_US",
        notes: ["OAuth connected app setup evidence."]
      },
      {
        label: "Salesforce Pub/Sub Supported Event Types",
        href: "https://developer.salesforce.com/docs/platform/pub-sub-api/guide/supported-event-types.html",
        notes: ["Platform Events and Pub/Sub event coverage for later ingestion."]
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
        notes: ["First-party fallback for Table API discovery and ACL-aware REST access."]
      },
      {
        label: "ServiceNow Attachment API",
        href: "https://www.servicenow.com/docs/r/api-reference/rest-apis/c_AttachmentAPI.html",
        notes: ["Confirmed Attachment API and sysparm_limit/sysparm_offset pagination evidence."]
      },
      {
        label: "ServiceNow Developer API Reference",
        href: "https://developer.servicenow.com/dev.do#!/reference/api",
        notes: ["Developer reference entrypoint for REST API details."]
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
        notes: ["Confirmed Dataverse Web API, OData surface, and OAuth context."]
      },
      {
        label: "Dataverse Web API Service Documents",
        href: "https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/web-api-service-documents",
        notes: ["Service document evidence for endpoint discovery."]
      },
      {
        label: "Dynamics Incident Entity",
        href: "https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/entities/incident?view=op-9-1",
        notes: ["Case/Incident entity field reference."]
      },
      {
        label: "Dynamics ActivityPointer Entity",
        href: "https://learn.microsoft.com/en-us/dynamics365/developer/reference/entities/activitypointer",
        notes: ["Activity timeline entity reference."]
      }
    ]),
    liveCertification: liveCertification(
      genericLiveSmokeEnvironment,
      "HELPDESK_LIVE_SOURCE=dynamics npm run test:live:helpdesk"
    )
  })
} satisfies Record<PhaseBHelpdeskSource, HelpdeskSourceContract>;
