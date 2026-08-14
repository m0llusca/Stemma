import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { enforceApiRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { upsertCustomConversationAtomic } from "@/lib/conversation-import";
import { customConversationSchema } from "@/lib/validation/custom-api";

export const dynamic = "force-dynamic";
export const maxRequestBodyBytes = 1024 * 1024;

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

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "conversations:write");

  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await enforceApiRateLimit({
    workspaceId: auth.workspaceId,
    apiTokenId: auth.apiTokenId,
    routeKey: "POST /api/conversations"
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
    const payload = customConversationSchema.parse(body);
    const conversation = await upsertCustomConversationAtomic(auth.workspaceId, payload);

    await recordApiTokenSuccess(auth.apiTokenId);

    return NextResponse.json({ id: conversation.id }, { status: 201, headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      await recordApiTokenError(auth.apiTokenId, "Invalid custom conversation payload.");
      return errorResponse("Invalid custom conversation payload.", 400);
    }

    await recordApiTokenError(auth.apiTokenId, "Internal server error.");
    return errorResponse("Internal server error.", 500);
  }
}
