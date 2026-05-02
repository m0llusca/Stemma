import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { recordApiTokenError, recordApiTokenSuccess, requireApiToken } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { normalizeCustomMessage } from "@/lib/normalizers/custom-api";
import { customMessageSchema } from "@/lib/validation/custom-api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request, "conversations:write");

  if (!auth.ok) {
    return auth.response;
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

    return NextResponse.json({ id: message.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      await recordApiTokenError(auth.apiTokenId, "Invalid custom message payload.");
      return errorResponse("Invalid custom message payload.", 400);
    }

    await recordApiTokenError(auth.apiTokenId, "Internal server error.");
    return errorResponse("Internal server error.", 500);
  }
}
