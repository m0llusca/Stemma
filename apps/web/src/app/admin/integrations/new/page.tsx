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
        </div>
        <div className="admin-actions">
          <Link href="/admin/integrations" className="action-button">
            К интеграциям
          </Link>
          <Link href="/admin/tokens" className="action-button action-button--quiet">
            API-доступ
          </Link>
        </div>
      </div>

      <IntegrationSetupWorkspace apiTokenCount={apiTokens.length} apiHealth={customApiHealth(apiTokens)} />
    </section>
  );
}
