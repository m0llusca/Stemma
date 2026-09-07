import { Suspense } from "react";
import { AppearanceSettingsForm } from "@/components/admin/appearance-settings-form";
import { PageSkeleton } from "@/components/loading-states";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { Card } from "@/components/ui/card";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";

import { prisma } from "@/lib/db";
import { resolveUiAppearance } from "@/lib/ui-theme";
import { requirePagePermission } from "@/lib/page-permission";

export const dynamic = "force-dynamic";

export default function AdminAppearancePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/appearance")} />}>
      <AdminAppearancePageContent />
    </Suspense>
  );
}

async function AdminAppearancePageContent() {
  const user = await requirePagePermission("appearance:manage");
  const workspace = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: {
      name: true,
      brandName: true,
      brandTagline: true,
      brandLogoUrl: true,
      brandLogoAlt: true,
      brandMark: true,
      brandPrimaryColor: true,
      brandAccentColor: true,
      uiTheme: true,
      uiDensity: true,
      uiCorners: true,
      uiContrast: true,
      uiPaletteOverridesJson: true
    }
  });
  const appearance = resolveUiAppearance(workspace ?? {});

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/appearance"]}
      description="Настройки применяются ко всему рабочему пространству: навигация, кнопки, панели, выбранные состояния и плотность используют один набор токенов. Палитры всегда светлые; тёмное оформление даёт отдельная тема Night Ops."
    >
      <AdminFrame>
        <Card aria-labelledby="appearance-settings-title">
          <AppearanceSettingsForm
            workspaceName={workspace?.name ?? "Рабочее пространство"}
            initialAppearance={appearance}
          />
        </Card>
      </AdminFrame>
    </PageShell>
  );
}
