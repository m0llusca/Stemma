"use server";

import type { RoleName } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { hashLocalPassword, normalizeLocalLogin } from "@/lib/auth/local-credentials";
import { assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const roles = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"] as const satisfies readonly RoleName[];
type ConfigurableRole = (typeof roles)[number];

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalField(formData: FormData, key: string) {
  return stringField(formData, key) || null;
}

function roleField(value: string) {
  if (!roles.includes(value as ConfigurableRole)) {
    throw new Error("Некорректная роль пользователя.");
  }

  return value as ConfigurableRole;
}

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

function assertEmail(value: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error("Укажите корректный email пользователя.");
  }
}

function assertLogin(value: string) {
  if (!/^[a-z0-9._@+-]{2,120}$/.test(value)) {
    throw new Error("Логин должен быть от 2 до 120 символов: латиница, цифры, точка, дефис, плюс или @.");
  }
}

function revalidateUserAdmin() {
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/access");
}

export async function createLocalUser(formData: FormData) {
  const actor = await requireCurrentUserPermission("users:manage");
  await assertCanPersistSettings(actor);
  const name = stringField(formData, "name");
  const email = normalizedEmail(stringField(formData, "email"));
  const login = normalizeLocalLogin(stringField(formData, "login") || email);
  const password = stringField(formData, "password");
  const role = roleField(stringField(formData, "role"));
  const teamName = optionalField(formData, "teamName");
  const supportLine = optionalField(formData, "supportLine");

  if (name.length < 2) {
    throw new Error("Укажите имя пользователя.");
  }

  assertEmail(email);
  assertLogin(login);

  if (password.length < 8) {
    throw new Error("Пароль должен быть не короче 8 символов.");
  }

  const passwordData = await hashLocalPassword(password);

  await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: {
        workspaceId_email: {
          workspaceId: actor.workspaceId,
          email
        }
      },
      select: { id: true }
    });

    if (existingUser) {
      throw new Error("Пользователь с таким email уже существует.");
    }

    const existingCredential = await tx.localCredential.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        login
      },
      select: { id: true }
    });

    if (existingCredential) {
      throw new Error("Пользователь с таким логином уже существует.");
    }

    const created = await tx.user.create({
      data: {
        workspaceId: actor.workspaceId,
        email,
        name,
        role,
        teamName,
        supportLine
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    await tx.localCredential.create({
      data: {
        workspaceId: actor.workspaceId,
        userId: created.id,
        login,
        passwordHash: passwordData.passwordHash,
        passwordSalt: passwordData.passwordSalt,
        keyVersion: passwordData.keyVersion
      }
    });

    await auditLog(
      {
        workspaceId: actor.workspaceId,
        actorId: actor.id,
        action: "auth.local_user_created",
        targetType: "user",
        targetId: created.id,
        metadata: {
          email: created.email,
          login,
          role: created.role,
          teamName,
          supportLine
        }
      },
      tx
    );
  });

  revalidateUserAdmin();
}

export async function updateUserAccess(formData: FormData) {
  const actor = await requireCurrentUserPermission("users:manage");
  await assertCanPersistSettings(actor);
  const userId = stringField(formData, "userId");
  const role = roleField(stringField(formData, "role"));
  const teamName = optionalField(formData, "teamName");
  const supportLine = optionalField(formData, "supportLine");

  if (!userId) {
    throw new Error("Пользователь не найден.");
  }

  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findFirst({
      where: {
        id: userId,
        workspaceId: actor.workspaceId
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    if (!target) {
      throw new Error("Пользователь не относится к текущему рабочему пространству.");
    }

    if (target.id === actor.id && target.role === "ADMIN" && role !== "ADMIN") {
      throw new Error("Нельзя снять роль администратора с собственной учетной записи.");
    }

    if (target.role === "ADMIN" && role !== "ADMIN") {
      const adminCount = await tx.user.count({
        where: {
          workspaceId: actor.workspaceId,
          role: "ADMIN"
        }
      });

      if (adminCount <= 1) {
        throw new Error("Нельзя снять роль администратора с последней учетной записи администратора.");
      }
    }

    const updated = await tx.user.update({
      where: { id: target.id },
      data: {
        role,
        teamName,
        supportLine
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    await auditLog(
      {
        workspaceId: actor.workspaceId,
        actorId: actor.id,
        action: "auth.user_access_updated",
        targetType: "user",
        targetId: updated.id,
        metadata: {
          previousRole: target.role,
          role: updated.role,
          teamName,
          supportLine
        }
      },
      tx
    );
  });

  revalidateUserAdmin();
}
