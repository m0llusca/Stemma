import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { ConnectSourceForm } from "@/components/integrations/connect-source-form";
import { limitedSupportSources, listConnectionProfiles } from "@/lib/integrations/connect/profiles";
import { connectionSourceLabel } from "@/lib/integrations/connect/source-labels";
import { requireCurrentUserPermission } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function NewIntegrationPage() {
  await requireCurrentUserPermission("integrations:manage");

  // Реестр профилей серверный (тянет адаптеры/prisma) — на клиент уходят только
  // сериализуемые метаданные.
  const sources = listConnectionProfiles().map((profile) => ({
    source: profile.source,
    label: connectionSourceLabel(profile.source),
    type: profile.type,
    urlPolicy: profile.urlPolicy,
    fixedBaseUrl: profile.fixedBaseUrl,
    fields: profile.credentialFields,
    limited: limitedSupportSources.has(profile.source)
  }));

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Новый источник</h1>
          <p className="page-subtitle">
            Выберите тип, вставьте ссылку на источник — система сама определит параметры и проверит доступ.
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
            <h2 id="new-integration-title" className="ops-panel__title">Подключение источника</h2>
            <p className="ops-panel__subtitle">Тип + адрес + минимум учётных данных — остальное определяется автоматически.</p>
          </div>
        </div>
        <div className="p-4">
          <ConnectSourceForm sources={sources} />
        </div>
      </section>
    </section>
  );
}
