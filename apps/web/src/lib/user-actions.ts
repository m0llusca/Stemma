"use server";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { demoUserByIdWhere } from "@/lib/auth/demo-users";
import { normalizeLocalLogin, verifyLocalPassword } from "@/lib/auth/local-credentials";
import { authCookieOptions, demoUserCookieOptions } from "@/lib/auth/cookies";
import { createAuthSession, sessionCookieName } from "@/lib/auth/session";
import { currentUserCookieName, isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeReturnTo(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/reviews";
}

function loginErrorRedirect(returnTo: string): never {
  const params = new URLSearchParams({
    returnTo: safeReturnTo(returnTo),
    authError: "Неверный логин или пароль."
  });

  redirect(`/auth/login?${params.toString()}`);
}

export async function signInWithLocalCredentials(formData: FormData) {
  const login = normalizeLocalLogin(stringField(formData, "login"));
  const password = stringField(formData, "password");
  const returnTo = safeReturnTo(stringField(formData, "returnTo"));

  if (!login || !password) {
    loginErrorRedirect(returnTo);
  }

  const credential = await prisma.localCredential.findFirst({
    where: {
      login
    },
    include: {
      user: true
    }
  });

  if (!credential) {
    loginErrorRedirect(returnTo);
  }

  const passwordMatches = await verifyLocalPassword({
    password,
    passwordHash: credential.passwordHash,
    passwordSalt: credential.passwordSalt,
    keyVersion: credential.keyVersion
  });

  if (!passwordMatches) {
    loginErrorRedirect(returnTo);
  }

  const headerStore = await headers();
  const { token } = await createAuthSession({
    userId: credential.userId,
    userAgent: headerStore.get("user-agent")
  });
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, authCookieOptions(60 * 60 * 12));
  cookieStore.delete(currentUserCookieName);

  await prisma.localCredential.update({
    where: { id: credential.id },
    data: { lastLoginAt: new Date() }
  });

  revalidatePath("/");
  redirect(returnTo);
}

export async function switchCurrentUser(formData: FormData) {
  if (!isDemoAuthEnabled()) {
    throw new Error("Демо-переключение пользователей отключено.");
  }

  const userId = stringField(formData, "userId");
  const returnTo = stringField(formData, "returnTo") || "/reviews";

  const user = await prisma.user.findFirst({
    where: demoUserByIdWhere(userId),
    select: { id: true, workspaceId: true, role: true }
  });

  if (!user) {
    throw new Error("Демо-пользователь не найден.");
  }

  const demoProvider = await prisma.identityProvider.findFirst({
    where: {
      workspaceId: user.workspaceId,
      type: "DEMO",
      status: "active"
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

  const resolvedReturnTo = user.role === "SUPPORT_AGENT" && (returnTo === "/" || returnTo === "/reviews") ? "/self-review" : returnTo;

  revalidatePath("/");
  redirect(resolvedReturnTo);
}
