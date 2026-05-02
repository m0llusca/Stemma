import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { normalizeCustomConversation, normalizeCustomMessage } from "@/lib/normalizers/custom-api";
import { customConversationSchema } from "@/lib/validation/custom-api";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const payload = customConversationSchema.parse(body);
    const conversationData = normalizeCustomConversation(payload);

    const conversation = await prisma.conversation.upsert({
      where: {
        workspaceId_externalSource_externalId: {
          workspaceId: user.workspaceId,
          externalSource: payload.externalSource,
          externalId: payload.externalId
        }
      },
      create: {
        ...conversationData,
        workspaceId: user.workspaceId
      },
      update: conversationData
    });

    for (const message of payload.messages) {
      const messageData = normalizeCustomMessage(message);

      await prisma.message.upsert({
        where: {
          conversationId_externalId: {
            conversationId: conversation.id,
            externalId: message.externalId
          }
        },
        create: {
          ...messageData,
          conversationId: conversation.id
        },
        update: messageData
      });
    }

    return NextResponse.json({ id: conversation.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return errorResponse("Invalid custom conversation payload.", 400);
    }

    return errorResponse("Internal server error.", 500);
  }
}
