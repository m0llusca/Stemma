"use server";

import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { demoUserByIdWhere } from "@/lib/auth/demo-users";
import { loginFlashCookieName, loginFlashCookieOptions } from "@/lib/auth/login-flash";
import { normalizeLocalLogin, verifyLocalPassword } from "@/lib/auth/local-credentials";
import { authCookieOptions, demoUserCookieOptions } from "@/lib/auth/cookies";
import { createAuthSession, sessionCookieName } from "@/lib/auth/session";
import { currentUserCookieName, isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const primaryWorkspaceName = "Контроль качества";
const localLoginFailureWindowMs = 15 * 60_000;
const localLoginLockMs = 15 * 60_000;
const localLoginMaxFailures = 5;

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

function isCredentialLocked(credential: { lockedUntil?: Date | null }, now = new Date()) {
  return Boolean(credential.lockedUntil && credential.lockedUntil > now);
}

async function recordFailedLocalCredentialAttempt(
  credential: {
    id: string;
    failedLoginCount?: number | null;
    failedLoginWindowStart?: Date | null;
  },
  now = new Date()
) {
  const windowStart =
    credential.failedLoginWindowStart && now.getTime() - credential.failedLoginWindowStart.getTime() <= localLoginFailureWindowMs
      ? credential.failedLoginWindowStart
      : now;
  const failedLoginCount = windowStart === credential.failedLoginWindowStart ? (credential.failedLoginCount ?? 0) + 1 : 1;

  await prisma.localCredential.update({
    where: { id: credential.id },
    data: {
      failedLoginCount,
      failedLoginWindowStart: windowStart,
      lastFailedLoginAt: now,
      lockedUntil: failedLoginCount >= localLoginMaxFailures ? new Date(now.getTime() + localLoginLockMs) : null
    }
  });
}

async function getOrCreatePrimaryWorkspace(tx: Prisma.TransactionClient) {
  const existingWorkspace = await tx.workspace.findFirst({
    where: {
      identityProviders: {
        none: {
          type: "DEMO"
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true
    }
  });

  if (existingWorkspace) {
    return existingWorkspace;
  }

  return tx.workspace.create({
    data: {
      name: primaryWorkspaceName
    },
    select: {
      id: true
    }
  });
}

async function ensureLocalUserWorkspace(input: {
  credentialId: string;
  login: string;
  userId: string;
  userEmail: string;
  workspaceId: string;
}) {
  await prisma.$transaction(async (tx) => {
    const [workspaceHasDemoProvider, userHasDemoIdentity] = await Promise.all([
      tx.identityProvider.count({
        where: {
          workspaceId: input.workspaceId,
          type: "DEMO"
        }
      }),
      tx.externalIdentity.count({
        where: {
          userId: input.userId,
          provider: {
            type: "DEMO"
          }
        }
      })
    ]);

    if (workspaceHasDemoProvider === 0 || userHasDemoIdentity > 0) {
      return;
    }

    const targetWorkspace = await getOrCreatePrimaryWorkspace(tx);

    if (targetWorkspace.id === input.workspaceId) {
      return;
    }

    const [emailConflict, loginConflict] = await Promise.all([
      tx.user.findUnique({
        where: {
          workspaceId_email: {
            workspaceId: targetWorkspace.id,
            email: input.userEmail
          }
        },
        select: {
          id: true
        }
      }),
      tx.localCredential.findFirst({
        where: {
          workspaceId: targetWorkspace.id,
          login: input.login,
          userId: {
            not: input.userId
          }
        },
        select: {
          id: true
        }
      })
    ]);

    if (emailConflict && emailConflict.id !== input.userId) {
      throw new Error("Локальный пользователь с таким email уже существует в основном рабочем пространстве.");
    }

    if (loginConflict) {
      throw new Error("Локальный пользователь с таким логином уже существует в основном рабочем пространстве.");
    }

    await tx.user.update({
      where: {
        id: input.userId
      },
      data: {
        workspaceId: targetWorkspace.id
      }
    });
    await tx.localCredential.update({
      where: {
        id: input.credentialId
      },
      data: {
        workspaceId: targetWorkspace.id
      }
    });
    await tx.authSession.updateMany({
      where: {
        userId: input.userId
      },
      data: {
        workspaceId: targetWorkspace.id
      }
    });
  });
}

export async function signInWithLocalCredentials(formData: FormData) {
  const login = normalizeLocalLogin(stringField(formData, "login"));
  const password = stringField(formData, "password");
  const returnTo = safeReturnTo(stringField(formData, "returnTo"));

  if (!login || !password) {
    return loginErrorRedirect(returnTo);
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
    return loginErrorRedirect(returnTo);
  }

  if (isCredentialLocked(credential)) {
    return loginErrorRedirect(returnTo);
  }

  const passwordMatches = await verifyLocalPassword({
    password,
    passwordHash: credential.passwordHash,
    passwordSalt: credential.passwordSalt,
    keyVersion: credential.keyVersion
  });

  if (!passwordMatches) {
    await recordFailedLocalCredentialAttempt(credential);
    return loginErrorRedirect(returnTo);
  }

  const headerStore = await headers();
  await ensureLocalUserWorkspace({
    credentialId: credential.id,
    login: credential.login,
    userId: credential.userId,
    userEmail: credential.user.email,
    workspaceId: credential.user.workspaceId
  });
  const { token } = await createAuthSession({
    userId: credential.userId,
    userAgent: headerStore.get("user-agent")
  });
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, authCookieOptions(60 * 60 * 12));
  cookieStore.delete(loginFlashCookieName);
  cookieStore.delete(currentUserCookieName);

  await prisma.localCredential.update({
    where: { id: credential.id },
    data: {
      failedLoginCount: 0,
      failedLoginWindowStart: null,
      lastFailedLoginAt: null,
      lastLoginAt: new Date(),
      lockedUntil: null
    }
  });

  revalidatePath("/");
  redirect(returnTo);
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
