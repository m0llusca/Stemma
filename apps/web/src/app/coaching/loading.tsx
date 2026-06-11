import { Skeleton } from "@/components/ui/skeleton";

export default function CoachingLoading() {
  return (
    <section className="page-shell workspace-shell" aria-busy="true" aria-label="Загрузка обучения">
      <div className="command-center command-center--split command-center--metrics coaching-command-center">
        <div className="min-w-0" style={{ display: "grid", gap: 10 }}>
          <Skeleton style={{ width: 160, height: 14 }} />
          <Skeleton style={{ width: 220, height: 30 }} />
          <Skeleton style={{ width: "min(440px, 90%)", height: 16 }} />
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Skeleton style={{ width: 150, height: 40 }} />
            <Skeleton style={{ width: 160, height: 40 }} />
          </div>
        </div>
        <div className="learning-metrics">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} style={{ width: 96, height: 56 }} />
          ))}
        </div>
      </div>

      <div className="panel" style={{ display: "grid", gap: 12, padding: 16 }}>
        <Skeleton style={{ width: 180, height: 14 }} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} style={{ flex: "1 1 200px", height: 80, minWidth: 180 }} />
          ))}
        </div>
      </div>

      <div className="panel" style={{ display: "grid", gap: 12, padding: 16 }}>
        <Skeleton style={{ width: 220, height: 18 }} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} style={{ flex: "1 1 120px", height: 36, minWidth: 100 }} />
          ))}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} style={{ width: "100%", height: 64 }} />
          ))}
        </div>
      </div>
    </section>
  );
}
