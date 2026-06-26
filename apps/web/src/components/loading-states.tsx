import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type PageSkeletonVariant = "admin" | "dashboard" | "detail" | "reports" | "workspace";

type PageSkeletonProps = {
  label?: string;
  variant?: PageSkeletonVariant;
};

type StableEmptyStateProps = {
  action?: ReactNode;
  className?: string;
  description: ReactNode;
  eyebrow?: ReactNode;
  metric?: ReactNode;
  title: ReactNode;
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
      <section className="page-shell dashboard-shell" aria-busy="true" aria-label={label}>
        <div className="command-center dashboard-hero">
          <SkeletonTextBlock />
        </div>

        <section className="dashboard-metric-grid" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} style={{ width: "100%", height: 112 }} />
          ))}
        </section>

        <section className="dashboard-main-grid">
          <div className="dashboard-panel dashboard-panel--wide" style={{ display: "grid", gap: 12, padding: 16 }}>
            <Skeleton style={{ width: 200, height: 18 }} />
            <SkeletonRows rows={4} height={48} />
          </div>
          <div className="dashboard-panel" style={{ display: "grid", gap: 12, padding: 16 }}>
            <Skeleton style={{ width: 140, height: 18 }} />
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} style={{ width: "100%", height: 56 }} />
            ))}
          </div>
          <div className="dashboard-panel dashboard-panel--wide" style={{ display: "grid", gap: 12, padding: 16 }}>
            <Skeleton style={{ width: 200, height: 18 }} />
            <Skeleton style={{ width: "100%", height: 160 }} />
          </div>
        </section>
      </section>
    );
  }

  if (variant === "reports") {
    return (
      <section className="page-shell workspace-shell" aria-busy="true" aria-label={label}>
        <div className="panel" style={{ display: "grid", gap: 14, padding: 16 }}>
          <SkeletonTextBlock titleWidth={260} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} style={{ flex: "1 1 160px", height: 56, minWidth: 140 }} />
            ))}
          </div>
        </div>
        <div className="panel" style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: 16 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} style={{ flex: "1 1 140px", height: 48, minWidth: 120 }} />
          ))}
        </div>
        <div className="report-metrics-layout">
          <PanelRows rows={3} height={64} />
          <PanelRows rows={4} height={64} />
        </div>
        <PanelRows rows={4} height={72} />
      </section>
    );
  }

  if (variant === "admin") {
    return (
      <section className="page-shell admin-shell" aria-busy="true" aria-label={label}>
        <div className="command-center">
          <SkeletonTextBlock titleWidth={220} subtitleWidth="min(520px, 90%)" />
        </div>
        <section className="ops-metric-grid" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} style={{ width: "100%", height: 88 }} />
          ))}
        </section>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} style={{ width: 120, height: 36 }} />
          ))}
        </div>
        <section className="ops-panel" style={{ display: "grid", gap: 14 }}>
          <Skeleton style={{ width: 240, height: 22 }} />
          <PanelRows rows={4} height={80} />
        </section>
      </section>
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

export function StableEmptyState({ action, className = "", description, eyebrow, metric, title }: StableEmptyStateProps) {
  return (
    <section className={`panel stable-empty-state ${className}`.trim()}>
      {eyebrow ? <p className="stable-empty-state__eyebrow">{eyebrow}</p> : null}
      {metric ? <div className="stable-empty-state__metric">{metric}</div> : null}
      <div className="stable-empty-state__copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="stable-empty-state__action">{action}</div> : null}
    </section>
  );
}
