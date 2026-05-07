import {
  buildOtrsFamilyTicketGetQueryParams,
  buildOtrsFamilyTicketGetRequest,
  buildOtrsFamilyTicketSearchRequest,
  normalizeOtrsFamilyTicket,
  normalizeOtrsFamilyTicketGetResponse,
  otrsFamilyApiProfiles,
  otrsFamilyProfileForSource,
  otrsFamilyTicketGetUrl,
  otrsFamilyTicketSearchUrl,
  otrsFamilyUrlWithQuery,
  type OtrsFamilyArticle,
  type OtrsFamilyTicket,
  type OtrsFamilyTicketGetResponse
} from "@/lib/normalizers/otrs-family";
import {
  buildOtrsAttachmentExternalUrl,
  extractOtrsAttachmentMetadata,
  summarizeAttachmentWarnings
} from "@/lib/integrations/otrs-family/attachments";
import { normalizeOtrsFamilyTicketForImport } from "@/lib/integrations/otrs-family/normalization";
import { customConversationSchema } from "@/lib/validation/custom-api";
import { describe, expect, it } from "vitest";

const ticketGetPayload = {
  Success: 1,
  Ticket: [
    {
      TicketID: 42,
      TicketNumber: "202604250001",
      Title: "Возврат после задержки доставки",
      State: "closed successful",
      Queue: "Raw",
      Priority: "3 high",
      Type: "Incident",
      CustomerUserID: "mila@example.com",
      Owner: "agent.ivan",
      Created: "2026-04-25 10:00:00",
      Closed: "2026-04-25 10:30:00",
      Article: [
        {
          ArticleID: 1002,
          SenderType: "agent",
          From: "agent.ivan",
          Body: "Внутренняя заметка по политике возврата.",
          Created: "2026-04-25 10:03:00",
          IsVisibleForCustomer: 0,
          CommunicationChannel: "Email"
        },
        {
          ArticleID: 1001,
          SenderType: "customer",
          From: "Мила Петрова <mila@example.com>",
          Body: "Доставка задержана, хочу возврат.",
          Created: "2026-04-25 10:01:00",
          IsVisibleForCustomer: 1,
          CommunicationChannel: "Email"
        },
        {
          ArticleID: 1003,
          SenderType: "system",
          From: "OTRS",
          Subject: "Auto response",
          Created: "2026-04-25 10:04:00",
          IsVisibleForCustomer: 1,
          CommunicationChannel: "Email"
        }
      ]
    }
  ]
} satisfies OtrsFamilyTicketGetResponse;

