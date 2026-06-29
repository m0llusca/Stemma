import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AppearanceSettingsForm } from "@/components/admin/appearance-settings-form";
import { PageSkeleton } from "@/components/loading-states";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { Chip } from "@/components/ui/chip";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { resolveUiAppearance } from "@/lib/ui-theme";

export const dynamic = "force-dynamic";

export default function AdminAppearancePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка оформления" />}>
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
      eyebrow="Администрирование"
      title="Внешний вид"
      description="Настройки применяются ко всему рабочему пространству: навигация, кнопки, панели, выбранные состояния и плотность используют один набор токенов. Палитры всегда светлые; тёмное оформление даёт отдельная тема Night Ops."
      actions={
        <Link href="/admin" className="action-button">
          <ArrowLeft size={16} aria-hidden="true" />
          К настройкам
        </Link>
      }
    >
      <AdminFrame>
        <section className="ops-panel" aria-labelledby="appearance-settings-title">
          <div className="ops-panel__header">
            <div className="min-w-0">
              <p className="ops-panel__eyebrow">Рабочее пространство</p>
              <h2 id="appearance-settings-title" className="ops-panel__title">{workspace?.name ?? "Рабочее пространство"}</h2>
              <p className="ops-panel__subtitle">Палитра управляет навигацией, кнопками, поверхностями, границами и статусами без ручной правки CSS.</p>
            </div>
            <Chip tone="success" size="sm" icon={<CheckCircle2 size={13} aria-hidden="true" />}>
              Готово
            </Chip>
          </div>

          <AppearanceSettingsForm initialAppearance={appearance} />
        </section>
      </AdminFrame>
    </PageShell>
  );
}
