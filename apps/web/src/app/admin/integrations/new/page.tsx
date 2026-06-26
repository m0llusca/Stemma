import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ConnectSourceForm } from "@/components/integrations/connect-source-form";
import { PageSkeleton } from "@/components/loading-states";
import { listConnectionProfiles } from "@/lib/integrations/connect/profiles";
import { getIntegrationInstallContract } from "@/lib/integrations/install-contracts/registry";
import { requireCurrentUserPermission } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  otrs: "OTRS Community Edition 6",
  znuny: "Znuny",
  otobo: "OTOBO",
  zendesk: "Zendesk",
  freshdesk: "Freshdesk",
  intercom: "Intercom",
  hubspot: "HubSpot",
  jira: "Jira Service Management",
  ydb: "YDB",
  ytsaurus: "YTsaurus",
  salesforce: "Salesforce",
  servicenow: "ServiceNow",
  dynamics: "Microsoft Dynamics 365"
};

export default function NewIntegrationPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка подключения источника" />}>
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
      label: SOURCE_LABELS[profile.source] ?? profile.source,
      type: profile.type,
      urlPolicy: profile.urlPolicy,
      fixedBaseUrl: profile.fixedBaseUrl,
      fields: profile.credentialFields,
      installState: contract?.installState,
      authModes: contract ? [...contract.authModes] : [],
      limitations: contract ? [...contract.limitations] : []
    };
  });

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Новый источник</h1>
          <p className="page-subtitle">
            Выберите тип, укажите адрес и доступы — Stemma проверит права и подготовит импорт.
          </p>
          <div className="admin-actions mt-5">
            <Link href="/admin/integrations" className="action-button">
              <ArrowLeft size={16} aria-hidden="true" />
              К интеграциям
            </Link>
            <Link href="/admin/tokens" className="action-button action-button--quiet">
              <KeyRound size={16} aria-hidden="true" />
              API-доступ
            </Link>
          </div>
        </div>
      </div>

      <section className="ops-panel" aria-labelledby="new-integration-title">
        <div className="ops-panel__header">
          <div>
            <p className="ops-panel__eyebrow">Источник</p>
            <h2 id="new-integration-title" className="ops-panel__title">Мастер подключения источника</h2>
            <p className="ops-panel__subtitle">
              Сейчас мастер принимает URL и учётные данные; OAuth/маркетплейс-установка появятся там, где это указано в контракте.
            </p>
          </div>
        </div>
        <div className="p-4">
          <ConnectSourceForm sources={sources} />
        </div>
      </section>
    </section>
  );
}
