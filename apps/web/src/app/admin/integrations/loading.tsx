import { Skeleton } from "@/components/ui/skeleton";

export default function AdminIntegrationsLoading() {
  return (
    <section className="page-shell admin-shell" aria-busy="true" aria-label="Загрузка интеграций">
      <div className="command-center">
        <div className="min-w-0" style={{ display: "grid", gap: 10 }}>
          <Skeleton style={{ width: 180, height: 14 }} />
          <Skeleton style={{ width: 220, height: 30 }} />
          <Skeleton style={{ width: "min(520px, 90%)", height: 16 }} />
          <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} style={{ width: 150, height: 40 }} />
            ))}
          </div>
        </div>
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
        <div style={{ display: "grid", gap: 8 }}>
          <Skeleton style={{ width: 120, height: 14 }} />
          <Skeleton style={{ width: 240, height: 22 }} />
          <Skeleton style={{ width: 200, height: 14 }} />
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} style={{ width: "100%", height: 96 }} />
          ))}
        </div>
      </section>
    </section>
  );
}
