import { ZodError } from "zod";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { ingestWebhookEvent } from "@/lib/webhooks/inbound";

export const dynamic = "force-dynamic";
export const maxWebhookBodyBytes = 1024 * 1024;

type RouteContext = {
  params: Promise<{ endpointId: string }>;
};

function errorStatus(message: string) {
  if (message.includes("not found") || message.includes("disabled")) return 404;
  if (message.includes("signature")) return 401;
  if (message.includes("idempotency")) return 409;
  return 400;
}

function contentLengthBytes(headers: Headers) {
  const value = headers.get("content-length");

  if (!value) {
    return null;
  }

  const bytes = Number(value);
  return Number.isInteger(bytes) && bytes >= 0 ? bytes : null;
}

function payloadTooLargeResponse(requestId: string) {
  return apiError("bad_request", `Webhook payload exceeds ${maxWebhookBodyBytes} bytes.`, 413, requestId);
}

export async function POST(request: Request, context: RouteContext) {
  const requestId = requestIdFromHeaders(request.headers);
  const { endpointId } = await context.params;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();

  if (!idempotencyKey) {
    return apiError("bad_request", "Idempotency-Key header is required.", 400, requestId);
  }

  const timestamp = request.headers.get("x-qc-webhook-timestamp")?.trim();

  if (!timestamp) {
    return apiError("bad_request", "x-qc-webhook-timestamp header is required.", 400, requestId);
  }

  const signature = request.headers.get("x-qc-webhook-signature")?.trim();

  if (!signature) {
    return apiError("bad_request", "x-qc-webhook-signature header is required.", 400, requestId);
  }

  const contentLength = contentLengthBytes(request.headers);

  if (contentLength !== null && contentLength > maxWebhookBodyBytes) {
    return payloadTooLargeResponse(requestId);
  }

  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > maxWebhookBodyBytes) {
    return payloadTooLargeResponse(requestId);
  }

  try {
    const result = await ingestWebhookEvent({
      endpointId,
      rawBody,
      idempotencyKey,
      timestamp,
      signature
    });

    return apiJson(
      {
        event: {
          id: result.eventId,
          status: result.status,
          conversationId: result.conversationId
        }
      },
      result.status === "duplicate" ? 200 : 202,
      requestId
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return apiError("bad_request", "Некорректный webhook payload.", 400, requestId);
    }

    const message = error instanceof Error ? error.message : "Webhook ingest failed.";
    const status = errorStatus(message);
    return apiError(status === 401 ? "unauthorized" : status === 404 ? "not_found" : status === 409 ? "conflict" : "bad_request", message, status, requestId);
  }
}
