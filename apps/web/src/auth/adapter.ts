import type { UserLifecycleStatus } from "@prisma/client";
import type { Adapter, AdapterSession, AdapterUser } from "next-auth/adapters";
import "@/auth/types";
import { hashSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

type QcAdapterUser = {
  id: string;
  workspaceId: string;
  email: string;
  name: string | null;
  role: AdapterUser["role"];
  lifecycleStatus: UserLifecycleStatus;
};

type QcAuthSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  user: QcAdapterUser;
};

const adapterUserSelect = {
  id: true,
  workspaceId: true,
  email: true,
  name: true,
  role: true,
  lifecycleStatus: true
} as const;

const adapterRoles = new Set<AdapterUser["role"]>(["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"]);

function adapterString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function adapterRole(value: unknown): AdapterUser["role"] | null {
  return typeof value === "string" && adapterRoles.has(value as AdapterUser["role"]) ? (value as AdapterUser["role"]) : null;
}

function toAdapterSession(sessionToken: string, session: Pick<QcAuthSession, "userId" | "expiresAt">): AdapterSession {
  return {
    sessionToken,
    userId: session.userId,
    expires: session.expiresAt
  };
}

function toAdapterUser(user: QcAdapterUser): AdapterUser {
  return {
    id: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    emailVerified: null,
    name: user.name ?? user.email,
    role: user.role
  };
}

async function findActiveAdapterUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: adapterUserSelect
  });

  return user?.lifecycleStatus === "ACTIVE" ? user : null;
}

function normalizedEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function createQcAuthAdapter(): Adapter {
  return {
    async createUser(user) {
      const id = adapterString(user.id);
      const workspaceId = adapterString(user.workspaceId);
      const email = adapterString(user.email);
      const name = adapterString(user.name) || email;
      const role = adapterRole(user.role);

      if (!workspaceId) {
        throw new Error("Auth.js createUser requires workspaceId.");
      }

      if (!email) {
        throw new Error("Auth.js createUser requires email.");
      }

      if (!role) {
        throw new Error("Auth.js createUser requires role.");
      }

      const created = await prisma.user.create({
        data: {
          ...(id ? { id } : {}),
          workspaceId,
          email,
          name,
          role,
          lifecycleStatus: "ACTIVE"
        },
        select: adapterUserSelect
      });

      return toAdapterUser(created);
    },

    async getUser(id) {
      const user = await findActiveAdapterUser(id);
      return user ? toAdapterUser(user) : null;
    },

    async getUserByEmail(email) {
      const normalized = normalizedEmail(email);

      if (!normalized) {
        return null;
      }

      const users = await prisma.user.findMany({
        where: {
          email: normalized,
          lifecycleStatus: "ACTIVE"
        },
        take: 2,
        select: adapterUserSelect
      });

      return users.length === 1 ? toAdapterUser(users[0]!) : null;
    },

    async getUserByAccount(account) {
      const identity = await prisma.externalIdentity.findUnique({
        where: {
          providerId_providerSubject: {
            providerId: account.provider,
            providerSubject: account.providerAccountId
          }
        },
        include: {
          user: {
            select: adapterUserSelect
          }
        }
      });

      if (!identity || identity.user.lifecycleStatus !== "ACTIVE") {
        return null;
      }

      return toAdapterUser(identity.user);
    },

    async linkAccount(account) {
      const providerId = adapterString(account.provider);
      const providerSubject = adapterString(account.providerAccountId);

      if (!providerId || !providerSubject) {
        throw new Error("Auth.js account provider and providerAccountId are required.");
      }

      const user = await findActiveAdapterUser(account.userId);

      if (!user) {
        throw new Error("Auth.js account user is missing or inactive.");
      }

      const provider = await prisma.identityProvider.findFirst({
        where: {
          id: providerId,
          workspaceId: user.workspaceId,
          status: "active"
        },
        select: { id: true }
      });

      if (!provider) {
        throw new Error("Auth.js account provider is missing or inactive for the user's workspace.");
      }

      const existingIdentity = await prisma.externalIdentity.findUnique({
        where: {
          providerId_providerSubject: {
            providerId: provider.id,
            providerSubject
          }
        },
        select: { userId: true }
      });

      if (existingIdentity && existingIdentity.userId !== user.id) {
        throw new Error("Auth.js account is already linked to another user.");
      }

      await prisma.externalIdentity.upsert({
        where: {
          providerId_providerSubject: {
            providerId: provider.id,
            providerSubject
          }
        },
        update: {
          userId: user.id,
          email: user.email,
          displayName: user.name,
          disabledAt: null
        },
        create: {
          userId: user.id,
          providerId: provider.id,
          providerSubject,
          email: user.email,
          displayName: user.name
        }
      });

      return account;
    },

    async updateUser(user) {
      const existing = await findActiveAdapterUser(user.id);

      if (!existing) {
        throw new Error("Auth.js updateUser user is missing or inactive.");
      }

      if (user.workspaceId && user.workspaceId !== existing.workspaceId) {
        throw new Error("Auth.js updateUser cannot move users between workspaces.");
      }

      const email = user.email === undefined ? undefined : normalizedEmail(user.email);
      const name = user.name === undefined ? undefined : adapterString(user.name);
      const role = user.role === undefined ? undefined : adapterRole(user.role);

      if (user.email !== undefined && !email) {
        throw new Error("Auth.js updateUser requires a non-empty email.");
      }

      if (user.name !== undefined && !name) {
        throw new Error("Auth.js updateUser requires a non-empty name.");
      }

      if (user.role !== undefined && !role) {
        throw new Error("Auth.js updateUser received an invalid role.");
      }

      const updateData: { email?: string; name?: string; role?: AdapterUser["role"] } = {};

      if (email !== undefined) {
        updateData.email = email;
      }

      if (name !== undefined) {
        updateData.name = name;
      }

      if (role !== undefined && role !== null) {
        updateData.role = role;
      }

      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: updateData,
        select: adapterUserSelect
      });

      return toAdapterUser(updated);
    },

    async createSession(session) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          workspaceId: true,
          lifecycleStatus: true
        }
      });

      if (!user || user.lifecycleStatus !== "ACTIVE") {
        throw new Error("Auth.js user is missing or inactive.");
      }

      await prisma.authSession.create({
        data: {
          workspaceId: user.workspaceId,
          userId: user.id,
          sessionTokenHash: hashSessionToken(session.sessionToken),
          expiresAt: session.expires,
          status: "ACTIVE"
        }
      });

      return session;
    },

    async getSessionAndUser(sessionToken) {
      const now = new Date();
      const session = await prisma.authSession.findUnique({
        where: { sessionTokenHash: hashSessionToken(sessionToken) },
        include: {
          user: {
            select: adapterUserSelect
          }
        }
      });

      if (!session || session.status !== "ACTIVE") {
        return null;
      }

      if (session.expiresAt <= now) {
        await prisma.authSession.update({
          where: { id: session.id },
          data: { status: "EXPIRED" }
        });
        return null;
      }

      if (session.user.lifecycleStatus !== "ACTIVE") {
        await prisma.authSession.update({
          where: { id: session.id },
          data: {
            status: "REVOKED",
            revokedAt: now
          }
        });
        return null;
      }

      await prisma.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: now }
      });

      return {
        session: toAdapterSession(sessionToken, session),
        user: toAdapterUser(session.user)
      };
    },

    async updateSession(session) {
      const now = new Date();
      const sessionTokenHash = hashSessionToken(session.sessionToken);
      const updateResult = await prisma.authSession.updateMany({
        where: {
          sessionTokenHash,
          status: "ACTIVE",
          expiresAt: { gt: now },
          user: {
            lifecycleStatus: "ACTIVE"
          }
        },
        data: {
          ...(session.expires ? { expiresAt: session.expires } : {}),
          lastSeenAt: now
        }
      });

      if (updateResult.count === 0) {
        return null;
      }

      const currentSession = await prisma.authSession.findUnique({
        where: { sessionTokenHash },
        include: {
          user: {
            select: adapterUserSelect
          }
        }
      });

      if (
        !currentSession ||
        currentSession.status !== "ACTIVE" ||
        currentSession.expiresAt <= now ||
        currentSession.user.lifecycleStatus !== "ACTIVE"
      ) {
        return null;
      }

      return toAdapterSession(session.sessionToken, currentSession);
    },

    async deleteSession(sessionToken) {
      await prisma.authSession.updateMany({
        where: {
          sessionTokenHash: hashSessionToken(sessionToken),
          status: "ACTIVE"
        },
        data: {
          status: "REVOKED",
          revokedAt: new Date()
        }
      });
    }
  };
}
