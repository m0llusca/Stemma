import { AppNavShell } from "@/components/app-nav-shell";
import { AuthRequiredError, getWorkspaceUsers, isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getShellSnapshot, type ShellSnapshot } from "@/lib/shell/snapshot";
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
      pulseItems={pulseItems}
      user={{ name: snapshot.user.name, email: snapshot.user.email }}
      demoSwitcher={demoSwitcher}
      branding={snapshot.branding}
    />
  );
}

async function getNavPulseItems(user: ShellSnapshot["user"]) {
  const conversationScope = user.role === "SUPPORT_AGENT" ? { assigneeName: user.name } : {};
  const [queuedCount, highRiskCount, trainingCount] = await Promise.all([
    prisma.conversation.count({
      where: { workspaceId: user.workspaceId, qaStatus: "QUEUED", ...conversationScope }
    }),
    prisma.review.count({
      where: {
        workspaceId: user.workspaceId,
        status: "FINALIZED",
        reviewSource: "HUMAN",
        findings: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } },
        ...(user.role === "SUPPORT_AGENT" ? { conversation: { assigneeName: user.name } } : {})
      }
    }),
    prisma.trainingAssignment.count({
      where: {
        workspaceId: user.workspaceId,
        status: { not: "done" },
        ...(user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {})
      }
    })
  ]);

  return [
    { href: "/reviews?qaStatus=QUEUED", label: "Очередь", value: queuedCount },
    { href: "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL", label: "Риск", value: highRiskCount, tone: "risk" as const },
    { href: "/coaching", label: "Обучение", value: trainingCount, tone: trainingCount > 0 ? ("warning" as const) : ("neutral" as const) }
  ];
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
