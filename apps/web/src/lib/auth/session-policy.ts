import type { IdentityProviderType, UserLifecycleStatus } from "@prisma/client";
import { isDemoAuthEnabled } from "@/lib/auth/demo";

export const sessionProviderSelect = { type: true, workspaceId: true, status: true } as const;

type SessionPolicyInput = {
  workspaceId: string;
  providerId: string | null;
  expiresAt: Date;
  user: { workspaceId: string; lifecycleStatus: UserLifecycleStatus };
  provider: { type: IdentityProviderType; workspaceId: string; status: string } | null;
};

/** Both session readers enforce the same lifecycle, tenant, and provider gates. */
export function sessionInvalidation(session: SessionPolicyInput, now: Date) {
  if (session.expiresAt <= now) {
    return { status: "EXPIRED" as const };
  }

  if (
    session.user.lifecycleStatus !== "ACTIVE" ||
    session.workspaceId !== session.user.workspaceId ||
    (session.providerId && (
      !session.provider ||
      session.provider.workspaceId !== session.workspaceId ||
      session.provider.status !== "active" ||
      (session.provider.type === "DEMO" && !isDemoAuthEnabled())
    ))
  ) {
    return { status: "REVOKED" as const, revokedAt: now };
  }

  return null;
}
