import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { hashRequestBody, readIdempotencyKey, reserveIdempotencyKey, completeIdempotencyKey } from "@/lib/api/idempotency";
import { enforceApiRateLimit } from "@/lib/api/rate-limit";
import { apiError, apiJson } from "@/lib/api/response";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { upsertCustomConversation } from "@/lib/conversation-import";
import { customConversationSchema } from "@/lib/validation/custom-api";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "conversations:write");

  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await enforceApiRateLimit({
    workspaceId: auth.workspaceId,
    apiTokenId: auth.apiTokenId,
    routeKey: "POST /api/v1/conversations"
  });

  if (!rateLimit.ok) {
    await recordApiTokenError(auth.apiTokenId, "Rate limit exceeded.");
    return apiError("rate_limited", "Превышен лимит запросов API.", 429);
  }

  try {
    const body = await request.json();
    const payload = customConversationSchema.parse(body);
    const idempotencyKey = readIdempotencyKey(request);
    const requestHash = hashRequestBody(payload);
    const reserved = idempotencyKey
      ? await reserveIdempotencyKey({
          workspaceId: auth.workspaceId,
          key: idempotencyKey,
          method: "POST",
          path: "/api/v1/conversations",
          requestHash
        })
      : null;

    if (reserved?.isConflict) {
      await recordApiTokenError(auth.apiTokenId, "Idempotency key conflict.");
      return apiError("conflict", "Idempotency-Key уже использован для другого запроса.", 409);
    }

    if (reserved?.isReplay) {
      await recordApiTokenSuccess(auth.apiTokenId);
      return apiJson(JSON.parse(reserved.record.responseBodyJson || "{}"), reserved.record.responseStatus ?? 200);
    }

    const conversation = await upsertCustomConversation(auth.workspaceId, payload);
    const responseBody = { id: conversation.id };

    if (reserved) {
      await completeIdempotencyKey({
        id: reserved.record.id,
        responseStatus: 201,
        responseBody
      });
    }

    await recordApiTokenSuccess(auth.apiTokenId);
    return apiJson(responseBody, 201);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      await recordApiTokenError(auth.apiTokenId, "Invalid custom conversation payload.");
      return apiError("bad_request", "Некорректный payload обращения.", 400);
    }

    await recordApiTokenError(auth.apiTokenId, "Internal server error.");
    return apiError("internal_error", "Внутренняя ошибка сервера.", 500);
  }
}

