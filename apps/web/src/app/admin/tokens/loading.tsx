import { PageSkeleton } from "@/components/loading-states";

export default function AdminTokensLoading() {
  return <PageSkeleton variant="admin" label="Загрузка API-токенов" />;
}
