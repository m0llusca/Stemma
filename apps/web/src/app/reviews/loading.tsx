import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewsLoading() {
  return (
    <div className="queue-loading" aria-busy="true" aria-label="Загрузка очереди проверок">
      <div className="queue-loading__kpis">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="queue-loading__kpi" />
        ))}
      </div>
      <Skeleton className="queue-loading__bar" />
      <div className="queue-loading__list panel">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="queue-loading__row">
            <Skeleton className="queue-loading__cell queue-loading__cell--check" />
            <Skeleton className="queue-loading__cell queue-loading__cell--chip" />
            <div className="queue-loading__cell-stack">
              <Skeleton className="queue-loading__cell queue-loading__cell--title" />
              <Skeleton className="queue-loading__cell queue-loading__cell--meta" />
            </div>
            <Skeleton className="queue-loading__cell queue-loading__cell--score" />
            <Skeleton className="queue-loading__cell queue-loading__cell--action" />
          </div>
        ))}
      </div>
    </div>
  );
}
