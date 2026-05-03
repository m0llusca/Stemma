import type { RoleName } from "@prisma/client";
import { Activity, Gauge, History, KeyRound, ListChecks, Plug, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type AdminCard = {
  href: string;
  title: string;
  description: string;
  icon: typeof Gauge;
  roles: RoleName[];
  metric?: string;
  tone?: "ok" | "warn" | "neutral";
};

function cardTone(tone: AdminCard["tone"]) {
  if (tone === "ok") return "border-[#b9ddd2] bg-[#f4faf7]";
  if (tone === "warn") return "border-[#fed7aa] bg-[#fffaf5]";
  return "border-[#d7dce5] bg-white";
}

function canSee(role: RoleName, roles: RoleName[]) {
  return roles.includes(role);
}

export default async function AdminHomePage() {
  const user = await requireCurrentUserPermission("audit:read");
  const [activeScorecard, activeSamplingRules, integrations, providerWarnings, failedJobs, recentAuditLogs, apiTokens] = await Promise.all([
    prisma.scorecard.findFirst({
      where: { workspaceId: user.workspaceId, isActive: true },
      select: { version: true }
    }),
    prisma.samplingRule.count({
      where: { workspaceId: user.workspaceId, isActive: true }
    }),
    prisma.integration.count({
      where: { workspaceId: user.workspaceId, status: { in: ["active", "ready", "queued"] } }
    }),
    prisma.identityProvider.count({
      where: {
        workspaceId: user.workspaceId,
        type: { not: "DEMO" },
        status: { not: "active" }
      }
    }),
    prisma.backendJob.count({
      where: { workspaceId: user.workspaceId, status: "FAILED" }
    }),
    prisma.auditLog.count({
      where: { workspaceId: user.workspaceId }
    }),
    prisma.apiToken.count({
      where: { workspaceId: user.workspaceId }
    })
  ]);
  const cards: AdminCard[] = [
    {
      href: "/admin/scorecards",
      title: "Формы оценки",
      description: "Критерии, веса и версии формы проверки.",
      icon: Gauge,
      roles: ["ADMIN", "TEAM_LEAD"],
      metric: activeScorecard ? `Версия ${activeScorecard.version}` : "Не настроено",
      tone: activeScorecard ? "ok" : "warn"
    },
    {
      href: "/admin/sampling",
      title: "Выборки",
      description: "Правила отбора обращений на ручную проверку.",
      icon: ListChecks,
      roles: ["ADMIN", "TEAM_LEAD"],
      metric: `${activeSamplingRules} активных`,
      tone: activeSamplingRules > 0 ? "ok" : "warn"
    },
    {
      href: "/admin/integrations",
      title: "Интеграции",
      description: "Источники обращений и импорт из helpdesk-систем.",
      icon: Plug,
      roles: ["ADMIN"],
      metric: `${integrations} источников`,
      tone: integrations > 0 ? "ok" : "neutral"
    },
    {
      href: "/admin/access",
      title: "Доступ и SSO",
      description: "Провайдеры входа, AD/Entra-группы и сессии.",
      icon: ShieldCheck,
      roles: ["ADMIN"],
      metric: providerWarnings > 0 ? `${providerWarnings} требуют настройки` : "Готово",
      tone: providerWarnings > 0 ? "warn" : "ok"
    },
    {
      href: "/admin/system",
      title: "Состояние системы",
      description: "Очереди, окружение, задачи обслуживания.",
      icon: Activity,
      roles: ["ADMIN"],
      metric: failedJobs > 0 ? `${failedJobs} ошибок` : "Без ошибок",
      tone: failedJobs > 0 ? "warn" : "ok"
    },
    {
      href: "/admin/tokens",
      title: "API-доступ",
      description: "Ключи для интеграций и кастомных источников.",
      icon: KeyRound,
      roles: ["ADMIN"],
      metric: `${apiTokens} ключей`,
      tone: apiTokens > 0 ? "ok" : "neutral"
    },
    {
      href: "/admin/audit",
      title: "Журнал действий",
      description: "История изменений и админских операций.",
      icon: History,
      roles: ["ADMIN", "TEAM_LEAD"],
      metric: `${recentAuditLogs} событий`,
      tone: "neutral"
    }
  ];
  const visibleCards = cards.filter((card) => canSee(user.role, card.roles));

  return (
    <section className="page-shell">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold">Настройки</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#667085]">
          Один вход в служебные настройки. В рабочих разделах остаются только ежедневные задачи проверки.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleCards.map((card) => {
          const Icon = card.icon;

          return (
            <Link key={card.href} href={card.href} className={`grid min-h-[168px] gap-4 rounded-md border p-5 shadow-sm hover:border-[#116466] ${cardTone(card.tone)}`}>
              <div className="flex items-start justify-between gap-4">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#d7dce5] bg-white text-[#0b4f52]">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#344054]">{card.metric}</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#17202a]">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#667085]">{card.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
