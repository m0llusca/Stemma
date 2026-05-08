import type { OtrsFamilyArticle, OtrsFamilyTicket, OtrsFamilyTicketGetResponse } from "@/lib/normalizers/otrs-family";

export const otrsFixtureUserLogin = "qa_api";
export const otrsFixturePassword = "super-secret-password";
export const otrsFixtureAttachmentBase64 = "c2hvdWxkLW5vdC1iZS1wZXJzaXN0ZWQ=";

export function createOtrsFixtureTicket(
  ticketId: string,
  options: {
    includeAttachmentContent?: boolean;
    title?: string;
  } = {}
): OtrsFamilyTicket {
  const articleId = `${ticketId}-1`;
  const attachment = {
    AttachmentID: `${ticketId}-attachment-1`,
    Filename: `ticket-${ticketId}.txt`,
    ContentType: "text/plain",
    Filesize: 27,
    ...(options.includeAttachmentContent
      ? {
          Content: otrsFixtureAttachmentBase64,
          ContentAlternative: otrsFixtureAttachmentBase64,
          ContentBase64: otrsFixtureAttachmentBase64
        }
      : {})
  };

  return {
    TicketID: ticketId,
    TicketNumber: `20260508000${ticketId}`,
    Title: options.title ?? `Fixture ticket ${ticketId}`,
    State: "open",
    Queue: "Support::Contracts",
    Priority: "3 normal",
    Type: "Incident",
    Service: "GenericInterface",
    CustomerID: `customer-${ticketId}`,
    CustomerUserID: `customer-${ticketId}@example.com`,
    Owner: "QA Agent",
    Created: "2026-05-08 09:00:00",
    Article: [
      {
        ArticleID: articleId,
        SenderType: "customer",
        From: `Customer ${ticketId} <customer-${ticketId}@example.com>`,
        Subject: options.title ?? `Fixture ticket ${ticketId}`,
        Body: `Customer message for ticket ${ticketId}`,
        Created: "2026-05-08 09:01:00",
        IsVisibleForCustomer: 1,
        CommunicationChannel: "Email",
        Attachment: [attachment]
      } as OtrsFamilyArticle & { Attachment: unknown[] },
      {
        ArticleID: `${ticketId}-2`,
        SenderType: "agent",
        From: "QA Agent",
        Body: `Agent reply for ticket ${ticketId}`,
        Created: "2026-05-08 09:05:00",
        IsVisibleForCustomer: 1,
        CommunicationChannel: "Email"
      }
    ]
  };
}

export const otrsFixtureTicketIds = ["101", "102", "103"] as const;

export function createOtrsFixtureTickets(options: { includeAttachmentContent?: boolean } = {}) {
  return Object.fromEntries(
    otrsFixtureTicketIds.map((ticketId) => [
      ticketId,
      createOtrsFixtureTicket(ticketId, {
        includeAttachmentContent: options.includeAttachmentContent
      })
    ])
  );
}

export function createOtrsTicketGetFixtureResponse(ticket: OtrsFamilyTicket): OtrsFamilyTicketGetResponse {
  return {
    Success: 1,
    Ticket: ticket
  };
}
