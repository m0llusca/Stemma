import Link from "next/link";
import { BarChart3, ClipboardCheck, Gauge, History, Settings } from "lucide-react";

const navItems = [
  { href: "/reviews", label: "Проверки", icon: ClipboardCheck },
  { href: "/reports", label: "Отчеты", icon: BarChart3 },
  { href: "/admin/scorecards", label: "Скоркарты", icon: Gauge },
  { href: "/admin/integrations", label: "Интеграции", icon: Settings },
  { href: "/admin/audit", label: "Аудит", icon: History }
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
            <Link key={item.href} href={item.href} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#344054] hover:bg-[#eef4f4]">
              <Icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
