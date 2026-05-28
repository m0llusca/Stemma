import type { Prisma, RoleName, UserLifecycleStatus } from "@prisma/client";
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
type LocalCredentialLockClient = Pick<Prisma.TransactionClient, "$executeRawUnsafe" | "localCredential">;

const localCredentialAuthorizationSelect = {
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
} as const;

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

async function withLocalCredentialLock<T>(
  credentialId: string,
  operation: (tx: LocalCredentialLockClient, credential: LocalCredentialForAuthorization, now: Date) => Promise<T>
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `local_credential:${credentialId}`);
    const current = await tx.localCredential.findUnique({
      where: { id: credentialId },
      select: localCredentialAuthorizationSelect
    });

    if (!current) {
      return null;
    }

    return operation(tx, current, new Date());
  });
}

async function recordFailedLogin(tx: LocalCredentialLockClient, credential: LocalCredentialForAuthorization, now: Date) {
  const nextWindowStart = failedWindowStart(credential, now);
  const isExistingWindow = nextWindowStart === credential.failedLoginWindowStart;
  const failedLoginCount = isExistingWindow ? credential.failedLoginCount + 1 : 1;
  const lockedUntil = failedLoginCount >= failedLoginLimit ? new Date(now.getTime() + failedLoginLockoutMs) : null;

  await tx.localCredential.update({
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

async function resetFailedLoginState(tx: LocalCredentialLockClient, credential: LocalCredentialForAuthorization, now: Date) {
  await tx.localCredential.update({
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

  const matchingCredentials = await prisma.localCredential.findMany({
    where: {
      login
    },
    take: 2,
    select: localCredentialAuthorizationSelect
  });

  const [credential] = matchingCredentials;

  if (!credential || matchingCredentials.length > 1) {
    return null;
  }

  return withLocalCredentialLock(credential.id, async (tx, current, lockedAt) => {
    if (isLocked(current, lockedAt) || current.user.lifecycleStatus !== "ACTIVE") {
      return null;
    }

    const passwordMatches = await verifyLocalPassword({
      password,
      passwordHash: current.passwordHash,
      passwordSalt: current.passwordSalt,
      keyVersion: current.keyVersion
    });

    if (!passwordMatches) {
      await recordFailedLogin(tx, current, lockedAt);
      return null;
    }

    await resetFailedLoginState(tx, current, lockedAt);

    return authUserFromCredential(current);
  });
}
