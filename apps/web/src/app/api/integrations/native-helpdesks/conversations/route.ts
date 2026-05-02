import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { upsertCustomConversation } from "@/lib/conversation-import";
import {
  nativeHelpdeskSources,
  normalizeNativeHelpdeskPayload,
  type NativeHelpdeskNormalizeOptions,
  type NativeHelpdeskSource
} from "@/lib/normalizers/native-helpdesk";
import { customConversationSchema, customSamplingTypeSchema } from "@/lib/validation/custom-api";

export const dynamic = "force-dynamic";

const nativeHelpdeskSourceValues = nativeHelpdeskSources.map((source) => source.value);

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

function optionalCsatScore(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numberValue) ? numberValue : value;
}

function parseSource(value: unknown): NativeHelpdeskSource {
  const source = optionalString(value);

  if (!source || !nativeHelpdeskSourceValues.includes(source as NativeHelpdeskSource)) {
    throw new BadRequestError("Unsupported native helpdesk source.");
  }

  return source as NativeHelpdeskSource;
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

function parseNativeHelpdeskImportBody(body: unknown) {
  if (!isRecord(body)) {
    throw new BadRequestError("Invalid native helpdesk payload.");
  }

  const source = parseSource(body.source);
  const payload = body.payload ?? body.data ?? body;
  const options: NativeHelpdeskNormalizeOptions = {
    source,
    baseUrl: optionalString(body.baseUrl),
    samplingReason: optionalString(body.samplingReason)
  };
  const qualityContext = parseQualityContext(body);
  const conversations = normalizeNativeHelpdeskPayload(payload, options).map((conversation) =>
    customConversationSchema.parse({ ...conversation, ...qualityContext })
  );

  if (conversations.length === 0) {
    throw new BadRequestError("Invalid native helpdesk payload.");
  }

  return { conversations };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "conversations:write");

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const { conversations } = parseNativeHelpdeskImportBody(body);
    const imported = [];

    for (const conversation of conversations) {
      imported.push(await upsertCustomConversation(auth.workspaceId, conversation));
    }

    await recordApiTokenSuccess(auth.apiTokenId);

    return NextResponse.json({ count: imported.length, imported }, { status: 201 });
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof SyntaxError || error instanceof ZodError) {
      await recordApiTokenError(auth.apiTokenId, "Invalid native helpdesk payload.");
      return errorResponse("Invalid native helpdesk payload.", 400);
    }

    await recordApiTokenError(auth.apiTokenId, "Internal server error.");
    return errorResponse("Internal server error.", 500);
  }
}
