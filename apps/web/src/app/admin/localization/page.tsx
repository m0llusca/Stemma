import { ArrowLeft, Languages } from "lucide-react";
import Link from "next/link";
import { LocalizationEditor } from "@/components/i18n/localization-editor";
import {
  createLocaleAction,
  publishTranslationAction,
  rollbackTranslationAction,
  saveTranslationDraftAction
} from "@/lib/i18n/actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminLocalizationPage() {
  const user = await requireCurrentUserPermission("appearance:manage");
  const [workspace, locales, translationKeys] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { name: true }
    }),
    prisma.locale.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ isDefault: "desc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        isDefault: true,
        isEnabled: true
      }
    }),
    prisma.translationKey.findMany({
      orderBy: [{ namespace: "asc" }, { key: "asc" }],
      select: {
        id: true,
        namespace: true,
        key: true,
        defaultText: true,
        description: true,
        ownerArea: true,
        values: {
          where: { workspaceId: user.workspaceId },
          select: {
            id: true,
            localeId: true,
            draftText: true,
            publishedText: true,
            publishedAt: true,
            version: true
          }
        }
      }
    })
  ]);

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Локализация</h1>
          <p className="page-subtitle">
            Управление языками рабочего пространства и публикацией переводов для интерфейсных ключей. Черновики можно сохранить отдельно от публикации.
          </p>
          <div className="admin-actions mt-5">
            <Link href="/admin" className="action-button">
              <ArrowLeft size={16} aria-hidden="true" />
              К настройкам
            </Link>
          </div>
        </div>
      </div>

      <section className="ops-panel" aria-labelledby="localization-editor-title">
        <div className="ops-panel__header">
          <div className="min-w-0">
            <p className="ops-panel__eyebrow">Рабочее пространство</p>
            <h2 id="localization-editor-title" className="ops-panel__title">{workspace?.name ?? "Рабочее пространство"}</h2>
            <p className="ops-panel__subtitle">
              {locales.length} языков, {translationKeys.length} ключей. Публикация применяет текущий черновик выбранного языка.
            </p>
          </div>
          <span className="pill pill--neutral">
            <Languages size={14} aria-hidden="true" />
            i18n
          </span>
        </div>

        <LocalizationEditor
          locales={locales}
          translationKeys={translationKeys.map((translationKey) => ({
            ...translationKey,
            fullKey: `${translationKey.namespace}.${translationKey.key}`,
            values: translationKey.values.map((value) => ({
              ...value,
              publishedAt: value.publishedAt?.toISOString() ?? null
            }))
          }))}
          createLocaleAction={createLocaleAction}
          saveDraftAction={saveTranslationDraftAction}
          publishAction={publishTranslationAction}
          rollbackAction={rollbackTranslationAction}
        />
      </section>
    </section>
  );
}
