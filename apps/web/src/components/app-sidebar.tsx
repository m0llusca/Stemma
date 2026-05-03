import Link from "next/link";
import {
  BarChart3,
  BookOpenCheck,
  ClipboardCheck,
  Scale,
  Settings,
  UserCheck
} from "lucide-react";
import type { RoleName } from "@prisma/client";
import { getCurrentUser, getWorkspaceUsers } from "@/lib/current-user";
import { roleLabels } from "@/lib/labels";
import { switchCurrentUser } from "@/lib/user-actions";

const navItems = [
  { href: "/reviews", label: "Проверки", icon: ClipboardCheck, roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "VIEWER"] },
  { href: "/self-review", label: "Самооценка", icon: UserCheck, roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT"] },
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
  const users = await getWorkspaceUsers(currentUser.workspaceId);
  const visibleItems = navItems.filter((item) => canSeeNavItem(currentUser.role, item.roles));

  return (
    <aside className="app-sidebar border-r border-[#d7dce5] bg-white px-4 py-5">
      <div className="app-sidebar__header mb-7">
        <div className="text-lg font-semibold">Контроль качества</div>
        <div className="text-sm text-[#667085]">Ручная проверка поддержки</div>
      </div>
      <nav className="app-sidebar__nav grid gap-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-[40px] items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[#344054] hover:bg-[#eef4f4] hover:text-[#0b4f52]"
            >
              <Icon size={17} aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <form action={switchCurrentUser} className="mt-6 grid gap-2 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
        <input type="hidden" name="returnTo" value="/reviews" />
        <label className="grid gap-1 text-xs font-semibold uppercase text-[#667085]">
          Роль
          <select
            name="userId"
            defaultValue={currentUser.id}
            className="min-w-0 rounded border border-[#d7dce5] bg-white px-2 py-2 text-sm font-medium normal-case text-[#17202a]"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {roleLabels[user.role]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded bg-[#116466] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
          Переключить
        </button>
      </form>
    </aside>
  );
}
