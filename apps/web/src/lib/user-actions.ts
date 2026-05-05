"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authCookieOptions, demoUserCookieOptions } from "@/lib/auth/cookies";
import { createAuthSession, sessionCookieName } from "@/lib/auth/session";
import { currentUserCookieName, isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function switchCurrentUser(formData: FormData) {
  if (!isDemoAuthEnabled()) {
    throw new Error("Демо-переключение пользователей отключено.");
  }

  const userId = stringField(formData, "userId");
  const returnTo = stringField(formData, "returnTo") || "/reviews";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, workspaceId: true }
  });

  if (!user) {
    throw new Error("Пользователь не найден.");
  }

  const demoProvider = await prisma.identityProvider.findFirst({
    where: {
      workspaceId: user.workspaceId,
      type: "DEMO",
      slug: "demo"
    },
    select: { id: true }
  });
  const headerStore = await headers();
  const { token } = await createAuthSession({
    userId: user.id,
    providerId: demoProvider?.id,
    userAgent: headerStore.get("user-agent")
  });
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, authCookieOptions(60 * 60 * 12));
  cookieStore.set(currentUserCookieName, user.id, demoUserCookieOptions(60 * 60 * 24 * 30));

  revalidatePath("/");
  redirect(returnTo);
}
