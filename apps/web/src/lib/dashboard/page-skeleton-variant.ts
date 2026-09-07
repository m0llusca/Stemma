import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";
import { dashboardSkeletonVariantForRole, type DashboardSkeletonVariant } from "@/lib/auth/role-home";

export type { DashboardSkeletonVariant };

/**
 * Route-level and Suspense skeletons must match the live home: ops 4-KPI vs
 * ExecRiskHome 3-KPI. Fail soft to the ops shape when the session is missing.
 */
export async function resolveDashboardSkeletonVariant(): Promise<DashboardSkeletonVariant> {
  try {
    const user = await getCurrentUser();
    return dashboardSkeletonVariantForRole(user.role);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return "dashboard";
    }

    throw error;
  }
}
