import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { IntegrationSetupWorkspace } from "@/components/integrations/integration-setup-workspace";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function badgeClass(tone: "ok" | "warn" | "neutral") {
  const classes = {
    ok: "bg-[#ecfdf5] text-[#15803d]",
    warn: "bg-[#fff7ed] text-[#b45309]",
    neutral: "bg-[#f8fafc] text-[#334155]"
  };

  return classes[tone];
}

function customApiHealth(
  apiTokens: Array<{ lastSuccessAt: Date | null; lastErrorAt: Date | null; lastError: string | null }>
) {
  const hasCurrentError = apiTokens.some(
    (token) => token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)
  );

  if (hasCurrentError) {
    return { label: "Есть ошибка", className: badgeClass("warn") };
  }

  if (apiTokens.some((token) => token.lastSuccessAt)) {
    return { label: "Работает", className: badgeClass("ok") };
  }

  return { label: "Готов", className: badgeClass("ok") };
}

export default async function NewIntegrationPage() {
  const user = await requireCurrentUserPermission("integrations:manage");
  const apiTokens = await prisma.apiToken.findMany({
    where: {
      workspaceId: user.workspaceId
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      lastSuccessAt: true,
      lastErrorAt: true,
      lastError: true
    }
  });

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Новый источник</h1>
          <p className="page-subtitle">
            Пошаговая настройка для OTRS CE 6, Znuny, OTOBO, native helpdesk и своего API.
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
            <h2 id="new-integration-title" className="ops-panel__title">Настройка источника</h2>
            <p className="ops-panel__subtitle">Выберите тип подключения и заполните параметры импорта.</p>
          </div>
        </div>
        <div className="p-4">
          <IntegrationSetupWorkspace apiTokenCount={apiTokens.length} apiHealth={customApiHealth(apiTokens)} />
        </div>
      </section>
    </section>
  );
}
