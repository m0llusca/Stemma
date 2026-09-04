"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorizeLocalCredentials } from "@/auth/providers/local";
import { demoUserByIdWhere } from "@/lib/auth/demo-users";
import { loginFlashCookieName, loginFlashCookieOptions } from "@/lib/auth/login-flash";
import { normalizeLocalLogin } from "@/lib/auth/local-credentials";
import { resolvePostLoginPath, sanitizeReturnTo } from "@/lib/auth/role-home";
import { demoUserCookieOptions } from "@/lib/auth/cookies";
import { createAuthSession, setAuthSessionCookies } from "@/lib/auth/session";
import { currentUserCookieName, isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function loginErrorRedirect(returnTo: string): Promise<never> {
  const cookieStore = await cookies();
  const params = new URLSearchParams({
    returnTo: sanitizeReturnTo(returnTo)
  });

  cookieStore.set(loginFlashCookieName, "invalid_credentials", loginFlashCookieOptions());
  redirect(`/auth/login?${params.toString()}`);
}

export async function signInWithLocalCredentials(formData: FormData) {
  const login = normalizeLocalLogin(stringField(formData, "login"));
  const password = stringField(formData, "password");
  const returnTo = sanitizeReturnTo(stringField(formData, "returnTo"));

  if (!login || !password) {
    return loginErrorRedirect(returnTo);
  }

  const user = await authorizeLocalCredentials({ login, password });

  if (!user) {
    return loginErrorRedirect(returnTo);
  }

  const headerStore = await headers();
  const { token } = await createAuthSession({
    userId: user.id,
    userAgent: headerStore.get("user-agent")
  });
  const cookieStore = await cookies();
  await setAuthSessionCookies(cookieStore, token);
  cookieStore.delete(loginFlashCookieName);
  cookieStore.delete(currentUserCookieName);

  revalidatePath("/");
  redirect(resolvePostLoginPath(returnTo, user));
}

async function createDemoUserSession(formData: FormData, options: { requireDemoAuthEnabled: boolean; defaultReturnTo?: string }) {
  if (options.requireDemoAuthEnabled && !isDemoAuthEnabled()) {
    throw new Error("Демо-переключение пользователей отключено.");
  }

  const userId = stringField(formData, "userId");
  const returnTo = sanitizeReturnTo(stringField(formData, "returnTo") || options.defaultReturnTo || "/");

  const user = await prisma.user.findFirst({
    where: demoUserByIdWhere(userId),
    select: { id: true, workspaceId: true, role: true, name: true }
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
  await setAuthSessionCookies(cookieStore, token);
  cookieStore.delete(loginFlashCookieName);
  cookieStore.set(currentUserCookieName, user.id, demoUserCookieOptions(60 * 60 * 24 * 30));

  revalidatePath("/");
  redirect(resolvePostLoginPath(returnTo, user));
}

export async function signInWithDemoUser(formData: FormData) {
  return createDemoUserSession(formData, { requireDemoAuthEnabled: true });
}

export async function switchCurrentUser(formData: FormData) {
  return createDemoUserSession(formData, { requireDemoAuthEnabled: true, defaultReturnTo: "/dashboard" });
}
