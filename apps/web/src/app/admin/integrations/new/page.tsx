import { KeyRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ConnectSourceForm } from "@/components/integrations/connect-source-form";
import { PageSkeleton } from "@/components/loading-states";
import { AdminFrame } from "@/components/admin/admin-frame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { adminEyebrow } from "@/lib/admin-sections";
import { listConnectionProfiles } from "@/lib/integrations/connect/profiles";
import { connectionSourceLabel } from "@/lib/integrations/connect/source-labels";
import { getIntegrationInstallContract } from "@/lib/integrations/install-contracts/registry";
import { requireCurrentUserPermission } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default function NewIntegrationPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка: Подключение источника" />}>
      <NewIntegrationPageContent />
    </Suspense>
  );
}

async function NewIntegrationPageContent() {
  await requireCurrentUserPermission("integrations:manage");

  // Реестр профилей серверный (тянет адаптеры/prisma) — на клиент уходят только
  // сериализуемые метаданные.
  const sources = listConnectionProfiles().map((profile) => {
    const contract = getIntegrationInstallContract(profile.source);

    return {
      source: profile.source,
      label: connectionSourceLabel(profile.source),
      type: profile.type,
      urlPolicy: profile.urlPolicy,
      fixedBaseUrl: profile.fixedBaseUrl,
      fields: profile.credentialFields,
      installState: contract?.installState,
      authModes: contract ? [...contract.authModes] : [],
      requiredScopes: contract ? [...contract.requiredScopes] : [],
      supportsWebhooks: contract?.supportsWebhooks ?? false,
      healthChecks: contract ? [...contract.healthChecks] : [],
      testImport: contract
        ? {
            mode: contract.testImport.mode,
            supported: contract.testImport.supported,
            notes: [...contract.testImport.notes]
          }
        : undefined,
      limitations: contract ? [...contract.limitations] : []
    };
  });

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title="Новый источник"
      description="Выберите тип, укажите адрес и доступы — Stemma проверит права и подготовит импорт."
      actions={
        <Button variant="outline" size="sm" render={<Link href="/admin/tokens" />} nativeButton={false}>
          <KeyRound data-icon="inline-start" aria-hidden="true" />
          API-доступ
        </Button>
      }
    >
      <AdminFrame>
        <Card>
          <CardHeader className="border-b">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Источник</p>
            <CardTitle id="new-integration-title">Мастер подключения источника</CardTitle>
            <CardDescription>
              Сейчас мастер принимает URL и учётные данные; OAuth/маркетплейс-установка появятся там, где это
              указано в контракте.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ConnectSourceForm sources={sources} />
          </CardContent>
        </Card>
      </AdminFrame>
    </PageShell>
  );
}
