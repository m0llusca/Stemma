import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";

type SavedView = {
  label: string;
  href: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
};

export function QueueSavedViews({
  currentAssigneeName,
  currentHref
}: {
  currentAssigneeName: string;
  currentHref: string;
}) {
  const views: SavedView[] = [
    { label: "Все", href: "/reviews", tone: "neutral" },
    { label: "Мои проверки", href: `/reviews?qaAssignee=${encodeURIComponent(currentAssigneeName)}`, tone: "info" },
    { label: "Просрочено", href: "/reviews?due=overdue", tone: "danger" },
    { label: "Критические", href: "/reviews?process=critical", tone: "danger" },
    { label: "Переответы", href: "/reviews?process=reanswer", tone: "warning" },
    { label: "Апелляции", href: "/reviews?process=appeal", tone: "warning" },
    { label: "Негативный CSAT", href: "/reviews?csatBucket=NEGATIVE", tone: "warning" }
  ];

  return (
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="Быстрые представления очереди">
      {views.map((view) => {
        const isActive = currentHref === view.href;

        return (
          <Link key={view.href} href={view.href}>
            <StatusChip tone={isActive ? "accent" : view.tone} size="sm">
              {view.label}
            </StatusChip>
          </Link>
        );
      })}
    </nav>
  );
}
