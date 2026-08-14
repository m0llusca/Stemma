import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { enforceApiRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { normalizeCustomMessage } from "@/lib/normalizers/custom-api";
import { customMessageSchema } from "@/lib/validation/custom-api";

export const dynamic = "force-dynamic";
export const maxRequestBodyBytes = 1024 * 1024;

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request, "conversations:write");

  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await enforceApiRateLimit({
    workspaceId: auth.workspaceId,
    apiTokenId: auth.apiTokenId,
    routeKey: "POST /api/conversations/[id]/messages"
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
    const { id } = await context.params;
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        workspaceId: auth.workspaceId
      },
      select: { id: true }
    });

    if (!conversation) {
      await recordApiTokenError(auth.apiTokenId, "Conversation not found.");
      return errorResponse("Conversation not found.", 404);
    }

    const body = await request.json();
    const payload = customMessageSchema.parse(body);
    const messageData = normalizeCustomMessage(payload);
    const message = await prisma.message.upsert({
      where: {
        conversationId_externalId: {
          conversationId: conversation.id,
          externalId: payload.externalId
        }
      },
      create: {
        ...messageData,
        conversationId: conversation.id
      },
      update: messageData
    });

    await recordApiTokenSuccess(auth.apiTokenId);

    return NextResponse.json({ id: message.id }, { status: 201, headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      await recordApiTokenError(auth.apiTokenId, "Invalid custom message payload.");
      return errorResponse("Invalid custom message payload.", 400);
    }

    await recordApiTokenError(auth.apiTokenId, "Internal server error.");
    return errorResponse("Internal server error.", 500);
  }
}
