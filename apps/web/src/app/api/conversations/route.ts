import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { upsertCustomConversationAtomic } from "@/lib/conversation-import";
import { customConversationSchema } from "@/lib/validation/custom-api";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "conversations:write");

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const payload = customConversationSchema.parse(body);
    const conversation = await upsertCustomConversationAtomic(auth.workspaceId, payload);

    await recordApiTokenSuccess(auth.apiTokenId);

    return NextResponse.json({ id: conversation.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      await recordApiTokenError(auth.apiTokenId, "Invalid custom conversation payload.");
      return errorResponse("Invalid custom conversation payload.", 400);
    }

    await recordApiTokenError(auth.apiTokenId, "Internal server error.");
    return errorResponse("Internal server error.", 500);
  }
}
