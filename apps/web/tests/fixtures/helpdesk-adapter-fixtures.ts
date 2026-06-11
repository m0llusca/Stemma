import type { PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";
import { nativeHelpdeskImportExamples } from "@/lib/normalizers/native-helpdesk";

type HelpdeskAdapterFixtureKind = "success" | "malformed";
type HelpdeskAdapterFixtureSet = Record<HelpdeskAdapterFixtureKind, unknown>;

const helpdeskAdapterFixtureTemplates = deepFreeze(
  cloneJson({
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
    jira: {
      success: nativeHelpdeskImportExamples.jira,
      malformed: { request: { issueKey: "SUP-42" }, comments: [] }
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
            createdon: "2026-04-25T10:00:00Z"
          }
        ]
      },
      malformed: { incident: { incidentid: "incident-1" }, activities: [] }
    }
  } satisfies Record<PhaseBHelpdeskSource, HelpdeskAdapterFixtureSet>)
) satisfies Record<PhaseBHelpdeskSource, HelpdeskAdapterFixtureSet>;

export const helpdeskAdapterFixtures = {
  zendesk: {
    get success() {
      return getHelpdeskAdapterFixture("zendesk", "success");
    },
    get malformed() {
      return getHelpdeskAdapterFixture("zendesk", "malformed");
    }
  },
  freshdesk: {
    get success() {
      return getHelpdeskAdapterFixture("freshdesk", "success");
    },
    get malformed() {
      return getHelpdeskAdapterFixture("freshdesk", "malformed");
    }
  },
  intercom: {
    get success() {
      return getHelpdeskAdapterFixture("intercom", "success");
    },
    get malformed() {
      return getHelpdeskAdapterFixture("intercom", "malformed");
    }
  },
  hubspot: {
    get success() {
      return getHelpdeskAdapterFixture("hubspot", "success");
    },
    get malformed() {
      return getHelpdeskAdapterFixture("hubspot", "malformed");
    }
  },
  jira: {
    get success() {
      return getHelpdeskAdapterFixture("jira", "success");
    },
    get malformed() {
      return getHelpdeskAdapterFixture("jira", "malformed");
    }
  },
  salesforce: {
    get success() {
      return getHelpdeskAdapterFixture("salesforce", "success");
    },
    get malformed() {
      return getHelpdeskAdapterFixture("salesforce", "malformed");
    }
  },
  servicenow: {
    get success() {
      return getHelpdeskAdapterFixture("servicenow", "success");
    },
    get malformed() {
      return getHelpdeskAdapterFixture("servicenow", "malformed");
    }
  },
  dynamics: {
    get success() {
      return getHelpdeskAdapterFixture("dynamics", "success");
    },
    get malformed() {
      return getHelpdeskAdapterFixture("dynamics", "malformed");
    }
  }
} satisfies Record<PhaseBHelpdeskSource, { success: unknown; malformed: unknown }>;

export function getHelpdeskAdapterFixture(source: PhaseBHelpdeskSource, kind: HelpdeskAdapterFixtureKind) {
  return cloneJson(helpdeskAdapterFixtureTemplates[source][kind]);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}
