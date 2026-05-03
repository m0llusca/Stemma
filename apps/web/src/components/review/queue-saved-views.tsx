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
  const currentView = allViews.find((view) => currentHref === view.href);
  const customCount = savedViews.length;

  return (
    <details className="panel disclosure-panel overflow-hidden">
      <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#111827]">Быстрые виды</h2>
          <p className="mt-1 truncate text-sm text-[#64748b]">
            Сейчас: {currentView?.label ?? "Текущий фильтр"}{customCount > 0 ? ` · сохраненных: ${customCount}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold uppercase text-[#64748b]">Открыть</span>
      </summary>

      <div className="min-w-0 border-t border-[#d9e0ea] bg-white">
        <div className="signal-row px-4 py-3" aria-label="Быстрые представления очереди">
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
                      className="rounded px-1 text-xs font-semibold text-[#94a3b8] hover:bg-[#fff7ed] hover:text-[#b45309]"
                    >
                      ×
                    </button>
                  </form>
                ) : null}
              </span>
            );
          })}
        </div>
        <form action={createSavedQueueView} className="grid min-w-0 gap-2 border-t border-[#d9e0ea] bg-[#f8fafc] p-4">
          <input type="hidden" name="href" value={currentHref} />
          <label className="grid gap-1 text-sm font-medium text-[#334155]">
            Сохранить текущий вид
            <input name="name" placeholder="Например, 2ЛП критические" className="form-control" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#334155]">
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
      </div>
    </details>
  );
}
