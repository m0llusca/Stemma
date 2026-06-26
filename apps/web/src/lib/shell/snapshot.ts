import type { RoleName } from "@prisma/client";
import { getCurrentUser } from "@/lib/current-user";
import { resolveWorkspaceBranding, type WorkspaceBranding } from "@/lib/ui-theme";

type ShellNavIcon = "dashboard" | "reviews" | "self-review" | "calibration" | "coaching" | "reports" | "admin";
type ShellNavGroup = "workspace" | "data" | "admin";

export type ShellNavItem = {
  href: string;
  label: string;
  icon: ShellNavIcon;
  group: ShellNavGroup;
};

type ShellNavDefinition = ShellNavItem & {
  roles: RoleName[];
};

const shellNavDefinitions: ShellNavDefinition[] = [
  { href: "/dashboard", label: "Дашборд", icon: "dashboard", group: "workspace", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT"] },
  { href: "/reviews", label: "Проверки", icon: "reviews", group: "workspace", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] },
  { href: "/self-review", label: "Моя обратная связь", icon: "self-review", group: "workspace", roles: ["SUPPORT_AGENT"] },
  { href: "/calibration", label: "Калибровка", icon: "calibration", group: "workspace", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] },
  { href: "/coaching", label: "Обучение", icon: "coaching", group: "workspace", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT"] },
  { href: "/reports", label: "Аналитика", icon: "reports", group: "data", roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] },
  { href: "/admin", label: "Настройки", icon: "admin", group: "admin", roles: ["ADMIN", "TEAM_LEAD"] }
];

export function buildShellNavItems({ role }: { role: RoleName }): ShellNavItem[] {
  return shellNavDefinitions
    .filter((item) => item.roles.includes(role))
    .map(({ roles: _roles, ...item }) => item);
}

export type ShellSnapshot = {
  user: {
    id: string;
    workspaceId: string;
    name: string;
    email: string;
    role: RoleName;
  };
  branding: WorkspaceBranding;
  navItems: ShellNavItem[];
};

export async function getShellSnapshot(): Promise<ShellSnapshot> {
  const user = await getCurrentUser();

  return {
    user: {
      id: user.id,
      workspaceId: user.workspaceId,
      name: user.name,
      email: user.email,
      role: user.role
    },
    branding: resolveWorkspaceBranding(user.workspace),
    navItems: buildShellNavItems({ role: user.role })
  };
}
