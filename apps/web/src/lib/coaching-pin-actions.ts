"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { canManageReviewWorkflow, canSaveReviewDraft, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const MAX_PIN_LENGTH = 2000;

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function loadPinForMutation(pinId: string, workspaceId: string) {
  const pin = await prisma.coachingPin.findFirst({
    where: { id: pinId, workspaceId },
    select: { id: true, authorId: true, conversationId: true, resolvedAt: true }
  });

  if (!pin) {
    throw new Error("Заметка коучинга не найдена.");
  }

  return pin;
}

export async function createCoachingPin(formData: FormData) {
  const user = await getCurrentUser();

  if (!canSaveReviewDraft(user.role)) {
    throw new Error("Нет прав на добавление заметок коучинга.");
  }

  const conversationId = stringField(formData, "conversationId");
  const messageId = stringField(formData, "messageId");
  const body = stringField(formData, "body").slice(0, MAX_PIN_LENGTH);

  if (!body) {
    throw new Error("Заметка коучинга не может быть пустой.");
  }

  // The message must belong to the named conversation inside the caller's workspace.
  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId, conversation: { workspaceId: user.workspaceId } },
    select: { id: true }
  });

  if (!message) {
    throw new Error("Сообщение для заметки не найдено.");
  }

  const pin = await prisma.coachingPin.create({
    data: {
      workspaceId: user.workspaceId,
      conversationId,
      messageId,
      authorId: user.id,
      body
    },
    select: { id: true }
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "coaching.pin.created",
    targetType: "coaching_pin",
    targetId: pin.id,
    metadata: { conversationId, messageId }
  });

  revalidatePath(`/reviews/${conversationId}`);
}

export async function toggleCoachingPinResolved(formData: FormData) {
  const user = await getCurrentUser();
  const pinId = stringField(formData, "pinId");
  const pin = await loadPinForMutation(pinId, user.workspaceId);

  if (pin.authorId !== user.id && !canManageReviewWorkflow(user.role)) {
    throw new Error("Нет прав на изменение этой заметки коучинга.");
  }

  const nextResolvedAt = pin.resolvedAt ? null : new Date();

  await prisma.coachingPin.update({
    where: { id: pin.id },
    data: { resolvedAt: nextResolvedAt }
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: nextResolvedAt ? "coaching.pin.resolved" : "coaching.pin.reopened",
    targetType: "coaching_pin",
    targetId: pin.id,
    metadata: { conversationId: pin.conversationId }
  });

  revalidatePath(`/reviews/${pin.conversationId}`);
}

export async function deleteCoachingPin(formData: FormData) {
  const user = await getCurrentUser();
  const pinId = stringField(formData, "pinId");
  const pin = await loadPinForMutation(pinId, user.workspaceId);

  if (pin.authorId !== user.id && !canManageReviewWorkflow(user.role)) {
    throw new Error("Нет прав на удаление этой заметки коучинга.");
  }

  await prisma.coachingPin.delete({ where: { id: pin.id } });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "coaching.pin.deleted",
    targetType: "coaching_pin",
    targetId: pin.id,
    metadata: { conversationId: pin.conversationId }
  });

  revalidatePath(`/reviews/${pin.conversationId}`);
}
