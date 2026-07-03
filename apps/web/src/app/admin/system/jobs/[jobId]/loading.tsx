import { PageSkeleton } from "@/components/loading-states";

export default function JobDetailsLoading() {
  return <PageSkeleton variant="admin" label="Загрузка: Детали задачи" />;
}
