import { CheckCircle2 } from "lucide-react";
import { Suspense } from "react";
import { AppearanceSettingsForm } from "@/components/admin/appearance-settings-form";
import { PageSkeleton } from "@/components/loading-states";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { statusSurfaceClass } from "@/lib/ui/status-tone";
import { resolveUiAppearance } from "@/lib/ui-theme";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function AdminAppearancePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/appearance")} />}>
      <AdminAppearancePageContent />
    </Suspense>
  );
}

async function AdminAppearancePageContent() {
  const user = await requireCurrentUserPermission("appearance:manage");
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
          <CardHeader className="border-b">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Рабочее пространство</p>
                <CardTitle id="appearance-settings-title">{workspace?.name ?? "Рабочее пространство"}</CardTitle>
                <CardDescription>
                  Палитра управляет навигацией, кнопками, поверхностями, границами и статусами без ручной правки CSS.
                </CardDescription>
              </div>
              <Badge variant="outline" className={cn("shrink-0 border-transparent", statusSurfaceClass("positive"))}>
                <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
                Готово
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <AppearanceSettingsForm initialAppearance={appearance} />
          </CardContent>
        </Card>
      </AdminFrame>
    </PageShell>
  );
}
