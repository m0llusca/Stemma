import { Skeleton } from "@/components/ui/skeleton";

type PageSkeletonVariant = "admin" | "dashboard" | "detail" | "reports" | "workspace";

type PageSkeletonProps = {
  label?: string;
  variant?: PageSkeletonVariant;
};

function SkeletonTextBlock({ titleWidth = 260, subtitleWidth = "min(460px, 90%)" }: { titleWidth?: number; subtitleWidth?: string }) {
  return (
    <div className="min-w-0" style={{ display: "grid", gap: 10 }}>
      <Skeleton style={{ width: 160, height: 14 }} />
      <Skeleton style={{ width: titleWidth, height: 30 }} />
      <Skeleton style={{ width: subtitleWidth, height: 16 }} />
    </div>
  );
}

/**
 * Mirrors the PageShell header: an eyebrow + title + description stack on the
 * left and a right-aligned primary-action placeholder. Used by the
 * dashboard/reports/admin skeletons so the loading state matches the loaded
 * screen's contextual header.
 */
function PageShellHeaderSkeleton({
  titleWidth = 220,
  subtitleWidth = "min(520px, 90%)",
  actionWidth = 150
}: {
  titleWidth?: number;
  subtitleWidth?: string;
  actionWidth?: number;
}) {
  return (
    <header className="page-shell__header">
      <SkeletonTextBlock titleWidth={titleWidth} subtitleWidth={subtitleWidth} />
      <div className="page-shell__actions">
        <Skeleton style={{ width: actionWidth, height: 38 }} />
      </div>
    </header>
  );
}

function MetricSkeletons({ count = 4, className = "learning-metrics" }: { count?: number; className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} style={{ width: 96, height: 56 }} />
      ))}
    </div>
  );
}

function PanelRows({ rows = 5, height = 56 }: { rows?: number; height?: number }) {
  return (
    <div className="panel" style={{ display: "grid", gap: 10, padding: 16 }}>
      <SkeletonRows rows={rows} height={height} />
    </div>
  );
}

function SkeletonRows({ rows = 5, height = 56 }: { rows?: number; height?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} style={{ width: "100%", height }} />
      ))}
    </>
  );
}

export function PageSkeleton({ label = "Загрузка страницы", variant = "workspace" }: PageSkeletonProps) {
  if (variant === "dashboard") {
    return (
      <div className="page-shell dashboard-shell" aria-busy="true" aria-label={label}>
        <PageShellHeaderSkeleton titleWidth={180} actionWidth={168} />

        <div className="page-shell__content">
          <Skeleton style={{ width: "100%", height: 72 }} />

          <section className="dashboard-metric-grid" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} style={{ width: "100%", height: 112 }} />
            ))}
          </section>

          <section className="dashboard-main-grid" aria-hidden="true">
            <div className="dashboard-panel" style={{ display: "grid", gap: 12, padding: 16 }}>
              <Skeleton style={{ width: 140, height: 18 }} />
              <SkeletonRows rows={3} height={56} />
            </div>
            <div className="dashboard-panel dashboard-panel--wide" style={{ display: "grid", gap: 12, padding: 16 }}>
              <Skeleton style={{ width: 200, height: 18 }} />
              <Skeleton style={{ width: "100%", height: 160 }} />
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (variant === "reports") {
    return (
      <div className="page-shell" aria-busy="true" aria-label={label}>
        <PageShellHeaderSkeleton titleWidth={240} actionWidth={120} />

        <nav className="page-shell__tabs" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} style={{ width: 104, height: 34 }} />
          ))}
        </nav>

        <div className="page-shell__content">
          <div className="report-period-controls" aria-hidden="true">
            <div className="report-period-controls__form">
              <Skeleton style={{ width: "100%", height: 38 }} />
              <Skeleton style={{ width: "100%", height: 38 }} />
              <Skeleton style={{ width: "100%", height: 38 }} />
            </div>
            <Skeleton style={{ width: 150, height: 38 }} />
          </div>

          <Skeleton style={{ width: "100%", height: 64 }} />

          <div className="report-kpi-row" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="report-kpi-tile" style={{ display: "grid", gap: 8, padding: "12px 14px" }}>
                <Skeleton style={{ width: 96, height: 11 }} />
                <Skeleton style={{ width: 64, height: 26 }} />
              </div>
            ))}
          </div>

          <div className="panel" style={{ display: "grid", gap: 12, padding: 16 }}>
            <Skeleton style={{ width: 200, height: 18 }} />
            <Skeleton style={{ width: "100%", height: 220 }} />
          </div>

          <div className="panel" style={{ display: "grid", gap: 10, padding: 16 }}>
            <Skeleton style={{ width: 180, height: 18 }} />
            <SkeletonRows rows={5} height={52} />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "admin") {
    return (
      <div className="page-shell" aria-busy="true" aria-label={label}>
        <PageShellHeaderSkeleton titleWidth={200} actionWidth={196} />

        <div className="page-shell__content">
          <div className="admin-frame" aria-hidden="true">
            <aside className="admin-frame__rail" style={{ display: "grid", gap: 18, padding: 14 }}>
              <Skeleton style={{ width: "100%", height: 34 }} />
              {Array.from({ length: 3 }).map((_, group) => (
                <div key={group} style={{ display: "grid", gap: 8 }}>
                  <Skeleton style={{ width: 96, height: 12 }} />
                  {Array.from({ length: 3 }).map((_, item) => (
                    <Skeleton key={item} style={{ width: "100%", height: 30 }} />
                  ))}
                </div>
              ))}
            </aside>
            <div className="admin-frame__content" style={{ display: "grid", gap: 14 }}>
              <Skeleton style={{ width: "100%", height: 72 }} />
              <div className="ops-panel admin-status-panel" style={{ display: "grid", gap: 12, padding: 16 }}>
                <Skeleton style={{ width: 180, height: 18 }} />
                <SkeletonRows rows={9} height={44} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <section className="page-shell workspace-shell" aria-busy="true" aria-label={label}>
        <div className="command-center command-center--split">
          <SkeletonTextBlock titleWidth={320} />
          <MetricSkeletons count={3} />
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <PanelRows rows={7} height={68} />
          <PanelRows rows={5} height={72} />
        </div>
      </section>
    );
  }

  return (
    <section className="page-shell workspace-shell" aria-busy="true" aria-label={label}>
      <div className="command-center command-center--split command-center--metrics">
        <SkeletonTextBlock titleWidth={280} />
        <MetricSkeletons className="learning-metrics review-queue-metrics" />
      </div>
      <div className="panel" style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: 16 }}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} style={{ flex: "1 1 160px", height: 40, minWidth: 140 }} />
        ))}
      </div>
      <PanelRows rows={8} />
    </section>
  );
}
