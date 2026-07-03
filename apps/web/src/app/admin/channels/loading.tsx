import { PageSkeleton } from "@/components/loading-states";
import { adminLoadingLabel } from "@/lib/admin-sections";

export default function AdminChannelsLoading() {
  return <PageSkeleton variant="admin" label={adminLoadingLabel("/admin/channels")} />;
}
