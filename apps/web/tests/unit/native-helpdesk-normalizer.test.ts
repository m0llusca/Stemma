import {
  nativeHelpdeskImportExamples,
  nativeHelpdeskSources,
  normalizeNativeHelpdeskPayload,
  type NativeHelpdeskSource
} from "@/lib/normalizers/native-helpdesk";
import { customConversationSchema } from "@/lib/validation/custom-api";
import { describe, expect, it } from "vitest";

describe("native helpdesk normalizer", () => {
  it("normalizes all supported native helpdesk examples into custom conversations", () => {
    for (const source of nativeHelpdeskSources) {
      const conversations = normalizeNativeHelpdeskPayload(nativeHelpdeskImportExamples[source.value], {
        source: source.value
      });

      expect(conversations).toHaveLength(1);
      expect(conversations[0]?.externalSource).toBe(source.value);
      expect(conversations[0]?.messages.length).toBeGreaterThan(0);
      expect(() => customConversationSchema.parse(conversations[0])).not.toThrow();
    }
  });

  it("preserves source-specific support semantics", () => {
    const zendesk = normalizeNativeHelpdeskPayload(nativeHelpdeskImportExamples.zendesk, { source: "zendesk" })[0];
    const intercom = normalizeNativeHelpdeskPayload(nativeHelpdeskImportExamples.intercom, { source: "intercom" })[0];
    const freshdesk = normalizeNativeHelpdeskPayload(nativeHelpdeskImportExamples.freshdesk, { source: "freshdesk" })[0];
    const hubspot = normalizeNativeHelpdeskPayload(nativeHelpdeskImportExamples.hubspot, { source: "hubspot" })[0];

    expect(zendesk?.channel).toBe("email");
    expect(zendesk?.riskHint).toContain("Priority");
    expect(intercom?.channel).toBe("messenger");
    expect(freshdesk?.status).toBe("resolved");
    expect(hubspot?.tags).toContain("HIGH");
  });

  it("maps Dynamics prioritycode per the incident schema (1=High, 2=Normal, 3=Low)", () => {
    const high = normalizeNativeHelpdeskPayload(
      {
        incident: {
          incidentid: "11111111-2222-3333-4444-555555555555",
          title: "High priority Dynamics case",
          statecode: 0,
          prioritycode: 1,
          createdon: "2026-04-25T10:00:00Z"
        },
        activities: [
          { activityid: "a1", description: "Срочно нужен возврат.", createdon: "2026-04-25T10:00:00Z" }
        ]
      },
      { source: "dynamics" }
    )[0];

    expect(high?.tags).toContain("high");
    expect(high?.riskHint).toBe("Priority: high");

    const low = normalizeNativeHelpdeskPayload(
      {
        incident: {
          incidentid: "11111111-2222-3333-4444-555555555555",
          title: "Low priority Dynamics case",
          statecode: 0,
          prioritycode: 3,
          createdon: "2026-04-25T10:00:00Z"
        },
        activities: [
          { activityid: "a1", description: "Можно не торопиться.", createdon: "2026-04-25T10:00:00Z" }
        ]
      },
      { source: "dynamics" }
    )[0];

    expect(low?.tags).toContain("low");
    expect(low?.riskHint).toBeUndefined();
  });

  it("falls back to a neutral Dynamics author when activitypointer has no sender column", () => {
    const dynamics = normalizeNativeHelpdeskPayload(nativeHelpdeskImportExamples.dynamics, { source: "dynamics" })[0];

    expect(dynamics?.messages.map((message) => message.authorName)).toEqual(["Dynamics 365", "Dynamics 365"]);
  });

  it("maps Jira public and internal comments to message privacy", () => {
    const [conversation] = normalizeNativeHelpdeskPayload(
      {
        request: {
          issueId: "10042",
          issueKey: "SUP-42",
          reporter: { displayName: "Анна Смирнова", emailAddress: "anna@example.com" },
          currentStatus: { status: "Resolved" },
          createdDate: { iso8601: "2026-04-25T10:00:00+0000" },
          requestFieldValues: [{ fieldId: "summary", value: "Refund request from Jira" }]
        },
        comments: [
          {
            id: "10001",
            body: "Заказ задержан, хочу возврат.",
            public: true,
            created: { iso8601: "2026-04-25T10:00:00+0000" },
            author: { displayName: "Анна Смирнова" }
          },
          {
            id: "10003",
            body: "Public agent reply should not become a customer message.",
            public: true,
            created: { iso8601: "2026-04-25T10:12:00+0000" },
            author: {
              displayName: "Мария Агент",
              emailAddress: "agent@example.com",
              accountType: "atlassian",
              applicationRoles: { size: 1, items: [{ key: "jira-servicedesk" }] }
            }
          },
          {
            id: "10004",
            body: "Public non-reporter comment should be treated conservatively as an agent reply.",
            public: true,
            created: { iso8601: "2026-04-25T10:14:00+0000" },
            author: { displayName: "Unknown public user", emailAddress: "unknown@example.com" }
          },
          {
            id: "10002",
            body: "Проверю перевозчика перед возвратом.",
            public: { value: false },
            created: { iso8601: "2026-04-25T10:08:00+0000" },
            author: { displayName: "Иван Петров" }
          }
        ]
      },
      { source: "jira" }
    );

    expect(conversation).toMatchObject({
      externalSource: "jira",
      externalId: "SUP-42",
      subject: "Refund request from Jira"
    });
    expect(conversation?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ externalId: "10001", participantType: "customer", isPrivate: false }),
        expect.objectContaining({ externalId: "10002", participantType: "human_agent", isPrivate: true }),
        expect.objectContaining({ externalId: "10003", participantType: "human_agent", isPrivate: false }),
        expect.objectContaining({ externalId: "10004", participantType: "human_agent", isPrivate: false })
      ])
    );
  });

  it("normalizes Jira object comment bodies into plain text", () => {
    const [conversation] = normalizeNativeHelpdeskPayload(
      {
        request: {
          issueId: "10045",
          issueKey: "SUP-45",
          reporter: { displayName: "Анна Смирнова", emailAddress: "anna@example.com" },
          currentStatus: { status: "Open" },
          createdDate: { iso8601: "2026-04-25T10:00:00+0000" },
          requestFieldValues: [{ fieldId: "summary", label: "Summary", value: "ADF body request" }]
        },
        comments: [
          {
            id: "10005",
            body: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "First nested sentence." },
                    { type: "text", value: "Second nested sentence." }
                  ]
                },
                {
                  type: "paragraph",
                  value: {
                    content: [{ type: "text", text: "Final nested sentence." }]
                  }
                }
              ]
            },
            public: { value: true },
            created: { iso8601: "2026-04-25T10:10:00+0000" },
            author: { displayName: "Анна Смирнова", emailAddress: "anna@example.com" }
          }
        ]
      },
      { source: "jira" }
    );

    expect(conversation?.messages).toEqual([
      expect.objectContaining({
        externalId: "10005",
        participantType: "customer",
        body: "First nested sentence.\nSecond nested sentence.\nFinal nested sentence.",
        isPrivate: false
      })
    ]);
  });

  it("imports Jira requests without comments from description-like request fields", () => {
    const [conversation] = normalizeNativeHelpdeskPayload(
      {
        request: {
          issueId: "10043",
          issueKey: "SUP-43",
          reporter: { displayName: "Анна Смирнова", emailAddress: "anna@example.com" },
          currentStatus: { status: "Open" },
          createdDate: { iso8601: "2026-04-25T10:00:00+0000" },
          requestFieldValues: [
            { fieldId: "summary", label: "Summary", value: "Portal login problem" },
            { fieldId: "customfield_10123", label: "Why do you need help?", value: "I cannot sign in to the portal." }
          ]
        },
        comments: []
      },
      { source: "jira" }
    );

    expect(conversation).toMatchObject({
      externalSource: "jira",
      externalId: "SUP-43",
      subject: "Portal login problem"
    });
    expect(conversation?.messages).toEqual([
      expect.objectContaining({
        participantType: "customer",
        authorName: "Анна Смирнова",
        body: "I cannot sign in to the portal.",
        isPrivate: false
      })
    ]);
  });

  it("imports Jira requests without comments from request description fallback", () => {
    const [conversation] = normalizeNativeHelpdeskPayload(
      {
        request: {
          issueId: "10044",
          issueKey: "SUP-44",
          reporter: { displayName: "Анна Смирнова", emailAddress: "anna@example.com" },
          currentStatus: { status: "Open" },
          createdDate: { iso8601: "2026-04-25T10:00:00+0000" },
          requestFieldValues: [{ fieldId: "summary", label: "Summary", value: "Missing order details" }],
          description: "<p>The order details page is empty.</p>"
        },
        comments: { values: [] }
      },
      { source: "jira" }
    );

    expect(conversation?.messages).toEqual([
      expect.objectContaining({
        participantType: "customer",
        authorName: "Анна Смирнова",
        body: "The order details page is empty.",
        isPrivate: false
      })
    ]);
  });

  it("returns no conversations for unsupported payload shapes", () => {
    expect(normalizeNativeHelpdeskPayload({ source: "zendesk", hello: "world" }, { source: "zendesk" as NativeHelpdeskSource })).toEqual([]);
  });

  it("rejects malformed enterprise helpdesk payloads", () => {
    expect(normalizeNativeHelpdeskPayload({ case: { Id: "500xx0000012345" }, comments: [] }, { source: "salesforce" })).toEqual([]);
    expect(
      normalizeNativeHelpdeskPayload({ case: { sys_id: "0123456789abcdef0123456789abcdef" }, journal: [] }, { source: "servicenow" })
    ).toEqual([]);
    expect(
      normalizeNativeHelpdeskPayload(
        { incident: { incidentid: "11111111-2222-3333-4444-555555555555" }, activities: [] },
        { source: "dynamics" }
      )
    ).toEqual([]);
  });

  it("rejects enterprise activity payloads without a case or incident", () => {
    expect(
      normalizeNativeHelpdeskPayload(
        { comments: [{ Id: "c1", CommentBody: "body", CreatedDate: "2026-04-25T10:00:00Z" }] },
        { source: "salesforce" }
      )
    ).toEqual([]);
    expect(
      normalizeNativeHelpdeskPayload(
        { journal: [{ sys_id: "j1", element: "comments", value: "body", sys_created_on: "2026-04-25 10:00:00" }] },
        { source: "servicenow" }
      )
    ).toEqual([]);
    expect(
      normalizeNativeHelpdeskPayload(
        { activities: [{ activityid: "a1", description: "body", createdon: "2026-04-25T10:00:00Z" }] },
        { source: "dynamics" }
      )
    ).toEqual([]);
  });

  it("rejects enterprise cases with only HTML-empty messages", () => {
    expect(
      normalizeNativeHelpdeskPayload(
        {
          case: {
            Id: "500xx0000012345",
            Subject: "Empty Salesforce comment",
            Status: "New",
            CreatedDate: "2026-04-25T10:00:00Z"
          },
          comments: [{ Id: "c1", CommentBody: "<p></p>", CreatedDate: "2026-04-25T10:00:00Z" }]
        },
        { source: "salesforce" }
      )
    ).toEqual([]);
    expect(
      normalizeNativeHelpdeskPayload(
        {
          case: {
            sys_id: "0123456789abcdef0123456789abcdef",
            short_description: "Empty ServiceNow journal",
            state: "open",
            opened_at: "2026-04-25 10:00:00"
          },
          journal: [{ sys_id: "j1", element: "comments", value: "<br>", sys_created_on: "2026-04-25 10:00:00" }]
        },
        { source: "servicenow" }
      )
    ).toEqual([]);
    expect(
      normalizeNativeHelpdeskPayload(
        {
          incident: {
            incidentid: "11111111-2222-3333-4444-555555555555",
            title: "Empty Dynamics activity",
            statecode: 0,
            createdon: "2026-04-25T10:00:00Z"
          },
          activities: [{ activityid: "a1", description: "<p></p>", createdon: "2026-04-25T10:00:00Z" }]
        },
        { source: "dynamics" }
      )
    ).toEqual([]);
  });

  it("rejects enterprise cases with messages missing body fields", () => {
    expect(
      normalizeNativeHelpdeskPayload(
        {
          case: {
            Id: "500xx0000012345",
            Subject: "Missing Salesforce comment body",
            Status: "New",
            CreatedDate: "2026-04-25T10:00:00Z"
          },
          comments: [{ Id: "c1", CreatedDate: "2026-04-25T10:00:00Z" }]
        },
        { source: "salesforce" }
      )
    ).toEqual([]);
    expect(
      normalizeNativeHelpdeskPayload(
        {
          case: {
            sys_id: "0123456789abcdef0123456789abcdef",
            short_description: "Missing ServiceNow journal body",
            state: "open",
            opened_at: "2026-04-25 10:00:00"
          },
          journal: [{ sys_id: "j1", element: "comments", sys_created_on: "2026-04-25 10:00:00" }]
        },
        { source: "servicenow" }
      )
    ).toEqual([]);
    expect(
      normalizeNativeHelpdeskPayload(
        {
          incident: {
            incidentid: "11111111-2222-3333-4444-555555555555",
            title: "Missing Dynamics activity body",
            statecode: 0,
            createdon: "2026-04-25T10:00:00Z"
          },
          activities: [{ activityid: "a1", createdon: "2026-04-25T10:00:00Z" }]
        },
        { source: "dynamics" }
      )
    ).toEqual([]);
  });
});
