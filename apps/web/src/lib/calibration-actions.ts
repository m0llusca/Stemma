"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { canManageCalibration, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function dateField(formData: FormData, key: string) {
  const value = stringField(formData, key);
  return value ? new Date(`${value}T12:00:00.000Z`) : undefined;
}

function assertCalibrationStatusTransition(fromStatus: string, toStatus: string) {
  if (fromStatus === "archived" && toStatus === "completed") {
    throw new Error("Архивную калибровку нельзя завершить. Верните ее в работу или оставьте в архиве.");
  }

  if (fromStatus === "completed" && toStatus === "completed") {
    throw new Error("Калибровка уже завершена.");
  }

  if (fromStatus === "archived" && toStatus === "archived") {
    throw new Error("Калибровка уже в архиве.");
  }
}

export async function createCalibrationSession(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageCalibration(user.role)) {
    throw new Error("Нет прав на калибровку.");
  }

  const name = stringField(formData, "name");
  const notes = stringField(formData, "notes");
  const conversationIds = formData
    .getAll("conversationId")
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const participantIds = formData
    .getAll("participantId")
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const uniqueConversationIds = Array.from(new Set(conversationIds));
  const uniqueParticipantIds = Array.from(new Set(participantIds));

  if (!name || uniqueConversationIds.length === 0 || uniqueParticipantIds.length === 0) {
    throw new Error("Нужны название, хотя бы один диалог и участник.");
  }

  const [scorecard, workspaceConversationCount, workspaceParticipantCount] = await Promise.all([
    prisma.scorecard.findFirst({
      where: { workspaceId: user.workspaceId, isActive: true },
      select: { id: true }
    }),
    prisma.conversation.count({
      where: {
        id: { in: uniqueConversationIds },
        workspaceId: user.workspaceId
      }
    }),
    prisma.user.count({
      where: {
        id: { in: uniqueParticipantIds },
        workspaceId: user.workspaceId
      }
    })
  ]);

  if (!scorecard) {
    throw new Error("Активная форма оценки не найдена.");
  }

  if (workspaceConversationCount !== uniqueConversationIds.length) {
    throw new Error("Диалоги калибровки должны принадлежать текущему рабочему пространству.");
  }

  if (workspaceParticipantCount !== uniqueParticipantIds.length) {
    throw new Error("Участники калибровки должны принадлежать текущему рабочему пространству.");
  }

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.calibrationSession.create({
      data: {
        workspaceId: user.workspaceId,
        ownerId: user.id,
        scorecardId: scorecard.id,
        name,
        status: "active",
        dueAt: dateField(formData, "dueAt"),
        notes,
        items: {
          create: uniqueConversationIds.map((conversationId) => ({ conversationId }))
        },
        participants: {
          create: uniqueParticipantIds.map((participantId) => ({ userId: participantId }))
        }
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "calibration.session_created",
        targetType: "calibration",
        targetId: created.id,
        metadata: {
          conversationIds: uniqueConversationIds,
          participantIds: uniqueParticipantIds
        }
      },
      tx
    );

    return created;
  });

  revalidatePath("/calibration");
  redirect(`/calibration?session=${session.id}`);
}

export async function updateCalibrationSessionStatus(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageCalibration(user.role)) {
    throw new Error("Нет прав на калибровку.");
  }

  const id = stringField(formData, "id");
  const status = stringField(formData, "status");

  if (!id || !["active", "completed", "archived"].includes(status)) {
    throw new Error("Некорректный статус калибровки.");
  }

  const session = await prisma.calibrationSession.findFirst({
    where: {
      id,
      workspaceId: user.workspaceId
    },
    select: {
      id: true,
      status: true
    }
  });

  if (!session) {
    throw new Error("Калибровка не найдена.");
  }

  assertCalibrationStatusTransition(session.status, status);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.calibrationSession.updateMany({
      where: { id, workspaceId: user.workspaceId, status: session.status },
      data: { status }
    });

    if (updated.count === 0) {
      throw new Error("Статус калибровки уже изменен другим пользователем. Обновите страницу и повторите действие.");
    }

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "calibration.session_status_updated",
        targetType: "calibration",
        targetId: session.id,
        metadata: {
          fromStatus: session.status,
          toStatus: status
        }
      },
      tx
    );
  });

  revalidatePath("/calibration");
}
