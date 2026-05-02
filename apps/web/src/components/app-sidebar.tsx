import Link from "next/link";
import { BarChart3, ClipboardCheck, Gauge, History, KeyRound, Settings } from "lucide-react";

const navItems = [
  { href: "/reviews", label: "Проверки", icon: ClipboardCheck },
  { href: "/reports", label: "Аналитика", icon: BarChart3 },
  { href: "/admin/scorecards", label: "Формы оценки", icon: Gauge },
  { href: "/admin/integrations", label: "Интеграции", icon: Settings },
  { href: "/admin/tokens", label: "API-доступ", icon: KeyRound },
  { href: "/admin/audit", label: "Журнал", icon: History }
];

export function AppSidebar() {
  return (
    <aside className="app-sidebar border-r border-[#d7dce5] bg-white px-4 py-5">
      <div className="app-sidebar__header mb-7">
        <div className="text-lg font-semibold">Контроль качества</div>
        <div className="text-sm text-[#667085]">Ручная проверка поддержки</div>
      </div>
      <nav className="app-sidebar__nav grid gap-1">
        {navItems.map((item) => {
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
    </aside>
  );
}
