import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewsLoading() {
  return (
    <section className="page-shell workspace-shell" aria-busy="true" aria-label="Загрузка очереди проверок">
      <div className="command-center command-center--split command-center--metrics review-command-center">
        <div className="min-w-0" style={{ display: "grid", gap: 10 }}>
          <Skeleton style={{ width: 160, height: 14 }} />
          <Skeleton style={{ width: 280, height: 30 }} />
          <Skeleton style={{ width: "min(420px, 90%)", height: 16 }} />
        </div>
        <div className="learning-metrics review-queue-metrics">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} style={{ width: 96, height: 56 }} />
          ))}
        </div>
      </div>

      <div className="panel" style={{ display: "grid", gap: 12, padding: 16 }}>
        <Skeleton style={{ width: 200, height: 14 }} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} style={{ flex: "1 1 200px", height: 72, minWidth: 180 }} />
          ))}
        </div>
      </div>

      <div className="panel" style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: 16 }}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} style={{ flex: "1 1 160px", height: 40, minWidth: 140 }} />
        ))}
      </div>

      <div className="panel" style={{ display: "grid", gap: 10, padding: 16 }}>
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} style={{ width: "100%", height: 56 }} />
        ))}
      </div>
    </section>
  );
}
