import { PageSkeleton } from "@/components/loading-states";
import { adminLoadingLabel } from "@/lib/admin-sections";

export default function AdminAuditLoading() {
  return <PageSkeleton variant="admin" label={adminLoadingLabel("/admin/audit")} />;
}
