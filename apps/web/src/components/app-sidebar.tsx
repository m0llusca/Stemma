import Link from "next/link";
import { BarChart3, ClipboardCheck, Gauge, Settings } from "lucide-react";

const navItems = [
  { href: "/reviews", label: "Reviews", icon: ClipboardCheck },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/scorecards", label: "Scorecards", icon: Gauge },
  { href: "/admin/integrations", label: "Integrations", icon: Settings }
];

export function AppSidebar() {
  return (
    <aside className="border-r border-[#d7dce5] bg-white px-4 py-5">
      <div className="mb-7">
        <div className="text-lg font-semibold">Support QA</div>
        <div className="text-sm text-[#667085]">Manual quality review</div>
      </div>
      <nav className="grid gap-1">
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
