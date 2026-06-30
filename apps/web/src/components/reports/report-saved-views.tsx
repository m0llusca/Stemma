import Link from "next/link";
import { Chip } from "@/components/ui/chip";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { createSavedReportView, deleteSavedReportView } from "@/lib/saved-report-view-actions";
import type { SavedReportViewSummary } from "@/lib/saved-report-view";

// Saved report views: mirror of QueueSavedViews on the reviews surface. Pins a
// few preset entry points, then lists the user's saved /reports?... URLs (period
// + filters baked into currentHref). Create posts to createSavedReportView with
// the current href; each saved row carries a delete form. Tokens only; the chip
// tones restyle with the theme.
export function ReportSavedViews({
  currentHref,
  savedViews = []
}: {
  currentHref: string;
  savedViews?: SavedReportViewSummary[];
}) {
  const presets: Array<{ label: string; href: string; tone: "neutral" | "info" | "accent" }> = [
    { label: "Обзор", href: "/reports?view=overview", tone: "neutral" },
    { label: "Исполнение", href: "/reports?view=performance", tone: "info" },
    { label: "Процесс", href: "/reports?view=process", tone: "info" },
    { label: "Разрезы", href: "/reports?view=details", tone: "info" }
  ];

  const allViews: Array<{ label: string; href: string; tone: "neutral" | "info" | "accent"; id?: string }> = [
    ...presets,
    ...savedViews.map((view) => ({
      label: view.name,
      href: view.href,
      tone: view.scope === "shared" ? ("accent" as const) : ("info" as const),
      id: view.id
    }))
  ];
  const currentView = allViews.find((view) => currentHref === view.href);

  return (
    <details className="report-saved-views">
      <summary className="report-saved-views__summary">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Сохранённые виды</h2>
          <p className="mt-1 truncate text-sm text-[var(--text-muted)]">
            {currentView?.label ?? "Текущий период и фильтры"}
          </p>
        </div>
        <span className="report-saved-views__summary-action">
          <span className="report-saved-views__summary-closed">Раскрыть</span>
          <span className="report-saved-views__summary-open">Скрыть</span>
        </span>
      </summary>

      <div className="report-saved-views__content">
        <div className="signal-row px-4 py-3" aria-label="Сохранённые представления отчётов">
          {allViews.map((view, index) => {
            const isActive = currentHref === view.href;

            return (
              <span key={view.id ?? `preset-${index}-${view.href}`} className="inline-flex items-center gap-1">
                <Link href={view.href}>
                  <Chip tone={isActive ? "accent" : view.tone} size="sm">
                    {view.label}
                  </Chip>
                </Link>
                {view.id ? (
                  <form action={deleteSavedReportView}>
                    <input type="hidden" name="id" value={view.id} />
                    <button
                      type="submit"
                      aria-label={`Удалить представление ${view.label}`}
                      title="Удалить представление"
                      className="icon-action-button icon-action-button--danger h-7 w-7 text-sm"
                    >
                      ×
                    </button>
                  </form>
                ) : null}
              </span>
            );
          })}
        </div>
        <form
          action={createSavedReportView}
          className="grid min-w-0 gap-2 border-t border-[var(--border)] bg-[var(--panel-muted)] p-4"
        >
          <input type="hidden" name="href" value={currentHref} />
          <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
            Сохранить текущий вид
            <input name="name" required placeholder="Например, 2ЛП за квартал" className="form-control" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
            Доступ
            <select name="scope" defaultValue="private" className="form-control">
              <option value="private">Только мне</option>
              <option value="shared">Всем</option>
            </select>
          </label>
          <ValidatedSubmitButton className="action-button">Сохранить</ValidatedSubmitButton>
        </form>
      </div>
    </details>
  );
}
