import { AppSidebarShell } from "@/components/app-sidebar-shell";
import { AuthRequiredError } from "@/lib/current-user";
import { getShellSnapshot } from "@/lib/shell/snapshot";

export async function AppSidebar() {
  const snapshot = await getShellSnapshot().catch((error: unknown) => {
    if (error instanceof AuthRequiredError) {
      return null;
    }

    throw error;
  });

  if (!snapshot) {
    return null;
  }

  return <AppSidebarShell navigation={snapshot.navigation} branding={snapshot.branding} />;
}
