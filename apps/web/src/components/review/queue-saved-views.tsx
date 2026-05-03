import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";
import { createSavedQueueView, deleteSavedQueueView } from "@/lib/queue-view-actions";

type SavedView = {
  label: string;
  href: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
};

export function QueueSavedViews({
  currentAssigneeName,
  currentHref,
  savedViews = []
}: {
  currentAssigneeName: string;
  currentHref: string;
  savedViews?: Array<{ id: string; name: string; href: string; scope: string }>;
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

  const allViews: Array<SavedView & { id?: string }> = [
    ...views,
    ...savedViews.map((view) => ({
      label: view.name,
      href: view.href,
      tone: view.scope === "workspace" ? ("accent" as const) : ("info" as const),
      id: view.id
    }))
  ];

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#d7dce5] bg-white px-4 py-3" aria-label="Быстрые представления очереди">
        {allViews.map((view, index) => {
          const isActive = currentHref === view.href;

          return (
            <span key={view.id ?? `default-${index}-${view.href}`} className="inline-flex items-center gap-1">
              <Link href={view.href}>
                <StatusChip tone={isActive ? "accent" : view.tone} size="sm">
                  {view.label}
                </StatusChip>
              </Link>
              {view.id ? (
                <form action={deleteSavedQueueView}>
                  <input type="hidden" name="id" value={view.id} />
                  <button
                    type="submit"
                    title="Удалить представление"
                    className="rounded px-1 text-xs font-semibold text-[#98a2b3] hover:bg-[#fff4ed] hover:text-[#b54708]"
                  >
                    ×
                  </button>
                </form>
              ) : null}
            </span>
          );
        })}
      </div>
      <form action={createSavedQueueView} className="grid gap-2 bg-[#fbfcfd] p-4 md:grid-cols-[minmax(220px,1fr)_160px_auto] md:items-end">
        <input type="hidden" name="href" value={currentHref} />
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Сохранить текущий вид
          <input name="name" placeholder="Например, 2ЛП критические" className="form-control" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Доступ
          <select name="scope" defaultValue="private" className="form-control">
            <option value="private">Только мне</option>
            <option value="workspace">Всем</option>
          </select>
        </label>
        <button type="submit" className="action-button">
          Сохранить
        </button>
      </form>
    </section>
  );
}
