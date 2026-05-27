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

  if (!name || conversationIds.length === 0 || participantIds.length === 0) {
    throw new Error("Нужны название, хотя бы один диалог и участник.");
  }

  const scorecard = await prisma.scorecard.findFirst({
    where: { workspaceId: user.workspaceId, isActive: true },
    select: { id: true }
  });

  if (!scorecard) {
    throw new Error("Активная форма оценки не найдена.");
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
          create: conversationIds.map((conversationId) => ({ conversationId }))
        },
        participants: {
          create: participantIds.map((participantId) => ({ userId: participantId }))
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
          conversationIds,
          participantIds
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

  await prisma.calibrationSession.updateMany({
    where: { id, workspaceId: user.workspaceId },
    data: { status }
  });

  revalidatePath("/calibration");
}
