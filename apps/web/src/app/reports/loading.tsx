import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <section className="page-shell workspace-shell" aria-busy="true" aria-label="Загрузка аналитики качества">
      <div className="panel" style={{ display: "grid", gap: 14, padding: 16 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <Skeleton style={{ width: 160, height: 14 }} />
          <Skeleton style={{ width: 260, height: 30 }} />
        </div>
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
        <div className="panel" style={{ display: "grid", gap: 14, padding: 16 }}>
          <Skeleton style={{ width: 180, height: 16 }} />
          <Skeleton style={{ width: 120, height: 48 }} />
          <Skeleton style={{ width: "100%", height: 140 }} />
        </div>
        <div className="panel" style={{ display: "grid", gap: 12, padding: 16 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} style={{ width: "100%", height: 64 }} />
          ))}
        </div>
      </div>

      <div className="reports-main-grid">
        <div className="panel" style={{ display: "grid", gap: 12, padding: 16 }}>
          <Skeleton style={{ width: 220, height: 16 }} />
          <Skeleton style={{ width: "100%", height: 200 }} />
        </div>
      </div>
    </section>
  );
}
