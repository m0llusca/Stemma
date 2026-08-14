import { Languages } from "lucide-react";
import { Suspense } from "react";
import { LocalizationEditor } from "@/components/i18n/localization-editor";
import { PageSkeleton } from "@/components/loading-states";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import {
  createLocaleAction,
  publishTranslationAction,
  rollbackTranslationAction,
  saveTranslationDraftAction
} from "@/lib/i18n/actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { russianPlural } from "@/lib/reports/report-format";

export const dynamic = "force-dynamic";

export default function AdminLocalizationPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/localization")} />}>
      <AdminLocalizationPageContent />
    </Suspense>
  );
}

async function AdminLocalizationPageContent() {
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
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/localization"]}
      description="Управление языками рабочего пространства и публикацией переводов для интерфейсных ключей. Черновики можно сохранить отдельно от публикации."
    >
      <AdminFrame>
        <Card aria-labelledby="localization-editor-title">
          <CardHeader className="border-b">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Рабочее пространство</p>
                <CardTitle id="localization-editor-title">{workspace?.name ?? "Рабочее пространство"}</CardTitle>
                <CardDescription className="tabular-nums">
                  {russianPlural(locales.length, ["язык", "языка", "языков"])},{" "}
                  {russianPlural(translationKeys.length, ["ключ", "ключа", "ключей"])}. Публикация применяет текущий черновик выбранного языка.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="shrink-0">
                <Languages data-icon="inline-start" aria-hidden="true" />
                i18n
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
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
          </CardContent>
        </Card>
      </AdminFrame>
    </PageShell>
  );
}
