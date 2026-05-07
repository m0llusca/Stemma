import type { OtrsFamilyArticle, OtrsFamilyTicket } from "@/lib/normalizers/otrs-family";

export type OtrsAttachmentMetadata = {
  ticketId?: string;
  articleId?: string;
  attachmentId?: string;
  filename?: string;
  contentType?: string;
  size?: number;
  contentDiscarded: boolean;
};

export type OtrsAttachmentWarning = {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
};

const attachmentContentKeyPattern = /(content|contentalternative|base64|binary|payload|body|data)/i;

export function extractOtrsAttachmentMetadata(ticket: OtrsFamilyTicket, article: OtrsFamilyArticle): OtrsAttachmentMetadata[] {
  return arrayValue(attachmentContainer(article)).map((attachment) => {
    const record = objectValue(attachment);

    return {
      ticketId: stringValue(ticket.TicketID ?? ticket.TicketNumber),
      articleId: stringValue(article.ArticleID ?? article.ArticleNumber),
      attachmentId: stringValue(record.AttachmentID ?? record.FileID ?? record.ID ?? record.Id),
      filename: stringValue(record.Filename ?? record.FileName ?? record.Name),
      contentType: stringValue(record.ContentType ?? record.MimeType),
      size: numberValue(record.Filesize ?? record.FileSize ?? record.Size),
      contentDiscarded: hasDiscardedContent(record)
    };
  });
}

export function buildOtrsAttachmentExternalUrl(input: {
  baseUrl: string;
  ticketId: string;
  articleId: string;
  attachmentId: string;
}) {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const params = [
    ["Action", "AgentTicketAttachment"],
    ["TicketID", input.ticketId],
    ["ArticleID", input.articleId],
    ["FileID", input.attachmentId]
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join(";");

  return `${baseUrl}/index.pl?${params}`;
}

export function summarizeAttachmentWarnings(metadata: OtrsAttachmentMetadata[]): OtrsAttachmentWarning[] {
  return metadata
    .filter((attachment) => attachment.contentDiscarded)
    .map((attachment) => ({
      code: "attachment_content_discarded",
      message: "Attachment content was discarded; only external attachment metadata is retained for import preview.",
      detail: compactRecord({
        ticketId: attachment.ticketId,
        articleId: attachment.articleId,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.size
      })
    }));
}

function attachmentContainer(article: OtrsFamilyArticle) {
  const record = article as Record<string, unknown>;

  return record.Attachment ?? record.Attachments ?? record.ArticleAttachment ?? record.ArticleAttachments;
}

function arrayValue(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function hasDiscardedContent(record: Record<string, unknown>) {
  return Object.entries(record).some(([key, value]) => attachmentContentKeyPattern.test(key) && value !== undefined && value !== null);
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
