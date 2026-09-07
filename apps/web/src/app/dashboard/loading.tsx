import { PageSkeleton } from "@/components/loading-states";
import { resolveDashboardSkeletonVariant } from "@/lib/dashboard/page-skeleton-variant";

export default async function DashboardLoading() {
  const variant = await resolveDashboardSkeletonVariant();
  return <PageSkeleton variant={variant} label="Загрузка дашборда" />;
}
