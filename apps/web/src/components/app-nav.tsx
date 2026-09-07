import { Suspense } from "react";
import { AppNavShell } from "@/components/app-nav-shell";
import { hasPermission } from "@/lib/auth/permissions";
import { roleHomePath } from "@/lib/auth/role-home";
import { AuthRequiredError, getWorkspaceUsers, isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getShellSnapshot, type ShellSnapshot } from "@/lib/shell/snapshot";
import { visibleTopNavAreas } from "@/lib/shell/navigation";
import { roleLabels } from "@/lib/labels";

/**
 * Header-height placeholder while `useSearchParams` resolves inside AppNavShell.
 * Keeps layout.tsx statically renderable and avoids a CLS jump on Analyst inbox.
 */
function AppNavFallback() {
  return (
    <header
      className="sticky top-0 z-20 min-h-14 border-b border-border bg-background"
      aria-busy="true"
      aria-label="Глобальная навигация"
      data-slot="app-nav"
    />
  );
}

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

  // VIEWER has no product areas or ⌘K destinations. Full chrome over
  // `/auth/pending-access` reads as a broken empty shell, not a holding state.
  // The page already shows identity + logout.
  if (snapshot.user.role === "VIEWER") {
    return null;
  }

  const [pulseItems, demoSwitcher] = await Promise.all([
    getNavPulseItems(snapshot.user),
    isDemoAuthEnabled() ? getDemoSwitcher(snapshot.user) : Promise.resolve(null)
  ]);

  return (
    <Suspense fallback={<AppNavFallback />}>
      <AppNavShell
        navigation={snapshot.navigation}
        areas={visibleTopNavAreas(snapshot.user.role, { name: snapshot.user.name })}
        homeHref={roleHomePath(snapshot.user.role, { name: snapshot.user.name })}
        canTakeNextCase={hasPermission(snapshot.user.role, "reviews:write")}
        pulseItems={pulseItems}
        user={{ name: snapshot.user.name, email: snapshot.user.email }}
        demoSwitcher={demoSwitcher}
        branding={snapshot.branding}
      />
    </Suspense>
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
  const canAccessTraining =
    hasPermission(user.role, "training:manage") || hasPermission(user.role, "training:consume");
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
    canAccessTraining
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
  if (canAccessTraining) {
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
