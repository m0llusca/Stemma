import { AppNavShell } from "@/components/app-nav-shell";
import { hasPermission } from "@/lib/auth/permissions";
import { AuthRequiredError, getWorkspaceUsers, isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getShellSnapshot, type ShellSnapshot } from "@/lib/shell/snapshot";
import { visibleTopNavAreas } from "@/lib/shell/navigation";
import { roleLabels } from "@/lib/labels";

export async function AppNav() {
  const snapshot = await getShellSnapshot().catch((error: unknown) => {
    if (error instanceof AuthRequiredError) {
      return null;
    }

    throw error;
  });

  if (!snapshot) {
    return null;
  }

  const [pulseItems, demoSwitcher] = await Promise.all([
    getNavPulseItems(snapshot.user),
    isDemoAuthEnabled() ? getDemoSwitcher(snapshot.user) : Promise.resolve(null)
  ]);

  return (
    <AppNavShell
      navigation={snapshot.navigation}
      areas={visibleTopNavAreas(snapshot.user.role)}
      canTakeNextCase={hasPermission(snapshot.user.role, "reviews:write")}
      pulseItems={pulseItems}
      user={{ name: snapshot.user.name, email: snapshot.user.email }}
      demoSwitcher={demoSwitcher}
      branding={snapshot.branding}
    />
  );
}

type PulseItem = {
  href: string;
  label: string;
  value: number;
  tone?: "neutral" | "risk" | "warning";
};

/**
 * Каждый pulse-item гейтится правом своей цели — иначе роль (например VIEWER без
 * прав, достижимая через SSO-маппинг) видит счётчики и упирается в «Недостаточно
 * прав» по клику. Скрытые счётчики не запрашиваем: если права нет — запроса нет.
 */
async function getNavPulseItems(user: ShellSnapshot["user"]): Promise<PulseItem[]> {
  const canReadReviews = hasPermission(user.role, "reviews:read");
  const canManageTraining = hasPermission(user.role, "training:manage");
  // SUPPORT_AGENT скоупит счётчики по назначенным на него диалогам через
  // assigneeId (устойчивее к тёзкам, чем прежний assigneeName).
  const conversationScope = user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {};

  const [queuedCount, highRiskCount, trainingCount] = await Promise.all([
    canReadReviews
      ? prisma.conversation.count({
          where: { workspaceId: user.workspaceId, qaStatus: "QUEUED", ...conversationScope }
        })
      : Promise.resolve(0),
    canReadReviews
      ? prisma.review.count({
          where: {
            workspaceId: user.workspaceId,
            status: "FINALIZED",
            reviewSource: "HUMAN",
            findings: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } },
            ...(user.role === "SUPPORT_AGENT" ? { conversation: { assigneeId: user.id } } : {})
          }
        })
      : Promise.resolve(0),
    canManageTraining
      ? prisma.trainingAssignment.count({
          where: {
            workspaceId: user.workspaceId,
            status: { not: "done" },
            ...(user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {})
          }
        })
      : Promise.resolve(0)
  ]);

  const items: PulseItem[] = [];
  if (canReadReviews) {
    items.push({ href: "/reviews?qaStatus=QUEUED", label: "Очередь", value: queuedCount });
    items.push({ href: "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL", label: "Риск", value: highRiskCount, tone: "risk" });
  }
  if (canManageTraining) {
    items.push({ href: "/coaching", label: "Обучение", value: trainingCount, tone: trainingCount > 0 ? "warning" : "neutral" });
  }

  return items;
}

async function getDemoSwitcher(user: ShellSnapshot["user"]) {
  const users = await getWorkspaceUsers(user.workspaceId);

  return {
    currentUserId: user.id,
    roleLabel: roleLabels[user.role],
    users: users.map((workspaceUser) => ({
      id: workspaceUser.id,
      name: workspaceUser.name
    }))
  };
}
