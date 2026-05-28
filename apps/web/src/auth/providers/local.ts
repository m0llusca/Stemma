import type { RoleName, UserLifecycleStatus } from "@prisma/client";
import Credentials from "next-auth/providers/credentials";
import type { AppAuthUser } from "@/auth/types";
import { normalizeLocalLogin, verifyLocalPassword } from "@/lib/auth/local-credentials";
import { prisma } from "@/lib/db";

const failedLoginLimit = 5;
const failedLoginWindowMs = 15 * 60 * 1000;
const failedLoginLockoutMs = 15 * 60 * 1000;

type LocalCredentialsInput = Partial<Record<"login" | "password", unknown>> | undefined;

type LocalCredentialForAuthorization = {
  id: string;
  passwordHash: string;
  passwordSalt: string;
  keyVersion: string;
  failedLoginCount: number;
  failedLoginWindowStart: Date | null;
  lockedUntil: Date | null;
  user: {
    id: string;
    workspaceId: string;
    email: string;
    name: string;
    role: RoleName;
    lifecycleStatus: UserLifecycleStatus;
  };
};

function stringCredential(credentials: LocalCredentialsInput, key: "login" | "password") {
  const value = credentials?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function isLocked(credential: LocalCredentialForAuthorization, now: Date) {
  return Boolean(credential.lockedUntil && credential.lockedUntil > now);
}

function failedWindowStart(credential: LocalCredentialForAuthorization, now: Date) {
  const windowStart = credential.failedLoginWindowStart;

  if (!windowStart || now.getTime() - windowStart.getTime() >= failedLoginWindowMs) {
    return now;
  }

  return windowStart;
}

async function recordFailedLogin(credential: LocalCredentialForAuthorization, now: Date) {
  const nextWindowStart = failedWindowStart(credential, now);
  const isExistingWindow = nextWindowStart === credential.failedLoginWindowStart;
  const failedLoginCount = isExistingWindow ? credential.failedLoginCount + 1 : 1;
  const lockedUntil = failedLoginCount >= failedLoginLimit ? new Date(now.getTime() + failedLoginLockoutMs) : null;

  await prisma.localCredential.update({
    where: {
      id: credential.id
    },
    data: {
      failedLoginCount,
      failedLoginWindowStart: nextWindowStart,
      lastFailedLoginAt: now,
      lockedUntil
    }
  });
}

async function resetFailedLoginState(credential: LocalCredentialForAuthorization, now: Date) {
  await prisma.localCredential.update({
    where: {
      id: credential.id
    },
    data: {
      lastLoginAt: now,
      failedLoginCount: 0,
      failedLoginWindowStart: null,
      lastFailedLoginAt: null,
      lockedUntil: null
    }
  });
}

function authUserFromCredential(credential: LocalCredentialForAuthorization): AppAuthUser {
  return {
    id: credential.user.id,
    workspaceId: credential.user.workspaceId,
    email: credential.user.email,
    name: credential.user.name,
    role: credential.user.role
  };
}

export async function authorizeLocalCredentials(credentials: LocalCredentialsInput): Promise<AppAuthUser | null> {
  const login = normalizeLocalLogin(stringCredential(credentials, "login"));
  const password = stringCredential(credentials, "password");

  if (!login || !password) {
    return null;
  }

  const credential = await prisma.localCredential.findFirst({
    where: {
      login
    },
    select: {
      id: true,
      passwordHash: true,
      passwordSalt: true,
      keyVersion: true,
      failedLoginCount: true,
      failedLoginWindowStart: true,
      lockedUntil: true,
      user: {
        select: {
          id: true,
          workspaceId: true,
          email: true,
          name: true,
          role: true,
          lifecycleStatus: true
        }
      }
    }
  });

  if (!credential) {
    return null;
  }

  const now = new Date();

  if (isLocked(credential, now)) {
    return null;
  }

  const passwordMatches = await verifyLocalPassword({
    password,
    passwordHash: credential.passwordHash,
    passwordSalt: credential.passwordSalt,
    keyVersion: credential.keyVersion
  });

  if (!passwordMatches) {
    await recordFailedLogin(credential, now);
    return null;
  }

  if (credential.user.lifecycleStatus !== "ACTIVE") {
    return null;
  }

  await resetFailedLoginState(credential, now);

  return authUserFromCredential(credential);
}

export const localCredentialsProvider = Credentials({
  id: "credentials",
  name: "Local credentials",
  credentials: {
    login: { label: "Login", type: "text" },
    password: { label: "Password", type: "password" }
  },
  authorize: authorizeLocalCredentials
});
