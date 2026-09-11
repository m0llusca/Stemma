import { PageSkeleton } from "@/components/loading-states";

/**
 * Route-level loading must paint instantly on soft nav. Role-aware shape still
 * comes from the page Suspense fallback (`dashboardSkeletonVariantForRole`).
 * Awaiting the session here re-blocked every dashboard transition.
 */
export default function DashboardLoading() {
  return <PageSkeleton variant="dashboard" label="Загрузка дашборда" />;
}