describe("OTRS-family normalizer", () => {
  it("normalizes TicketGet payloads into custom conversation input", () => {
    const [conversation] = normalizeOtrsFamilyTicketGetResponse(ticketGetPayload, {
      source: "znuny",
      baseUrl: "https://support.example.com/otrs",
      samplingReason: "Импорт из Znuny"
    });

    expect(() => customConversationSchema.parse(conversation)).not.toThrow();
    expect(conversation).toMatchObject({
      externalSource: "znuny",
      externalId: "42",
      externalUrl: "https://support.example.com/otrs/index.pl?Action=AgentTicketZoom;TicketID=42",
      channel: "email",
      subject: "Возврат после задержки доставки",
      status: "closed successful",
      tags: ["Raw", "3 high", "Incident"],
      customerName: "mila@example.com",
      assigneeName: "agent.ivan",
      samplingReason: "Импорт из Znuny",
      riskHint: "Приоритет: 3 high",
      openedAt: "2026-04-25T10:00:00.000Z",
      closedAt: "2026-04-25T10:30:00.000Z"
    });
    expect(conversation.messages.map((message) => message.externalId)).toEqual(["1001", "1002", "1003"]);
    expect(conversation.messages[0]).toMatchObject({
      participantType: "customer",
      isPrivate: false
    });
    expect(conversation.messages[1]).toMatchObject({
      participantType: "human_agent",
      isPrivate: true
    });
    expect(conversation.messages[2]).toMatchObject({
      participantType: "system",
      body: "Auto response"
    });
  });

  it("supports direct ticket objects and preserves article ids for idempotency", () => {
    const conversation = normalizeOtrsFamilyTicket({
      TicketNumber: "202604250002",
      Title: "Чат с клиентом",
      State: "open",
      CustomerID: "customer-1",
      CreateTime: "2026-04-25 11:00:00",
      Article: {
        ArticleID: "chat-article-1",
        SenderType: "external",
        From: "Клиент",
        Text: "Нужна помощь.",
        IncomingTime: 1777114800,
        CommunicationChannel: "Chat"
      }
    });

    expect(conversation.channel).toBe("chat");
    expect(conversation.externalId).toBe("202604250002");
    expect(conversation.messages[0].externalId).toBe("chat-article-1");
    expect(conversation.messages[0].participantType).toBe("customer");
    expect(() => customConversationSchema.parse(conversation)).not.toThrow();
  });

  it("documents separate API profile URLs for OTRS CE, Znuny and OTOBO", () => {
    const otrsProfile = otrsFamilyApiProfiles.find((profile) => profile.source === "otrs");
    const znunyProfile = otrsFamilyApiProfiles.find((profile) => profile.source === "znuny");

    expect(otrsFamilyApiProfiles.map((profile) => profile.source)).toEqual(["otrs", "znuny", "otobo"]);
    expect(otrsProfile?.ticketSearchMethod).toBe("POST");
    expect(otrsFamilyApiProfiles.map((profile) => otrsFamilyTicketGetUrl(profile, "42"))).toEqual([
      "https://support.example.com/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket/42",
      "https://support.example.com/znuny/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket/42",
      "https://support.example.com/otobo/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/TicketGet"
    ]);
    expect(znunyProfile).toBeDefined();
    expect(otrsFamilyTicketSearchUrl(znunyProfile!)).toBe(
      "https://support.example.com/znuny/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket/Search"
    );
  });

  it("resolves the OTRS-family fallback profile through OTRS CE 6 defaults", () => {
    expect(otrsFamilyProfileForSource("otrs_family")).toMatchObject({
      source: "otrs",
      label: "OTRS Community Edition 6",
      basePath: "/otrs",
      webService: "GenericTicketConnectorREST",
      ticketSearchMethod: "POST",
      ticketSearchPath: "/Ticket"
    });
  });

  it("builds TicketSearch and TicketGet API examples", () => {
    const otrsProfile = otrsFamilyApiProfiles.find((profile) => profile.source === "otrs")!;
    const otoboProfile = otrsFamilyApiProfiles.find((profile) => profile.source === "otobo")!;

    expect(buildOtrsFamilyTicketSearchRequest()).toMatchObject({
      UserLogin: "qa_api",
      Password: "<PASSWORD>",
      Queue: "Support::Refunds",
      Title: "%refund%",
      Limit: 50
    });
    expect(buildOtrsFamilyTicketGetRequest({ ticketId: "42", includeAttachments: true })).toMatchObject({
      TicketID: "42",
      Extended: 1,
      AllArticles: 1,
      ArticleOrder: "ASC",
      DynamicFields: 1,
      Attachments: 1,
      GetAttachmentContents: 0
    });
    expect(buildOtrsFamilyTicketGetRequest({ ticketId: "42", wrapped: true })).toMatchObject({
      TicketGet: expect.objectContaining({
        TicketID: "42",
        AllArticles: 1,
        Attachments: 0
      })
    });
    expect(buildOtrsFamilyTicketGetQueryParams(otrsProfile, { ticketId: "42" })).not.toHaveProperty("TicketID");
    expect(buildOtrsFamilyTicketGetQueryParams(otoboProfile, { ticketId: "42" })).toHaveProperty("TicketID", "42");
    expect(
      otrsFamilyUrlWithQuery(otrsFamilyTicketGetUrl(otrsProfile, "42"), buildOtrsFamilyTicketGetQueryParams(otrsProfile))
    ).toContain("/Ticket/42?UserLogin=qa_api&Password=%3CPASSWORD%3E");
  });

  it("wraps normalization with article, private article and attachment stats", () => {
    const ticketWithAttachment = {
      TicketID: "42",
      TicketNumber: "202604250001",
      Title: "Возврат после задержки доставки",
      State: "open",
      Created: "2026-04-25 10:00:00",
      Article: [
        {
          ArticleID: "101",
          SenderType: "customer",
          From: "mila@example.com",
          Body: "Нужен возврат.",
          Created: "2026-04-25 10:01:00",
          IsVisibleForCustomer: 1,
          Attachment: {
            AttachmentID: "1",
            Filename: "receipt.pdf",
            ContentType: "application/pdf",
            Filesize: 2048,
            Content: "JVBERi0xLjQKbase64"
          }
        },
        {
          ArticleID: "102",
          SenderType: "agent",
          From: "agent.ivan",
          Body: "Внутренняя заметка.",
          Created: "2026-04-25 10:02:00",
          IsVisibleForCustomer: 0
        }
      ]
    } as unknown as OtrsFamilyTicket;
    const result = normalizeOtrsFamilyTicketForImport(
      ticketWithAttachment,
      {
        source: "otrs",
        baseUrl: "https://support.example.com/otrs"
      }
    );

    expect(() => customConversationSchema.parse(result.conversation)).not.toThrow();
    expect(result.stats).toEqual({
      articleCount: 2,
      privateArticleCount: 1,
      attachmentCount: 1
    });
    expect(result.conversation.messages.map((message) => message.isPrivate)).toEqual([false, true]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "attachment_external_link",
        detail: expect.objectContaining({
          articleId: "101",
          attachmentId: "1",
          filename: "receipt.pdf",
          contentDiscarded: true,
          externalUrl: "https://support.example.com/otrs/index.pl?Action=AgentTicketAttachment;TicketID=42;ArticleID=101;FileID=1"
        })
      })
    ]);
    expect(JSON.stringify(result)).not.toContain("JVBERi0xLjQKbase64");
    expect(JSON.stringify(result)).not.toContain("ContentAlternative");
  });

  it("extracts external attachment metadata without storing attachment payloads", () => {
    const article = {
      ArticleID: "101",
      Attachment: [
        {
          AttachmentID: "1",
          Filename: "receipt.pdf",
          ContentType: "application/pdf",
          Filesize: "2048",
          Content: "JVBERi0xLjQKbase64",
          ContentAlternative: "binary-shadow",
          Base64Content: "secret-base64"
        }
      ]
    } as unknown as OtrsFamilyArticle;

    const metadata = extractOtrsAttachmentMetadata({ TicketID: "42" }, article);
    const warnings = summarizeAttachmentWarnings(metadata, {
      baseUrl: "https://support.example.com/otrs/"
    });

    expect(metadata).toEqual([
      {
        ticketId: "42",
        articleId: "101",
        attachmentId: "1",
        filename: "receipt.pdf",
        contentType: "application/pdf",
        size: 2048,
        contentDiscarded: true
      }
    ]);
    expect(buildOtrsAttachmentExternalUrl({ baseUrl: "https://support.example.com/otrs/", ticketId: "42", articleId: "101", attachmentId: "1" })).toBe(
      "https://support.example.com/otrs/index.pl?Action=AgentTicketAttachment;TicketID=42;ArticleID=101;FileID=1"
    );
    expect(warnings).toEqual([
      expect.objectContaining({
        code: "attachment_external_link",
        detail: expect.objectContaining({
          articleId: "101",
          attachmentId: "1",
          contentDiscarded: true,
          externalUrl: "https://support.example.com/otrs/index.pl?Action=AgentTicketAttachment;TicketID=42;ArticleID=101;FileID=1"
        })
      })
    ]);
    expect(JSON.stringify(metadata)).not.toContain("JVBERi0xLjQKbase64");
    expect(JSON.stringify(metadata)).not.toContain("secret-base64");
    expect(JSON.stringify(warnings)).not.toContain("binary-shadow");
  });

  it("warns with an external link for metadata-only attachments", () => {
    const ticket = {
      TicketID: "42",
      Title: "Attachment metadata only",
      State: "open",
      Created: "2026-04-25 10:00:00",
      Article: {
        ArticleID: "101",
        SenderType: "customer",
        From: "mila@example.com",
        Body: "See receipt.",
        Created: "2026-04-25 10:01:00",
        IsVisibleForCustomer: 1,
        Attachment: {
          AttachmentID: "1",
          Filename: "receipt.pdf",
          ContentType: "application/pdf",
          Filesize: "2048"
        }
      }
    } as unknown as OtrsFamilyTicket;

    const result = normalizeOtrsFamilyTicketForImport(ticket, {
      source: "otrs",
      baseUrl: "https://support.example.com/otrs/"
    });

    expect(result.stats.attachmentCount).toBe(1);
    expect(result.warnings).toEqual([
      {
        code: "attachment_external_link",
        message: "Attachment is retained as external OTRS metadata; file content is not imported.",
        detail: {
          ticketId: "42",
          articleId: "101",
          attachmentId: "1",
          filename: "receipt.pdf",
          contentType: "application/pdf",
          size: 2048,
          contentDiscarded: false,
          externalUrl: "https://support.example.com/otrs/index.pl?Action=AgentTicketAttachment;TicketID=42;ArticleID=101;FileID=1"
        }
      }
    ]);
  });
});
