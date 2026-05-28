import Credentials from "next-auth/providers/credentials";
import type { AppAuthUser } from "@/auth/types";
import { prisma } from "@/lib/db";

type EnterpriseAssertionCredentials = Partial<Record<"userId" | "providerId", unknown>>;

function credentialString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function authorizeEnterpriseAssertion(credentials: EnterpriseAssertionCredentials): Promise<AppAuthUser | null> {
  const userId = credentialString(credentials.userId);
  const providerId = credentialString(credentials.providerId);

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      name: true,
      role: true,
      lifecycleStatus: true
    }
  });

  if (!user || user.lifecycleStatus !== "ACTIVE") {
    return null;
  }

  if (providerId) {
    const provider = await prisma.identityProvider.findFirst({
      where: {
        id: providerId,
        workspaceId: user.workspaceId,
        status: "active"
      }
    });

    if (!provider) {
      return null;
    }
  }

  return {
    id: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

const enterpriseAssertionCredentials = {
  userId: { label: "User ID", type: "text" },
  providerId: { label: "Provider ID", type: "text" }
};

export const enterpriseAssertionProvider = {
  ...Credentials({
    id: "enterprise-assertion",
    name: "Enterprise assertion",
    credentials: enterpriseAssertionCredentials,
    authorize: authorizeEnterpriseAssertion
  }),
  id: "enterprise-assertion",
  name: "Enterprise assertion",
  credentials: enterpriseAssertionCredentials,
  authorize: authorizeEnterpriseAssertion
};
