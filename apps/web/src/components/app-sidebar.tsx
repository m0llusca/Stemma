import Link from "next/link";
import { BarChart3, BookOpenCheck, ClipboardCheck, Scale, Settings, UserCheck } from "lucide-react";
import type { RoleName } from "@prisma/client";
import { getCurrentUser, getWorkspaceUsers } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { switchCurrentUser } from "@/lib/user-actions";

const navItems = [
  { href: "/reviews", label: "Проверки", icon: ClipboardCheck, roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "VIEWER"] },
  { href: "/self-review", label: "Моя обратная связь", icon: UserCheck, roles: ["SUPPORT_AGENT"] },
  { href: "/calibration", label: "Калибровка", icon: Scale, roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] },
  { href: "/coaching", label: "Обучение", icon: BookOpenCheck, roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT"] },
  { href: "/reports", label: "Аналитика", icon: BarChart3, roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "VIEWER"] },
  { href: "/admin", label: "Настройки", icon: Settings, roles: ["ADMIN", "TEAM_LEAD"] }
];

function canSeeNavItem(role: RoleName, roles: string[]) {
  return roles.includes(role);
}

export async function AppSidebar() {
  const currentUser = await getCurrentUser();
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
  const visibleItems = navItems.filter((item) => canSeeNavItem(currentUser.role, item.roles));

  return (
    <aside className="app-sidebar px-4 py-5">
      <div className="app-sidebar__header mb-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-[#111827]">
            КК
          </span>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-white">КК поддержки</div>
            <div className="truncate text-sm text-slate-400">Ручная проверка</div>
          </div>
        </div>
      </div>
      <nav className="app-sidebar__nav grid gap-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-h-[42px] items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-slate-200 group-hover:bg-white/15">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="truncate">{item.label}</span>
              {(item.href === "/reviews" || item.href === "/self-review") && openAppealCount > 0 ? (
                <span className="app-sidebar__badge" aria-label={`Открытые апелляции: ${openAppealCount}`}>
                  {openAppealCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <form action={switchCurrentUser} className="soft-callout mt-6">
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
        <button type="submit" className="action-button action-button--primary min-h-[36px] px-3 py-2 text-sm">
          Переключить
        </button>
      </form>
    </aside>
  );
}
