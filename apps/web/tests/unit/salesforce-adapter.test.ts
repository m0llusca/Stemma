import { describe, expect, it } from "vitest";
import { createSalesforceAdapter } from "@/lib/integrations/helpdesk-adapters/salesforce";
import type { HelpdeskTransport } from "@/lib/integrations/helpdesk-adapters/http";

type StubResponse = { statusCode?: number; body: unknown };

function jsonTransport(handler: (url: string) => StubResponse): { transport: HelpdeskTransport; urls: string[] } {
  const urls: string[] = [];
  const transport: HelpdeskTransport = async (request) => {
    urls.push(request.url);
    const { statusCode = 200, body } = handler(request.url);
    return { statusCode, body: JSON.stringify(body) };
  };

  return { transport, urls };
}

const caseRecord = {
  Id: "500xx0000012345",
  CaseNumber: "00001001",
  Subject: "Refund request from Salesforce",
  Status: "Closed",
  Priority: "High",
  CreatedDate: "2026-04-25T10:00:00.000+0000",
  LastModifiedDate: "2026-04-25T10:30:00.000+0000"
};

function load(transport: HelpdeskTransport) {
  return createSalesforceAdapter(transport).loadConversation({
    source: "salesforce",
    baseUrl: "https://acme.my.salesforce.com",
    externalId: "500xx0000012345",
    token: "enterprise-token"
  });
}

describe("salesforce adapter", () => {
  it("turns EmailMessage records into customer/agent messages by Incoming direction", async () => {
    const { transport, urls } = jsonTransport((url) => {
      if (url.includes("/sobjects/Case/")) {
        return { body: caseRecord };
      }

      if (url.includes("EmailMessage")) {
        return {
          body: {
            done: true,
            records: [
              {
                Id: "02sxx000001",
                TextBody: "Заказ задержан, хочу возврат.",
                FromName: "Анна Смирнова",
                FromAddress: "anna@example.com",
                Incoming: true,
                MessageDate: "2026-04-25T10:05:00.000+0000"
              },
              {
                Id: "02sxx000002",
                TextBody: "Оформили возврат.",
                FromName: "Агент Поддержки",
                FromAddress: "agent@example.com",
                Incoming: false,
                MessageDate: "2026-04-25T10:25:00.000+0000"
              }
            ]
          }
        };
      }

      // CaseComment query.
      return {
        body: {
          done: true,
          records: [
            {
              Id: "00axx000001",
              CommentBody: "Internal triage.",
              IsPublished: false,
              CreatedDate: "2026-04-25T10:20:00.000+0000",
              CreatedBy: { Name: "Агент Поддержки" }
            }
          ]
        }
      };
    });

    const result = await load(transport);
    const [conversation] = result.conversations;

    // A dedicated EmailMessage SOQL query is issued alongside the CaseComment query.
    expect(urls.some((url) => url.includes("EmailMessage"))).toBe(true);
    expect(conversation?.messages).toEqual([
      expect.objectContaining({ externalId: "02sxx000001", participantType: "customer", isPrivate: false }),
      expect.objectContaining({ externalId: "00axx000001", participantType: "human_agent", isPrivate: true }),
      expect.objectContaining({ externalId: "02sxx000002", participantType: "human_agent", isPrivate: false })
    ]);
  });

  it("requests IsPublished and marks unpublished CaseComments as private", async () => {
    const { transport, urls } = jsonTransport((url) => {
      if (url.includes("/sobjects/Case/")) {
        return { body: caseRecord };
      }

      if (url.includes("EmailMessage")) {
        return { body: { done: true, records: [] } };
      }

      return {
        body: {
          done: true,
          records: [
            {
              Id: "00axx000001",
              CommentBody: "Private note.",
              IsPublished: false,
              CreatedDate: "2026-04-25T10:20:00.000+0000"
            }
          ]
        }
      };
    });

    const result = await load(transport);

    expect(urls.some((url) => /IsPublished/i.test(decodeURIComponent(url)))).toBe(true);
    expect(result.conversations[0]?.messages).toEqual([
      expect.objectContaining({ externalId: "00axx000001", isPrivate: true })
    ]);
  });

  it("follows nextRecordsUrl to accumulate every page of CaseComments", async () => {
    let commentQueryCount = 0;
    const { transport, urls } = jsonTransport((url) => {
      if (url.includes("/sobjects/Case/")) {
        return { body: caseRecord };
      }

      if (url.includes("EmailMessage")) {
        return { body: { done: true, records: [] } };
      }

      if (url.includes("/query/0r8xx000000")) {
        // Second page of the CaseComment query.
        return {
          body: {
            done: true,
            records: [
              { Id: "c2", CommentBody: "Second page comment.", IsPublished: true, CreatedDate: "2026-04-25T10:10:00.000+0000" }
            ]
          }
        };
      }

      // First page of the CaseComment query: more results pending.
      commentQueryCount += 1;
      return {
        body: {
          done: false,
          nextRecordsUrl: "/services/data/v66.0/query/0r8xx000000-2000",
          records: [
            { Id: "c1", CommentBody: "First page comment.", IsPublished: true, CreatedDate: "2026-04-25T10:05:00.000+0000" }
          ]
        }
      };
    });

    const result = await load(transport);

    expect(commentQueryCount).toBe(1);
    expect(urls).toContain("https://acme.my.salesforce.com/services/data/v66.0/query/0r8xx000000-2000");
    expect(result.conversations[0]?.messages.map((message) => message.externalId)).toEqual(["c1", "c2"]);
  });
});
