import { NextRequest, NextResponse } from "next/server";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { upsertCustomConversation } from "@/lib/conversation-import";
import {
  extractOtrsFamilyTickets,
  isOtrsFamilyTicketLike,
  normalizeOtrsFamilyTicket,
  type OtrsFamilyNormalizeOptions,
  type OtrsFamilySource,
  type OtrsFamilyTicketGetResponse
} from "@/lib/normalizers/otrs-family";

export const dynamic = "force-dynamic";

const otrsFamilySources = ["otrs", "znuny", "otobo", "otrs_family"] as const satisfies readonly OtrsFamilySource[];

class BadRequestError extends Error {}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function parseOtrsFamilyImportBody(body: unknown) {
  if (!isRecord(body)) {
    throw new BadRequestError("Invalid OTRS-family TicketGet payload.");
  }

  const payload = (body.ticketGet ?? body) as OtrsFamilyTicketGetResponse;
  const tickets = extractOtrsFamilyTickets(payload);

  if (tickets.length === 0 || tickets.some((ticket) => !isOtrsFamilyTicketLike(ticket))) {
    throw new BadRequestError("Invalid OTRS-family TicketGet payload.");
  }

  const options: OtrsFamilyNormalizeOptions = {
    source: parseSource(body.source),
    baseUrl: optionalString(body.baseUrl),
    samplingReason: optionalString(body.samplingReason)
  };

  return {
    conversations: tickets.map((ticket) => normalizeOtrsFamilyTicket(ticket, options))
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "conversations:write");

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const { conversations } = parseOtrsFamilyImportBody(body);
    const imported = [];

    for (const conversation of conversations) {
      imported.push(await upsertCustomConversation(auth.workspaceId, conversation));
    }

    await recordApiTokenSuccess(auth.apiTokenId);

    return NextResponse.json({ count: imported.length, imported }, { status: 201 });
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof SyntaxError) {
      await recordApiTokenError(auth.apiTokenId, "Invalid OTRS-family TicketGet payload.");
      return errorResponse("Invalid OTRS-family TicketGet payload.", 400);
    }

    await recordApiTokenError(auth.apiTokenId, "Internal server error.");
    return errorResponse("Internal server error.", 500);
  }
}
