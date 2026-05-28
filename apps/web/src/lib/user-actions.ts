"use server";

import { AuthError } from "next-auth";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn } from "../../auth";
import { demoUserByIdWhere } from "@/lib/auth/demo-users";
import { loginFlashCookieName, loginFlashCookieOptions } from "@/lib/auth/login-flash";
import { normalizeLocalLogin } from "@/lib/auth/local-credentials";
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

async function loginErrorRedirect(returnTo: string): Promise<never> {
  const cookieStore = await cookies();
  const params = new URLSearchParams({
    returnTo: safeReturnTo(returnTo)
  });

  cookieStore.set(loginFlashCookieName, "invalid_credentials", loginFlashCookieOptions());
  redirect(`/auth/login?${params.toString()}`);
}

export async function signInWithLocalCredentials(formData: FormData) {
  const login = normalizeLocalLogin(stringField(formData, "login"));
  const password = stringField(formData, "password");
  const redirectTo = safeReturnTo(stringField(formData, "returnTo"));

  if (!login || !password) {
    return loginErrorRedirect(redirectTo);
  }

  try {
    await signIn("credentials", { login, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return loginErrorRedirect(redirectTo);
    }

    throw error;
  }
}

async function createDemoUserSession(formData: FormData, options: { requireDemoAuthEnabled: boolean }) {
  if (options.requireDemoAuthEnabled && !isDemoAuthEnabled()) {
    throw new Error("Демо-переключение пользователей отключено.");
  }

  const userId = stringField(formData, "userId");
  const returnTo = safeReturnTo(stringField(formData, "returnTo"));

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
  cookieStore.delete(loginFlashCookieName);
  cookieStore.set(currentUserCookieName, user.id, demoUserCookieOptions(60 * 60 * 24 * 30));

  const resolvedReturnTo = user.role === "SUPPORT_AGENT" && (returnTo === "/" || returnTo === "/reviews") ? "/self-review" : returnTo;

  revalidatePath("/");
  redirect(resolvedReturnTo);
}

export async function signInWithDemoUser(formData: FormData) {
  return createDemoUserSession(formData, { requireDemoAuthEnabled: true });
}

export async function switchCurrentUser(formData: FormData) {
  return createDemoUserSession(formData, { requireDemoAuthEnabled: true });
}
