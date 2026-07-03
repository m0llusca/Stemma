import { PageSkeleton } from "@/components/loading-states";
import { adminLoadingLabel } from "@/lib/admin-sections";

export default function AdminTokensLoading() {
  return <PageSkeleton variant="admin" label={adminLoadingLabel("/admin/tokens")} />;
}
