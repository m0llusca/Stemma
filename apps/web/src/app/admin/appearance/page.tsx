import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { AppearanceSettingsForm } from "@/components/admin/appearance-settings-form";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { resolveUiAppearance } from "@/lib/ui-theme";

export const dynamic = "force-dynamic";

export default async function AdminAppearancePage() {
  const user = await requireCurrentUserPermission("appearance:manage");
  const workspace = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: {
      name: true,
      uiTheme: true,
      uiDensity: true,
      uiCorners: true,
      uiContrast: true
    }
  });
  const appearance = resolveUiAppearance(workspace ?? {});

  return (
    <section className="page-shell admin-shell">
      <div className="command-center command-center--split">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Внешний вид</h1>
          <p className="page-subtitle">
            Настройки применяются ко всему рабочему пространству: навигация, кнопки, панели, выбранные состояния и плотность используют один набор токенов.
            Если на устройстве включена темная тема, выбранная палитра автоматически использует темный вариант.
          </p>
        </div>
        <div className="admin-actions xl:justify-end">
          <Link href="/admin" className="action-button">
            К настройкам
          </Link>
        </div>
      </div>

      <section className="panel overflow-hidden">
        <div className="learning-section-header">
          <div className="min-w-0">
            <h2>{workspace?.name ?? "Рабочее пространство"}</h2>
            <p>Статусы готовности, завершения и выполнения остаются зелеными в любой теме.</p>
          </div>
          <span className="pill pill--ok">
            <CheckCircle2 size={14} aria-hidden="true" />
            Готово
          </span>
        </div>

        <AppearanceSettingsForm initialAppearance={appearance} />
      </section>
    </section>
  );
}
