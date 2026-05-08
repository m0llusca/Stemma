import type { RoleName } from "@prisma/client";
import { AppSidebarShell, type SidebarNavItem } from "@/components/app-sidebar-shell";
import { AuthRequiredError, getCurrentUser, getWorkspaceUsers } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { switchCurrentUser } from "@/lib/user-actions";

const navItems = [
  { href: "/reviews", label: "Проверки", icon: "reviews", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] },
  { href: "/self-review", label: "Моя обратная связь", icon: "self-review", roles: ["SUPPORT_AGENT"] },
  { href: "/calibration", label: "Калибровка", icon: "calibration", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] },
  { href: "/coaching", label: "Обучение", icon: "coaching", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT"] },
  { href: "/reports", label: "Аналитика", icon: "reports", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] },
  { href: "/admin", label: "Настройки", icon: "admin", roles: ["ADMIN", "TEAM_LEAD"] }
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

  const [users, openAppealCount] = await Promise.all([
    getWorkspaceUsers(currentUser.workspaceId),
    prisma.conversation.count({
      where: {
        workspaceId: currentUser.workspaceId,
        ...(currentUser.role === "SUPPORT_AGENT" ? { assigneeName: currentUser.name } : {}),
        reviews: {
          some: {
            reviewSource: "HUMAN",
            status: "FINALIZED",
            appealStatus: "open"
          }
        }
      }
    })
  ]);
  const visibleItems = navItems
    .filter((item) => canSeeNavItem(currentUser.role, item.roles))
    .map((item) => ({
      href: item.href,
      label: item.label,
      icon: item.icon,
      badge: (item.href === "/reviews" || item.href === "/self-review") && openAppealCount > 0 ? openAppealCount : undefined
    }));

  return (
    <AppSidebarShell items={visibleItems}>
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
    </AppSidebarShell>
  );
}
