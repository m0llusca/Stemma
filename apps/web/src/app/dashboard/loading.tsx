import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <section className="page-shell dashboard-shell" aria-busy="true" aria-label="Загрузка дашборда">
      <div className="command-center dashboard-hero">
        <div className="min-w-0" style={{ display: "grid", gap: 10 }}>
          <Skeleton style={{ width: 180, height: 14 }} />
          <Skeleton style={{ width: 260, height: 30 }} />
          <Skeleton style={{ width: "min(460px, 90%)", height: 16 }} />
        </div>
      </div>

      <section className="dashboard-metric-grid" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} style={{ width: "100%", height: 112 }} />
        ))}
      </section>

      <section className="dashboard-main-grid">
        <div className="dashboard-panel dashboard-panel--wide" style={{ display: "grid", gap: 12, padding: 16 }}>
          <Skeleton style={{ width: 200, height: 18 }} />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} style={{ width: "100%", height: 48 }} />
          ))}
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
        <div className="dashboard-panel" style={{ display: "grid", gap: 12, padding: 16 }}>
          <Skeleton style={{ width: 120, height: 18 }} />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} style={{ width: "100%", height: 40 }} />
          ))}
        </div>
        <div className="dashboard-panel" style={{ display: "grid", gap: 12, padding: 16 }}>
          <Skeleton style={{ width: 160, height: 18 }} />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} style={{ width: "100%", height: 48 }} />
          ))}
        </div>
      </section>
    </section>
  );
}
