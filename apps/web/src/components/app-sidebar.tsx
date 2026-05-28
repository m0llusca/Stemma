import type { RoleName } from "@prisma/client";
import { AppSidebarShell, type SidebarNavItem } from "@/components/app-sidebar-shell";
import { AuthRequiredError, getCurrentUser, getWorkspaceUsers, isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { resolveWorkspaceBranding } from "@/lib/ui-theme";
import { switchCurrentUser } from "@/lib/user-actions";

const navItems = [
  { href: "/dashboard", label: "Дашборд", icon: "dashboard", group: "workspace", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT"] },
  { href: "/reviews", label: "Проверки", icon: "reviews", group: "workspace", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] },
  { href: "/self-review", label: "Моя обратная связь", icon: "self-review", group: "workspace", roles: ["SUPPORT_AGENT"] },
  { href: "/calibration", label: "Калибровка", icon: "calibration", group: "workspace", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] },
  { href: "/coaching", label: "Обучение", icon: "coaching", group: "workspace", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT"] },
  { href: "/reports", label: "Аналитика", icon: "reports", group: "data", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] },
  { href: "/admin", label: "Настройки", icon: "admin", group: "admin", roles: ["ADMIN", "TEAM_LEAD"] }
] satisfies Array<SidebarNavItem & { roles: string[] }>;

function canSeeNavItem(role: RoleName, roles: string[]) {
  return roles.includes(role);
}

export async function AppSidebar() {
  const currentUser = await getCurrentUser().catch((error: unknown) => {
    if (error instanceof AuthRequiredError) {
      return null;
    }

    throw error;
  });

  if (!currentUser) {
    return null;
  }

  const [users, finalizedAppealConversations, queuedCount, activeTrainingCount] = await Promise.all([
    getWorkspaceUsers(currentUser.workspaceId),
    prisma.conversation.findMany({
      where: {
        workspaceId: currentUser.workspaceId,
        ...(currentUser.role === "SUPPORT_AGENT" ? { assigneeName: currentUser.name } : {}),
        qaStatus: "FINALIZED"
      },
      select: {
        reviews: {
          where: {
            reviewSource: "HUMAN",
            status: "FINALIZED"
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 1,
          select: {
            appealStatus: true
          }
        }
      }
    }),
    prisma.conversation.count({
      where: {
        workspaceId: currentUser.workspaceId,
        ...(currentUser.role === "SUPPORT_AGENT" ? { assigneeName: currentUser.name } : {}),
        qaStatus: "QUEUED"
      }
    }),
    prisma.trainingAssignment.count({
      where: {
        workspaceId: currentUser.workspaceId,
        ...(currentUser.role === "SUPPORT_AGENT" ? { assigneeId: currentUser.id } : {}),
        status: { not: "done" }
      }
    })
  ]);
  const openAppealCount = finalizedAppealConversations.filter((conversation) => conversation.reviews[0]?.appealStatus === "open").length;
  const visibleItems = navItems
    .filter((item) => canSeeNavItem(currentUser.role, item.roles))
    .map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.icon,
      group: item.group,
      badge:
        item.href === "/reviews" && queuedCount > 0
          ? queuedCount
          : (item.href === "/self-review" && openAppealCount > 0) || (item.href === "/reviews" && openAppealCount > 0)
            ? openAppealCount
            : item.href === "/coaching" && activeTrainingCount > 0
              ? activeTrainingCount
              : undefined
    }));

  return (
    <AppSidebarShell items={visibleItems} branding={resolveWorkspaceBranding(currentUser.workspace)}>
      {isDemoAuthEnabled() ? (
        <form action={switchCurrentUser} className="soft-callout">
          <input type="hidden" name="returnTo" value="/reviews" />
          <label className="grid gap-1 text-xs font-semibold uppercase text-slate-400">
            Роль
            <select
              name="userId"
              defaultValue={currentUser.id}
              className="form-control min-w-0 text-sm font-medium normal-case"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <span className="text-xs font-medium normal-case text-slate-400">{roleLabels[currentUser.role]}</span>
          </label>
          <button type="submit" className="app-sidebar__role-submit action-button min-h-[36px] px-3 py-2 text-sm">
            Переключить
          </button>
        </form>
      ) : null}
    </AppSidebarShell>
  );
}
