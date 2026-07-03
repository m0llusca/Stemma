import { PageSkeleton } from "@/components/loading-states";
import { adminLoadingLabel } from "@/lib/admin-sections";

export default function AdminAiScoringLoading() {
  return <PageSkeleton variant="admin" label={adminLoadingLabel("/admin/ai-scoring")} />;
}
