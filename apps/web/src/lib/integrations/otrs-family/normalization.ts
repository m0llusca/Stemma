import {
  extractOtrsFamilyTickets,
  normalizeOtrsFamilyTicket,
  type OtrsFamilyArticle,
  type OtrsFamilyNormalizeOptions,
  type OtrsFamilyTicket,
  type OtrsFamilyTicketGetResponse
} from "@/lib/normalizers/otrs-family";
import type { CustomConversationInput } from "@/lib/validation/custom-api";
import {
  extractOtrsAttachmentMetadata,
  summarizeAttachmentWarnings,
  type OtrsAttachmentWarning
} from "@/lib/integrations/otrs-family/attachments";

export type NormalizedOtrsFamilyTicketImport = {
  conversation: CustomConversationInput;
  stats: {
    articleCount: number;
    privateArticleCount: number;
    attachmentCount: number;
  };
  warnings: OtrsAttachmentWarning[];
};

export function normalizeOtrsFamilyTicketForImport(
  ticket: OtrsFamilyTicket,
  options: OtrsFamilyNormalizeOptions = {}
): NormalizedOtrsFamilyTicketImport {
  const articles = articleArray(ticket.Article);
  const attachmentMetadata = articles.flatMap((article) => extractOtrsAttachmentMetadata(ticket, article));
  const conversation = normalizeOtrsFamilyTicket(ticket, options);

  return {
    conversation,
    stats: {
      articleCount: articles.length,
      privateArticleCount: articles.filter((article) => !isVisibleForCustomer(article.IsVisibleForCustomer)).length,
      attachmentCount: attachmentMetadata.length
    },
    warnings: summarizeAttachmentWarnings(attachmentMetadata, {
      baseUrl: options.baseUrl
    })
  };
}

export function normalizeOtrsFamilyTicketGetResponseForImport(
  payload: OtrsFamilyTicketGetResponse,
  options: OtrsFamilyNormalizeOptions = {}
) {
  return extractOtrsFamilyTickets(payload).map((ticket) => normalizeOtrsFamilyTicketForImport(ticket, options));
}

function articleArray(value: OtrsFamilyTicket["Article"]): OtrsFamilyArticle[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function isVisibleForCustomer(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }

  const normalized = String(value).trim().toLowerCase();

  return !["0", "false", "n", "no"].includes(normalized);
}
