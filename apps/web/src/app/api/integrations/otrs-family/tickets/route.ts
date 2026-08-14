import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { enforceApiRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import {
  assertConversationImportBatchLimit,
  ConversationImportLimitError,
  upsertCustomConversationsAtomic
} from "@/lib/conversation-import";
import {
  extractOtrsFamilyTickets,
  isOtrsFamilyTicketLike,
  normalizeOtrsFamilyTicket,
  type OtrsFamilyNormalizeOptions,
  type OtrsFamilySource,
  type OtrsFamilyTicketGetResponse
} from "@/lib/normalizers/otrs-family";
import { customConversationSchema, customSamplingTypeSchema } from "@/lib/validation/custom-api";

export const dynamic = "force-dynamic";
export const maxRequestBodyBytes = 1024 * 1024;

const otrsFamilySources = ["otrs", "znuny", "otobo", "otrs_family"] as const satisfies readonly OtrsFamilySource[];

class BadRequestError extends Error {}

function errorResponse(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

function contentLengthBytes(headers: Headers) {
  const value = headers.get("content-length");

  if (!value) {
    return null;
  }

  const bytes = Number(value);
  return Number.isInteger(bytes) && bytes >= 0 ? bytes : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalCsatScore(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numberValue) ? numberValue : value;
}

function parseSource(value: unknown): OtrsFamilySource | undefined {
  const source = optionalString(value);

  if (!source) {
    return undefined;
  }

  if (!otrsFamilySources.includes(source as OtrsFamilySource)) {
    throw new BadRequestError("Unsupported OTRS-family source.");
  }

  return source as OtrsFamilySource;
}

function parseQualityContext(body: Record<string, unknown>) {
  const samplingType = optionalString(body.samplingType);

  return {
    ...(samplingType ? { samplingType: customSamplingTypeSchema.parse(samplingType) } : {}),
    ...(body.csatScore !== undefined ? { csatScore: optionalCsatScore(body.csatScore) } : {}),
    ...(optionalString(body.supportLine) ? { supportLine: optionalString(body.supportLine) } : {}),
    ...(optionalString(body.teamName) ? { teamName: optionalString(body.teamName) } : {})
  };
}

function parseOtrsFamilyImportBody(body: unknown) {
  if (!isRecord(body)) {
    throw new BadRequestError("Invalid OTRS-family TicketGet payload.");
  }

  const payload = (body.ticketGet ?? body) as OtrsFamilyTicketGetResponse;
  const tickets = extractOtrsFamilyTickets(payload);

  if (tickets.length === 0 || tickets.some((ticket) => !isOtrsFamilyTicketLike(ticket))) {
    throw new BadRequestError("Invalid OTRS-family TicketGet payload.");
  }

  assertConversationImportBatchLimit(tickets);

  const options: OtrsFamilyNormalizeOptions = {
    source: parseSource(body.source),
    baseUrl: optionalString(body.baseUrl),
    timeZone: optionalString(body.timeZone),
    samplingReason: optionalString(body.samplingReason)
  };
  const qualityContext = parseQualityContext(body);

  return {
    conversations: tickets.map((ticket) =>
      customConversationSchema.parse({ ...normalizeOtrsFamilyTicket(ticket, options), ...qualityContext })
    )
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "conversations:write");

  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await enforceApiRateLimit({
    workspaceId: auth.workspaceId,
    apiTokenId: auth.apiTokenId,
    routeKey: "POST /api/integrations/otrs-family/tickets"
  });

  if (!rateLimit.ok) {
    await recordApiTokenError(auth.apiTokenId, "Rate limit exceeded.");
    return errorResponse("Rate limit exceeded.", 429, rateLimitHeaders(rateLimit));
  }

  const contentLength = contentLengthBytes(request.headers);

  if (contentLength !== null && contentLength > maxRequestBodyBytes) {
    await recordApiTokenError(auth.apiTokenId, "Request payload too large.");
    return errorResponse(`Request payload exceeds ${maxRequestBodyBytes} bytes.`, 413);
  }

  try {
    const body = await request.json();
    const { conversations } = parseOtrsFamilyImportBody(body);
    const imported = await upsertCustomConversationsAtomic(auth.workspaceId, conversations);

    await recordApiTokenSuccess(auth.apiTokenId);

    return NextResponse.json({ count: imported.length, imported }, { status: 201, headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    if (error instanceof ConversationImportLimitError) {
      await recordApiTokenError(auth.apiTokenId, error.message);
      return errorResponse(error.message, 400);
    }

    if (error instanceof BadRequestError || error instanceof SyntaxError || error instanceof ZodError) {
      await recordApiTokenError(auth.apiTokenId, "Invalid OTRS-family TicketGet payload.");
      return errorResponse("Invalid OTRS-family TicketGet payload.", 400);
    }

    await recordApiTokenError(auth.apiTokenId, "Internal server error.");
    return errorResponse("Internal server error.", 500);
  }
}
