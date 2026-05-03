import type { RoleName } from "@prisma/client";
import { Activity, ArrowRight, Gauge, History, KeyRound, ListChecks, Plug, ShieldCheck, SlidersHorizontal } from "lucide-react";
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

function pillTone(tone: AdminCard["tone"]) {
  if (tone === "ok") return "pill--ok";
  if (tone === "warn") return "pill--warn";
  return "pill--neutral";
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
  const quickActions = [
    { href: "/admin/integrations?setup=1#connect", label: "Подключить источник", icon: Plug, roles: ["ADMIN"] as RoleName[] },
    { href: "/admin/scorecards?new=1#new-version", label: "Изменить форму оценки", icon: Gauge, roles: ["ADMIN", "TEAM_LEAD"] as RoleName[] },
    { href: "/admin/sampling?new=1#new-rule", label: "Добавить выборку", icon: ListChecks, roles: ["ADMIN", "TEAM_LEAD"] as RoleName[] },
    { href: "/admin/access?section=provider", label: "Настроить SSO", icon: ShieldCheck, roles: ["ADMIN"] as RoleName[] },
    { href: "/admin/system", label: "Проверить систему", icon: Activity, roles: ["ADMIN"] as RoleName[] }
  ].filter((action) => canSee(user.role, action.roles));

  return (
    <section className="page-shell admin-shell">
      <div className="admin-hero admin-hero--split">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Настройки</h1>
          <p className="page-subtitle">
            Главные действия доступны отсюда напрямую, а редкие технические детали остаются внутри профильных разделов.
          </p>
          <div className="admin-actions mt-5">
            {quickActions.slice(0, 3).map((action, index) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} className={`action-button ${index === 0 ? "action-button--primary" : ""}`}>
                  <Icon size={16} aria-hidden="true" />
                  {action.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="quick-grid">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="record-card">
              <p className="record-meta">Форма оценки</p>
              <p className="record-title">{activeScorecard ? `Версия ${activeScorecard.version}` : "Не настроено"}</p>
            </div>
            <div className="record-card">
              <p className="record-meta">Выборки</p>
              <p className="record-title">{activeSamplingRules} активных</p>
            </div>
            <div className="record-card">
              <p className="record-meta">Системные ошибки</p>
              <p className="record-title">{failedJobs}</p>
            </div>
          </div>
        </div>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-[#d7dce5] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Разделы администрирования</h2>
              <p className="mt-1 text-sm text-[#667085]">Каждый раздел открывает рабочий экран без промежуточных вложенных меню.</p>
            </div>
            <SlidersHorizontal size={18} className="text-[#0b4f52]" aria-hidden="true" />
          </div>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleCards.map((card) => {
          const Icon = card.icon;

          return (
            <Link key={card.href} href={card.href} className="quick-card">
              <div className="quick-card__top">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#eef4f4] text-[#0b4f52]">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className={`pill ${pillTone(card.tone)}`}>{card.metric}</span>
              </div>
              <div className="min-w-0">
                <h3 className="quick-card__title">{card.title}</h3>
                <p className="quick-card__copy mt-1">{card.description}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b4f52]">
                Открыть <ArrowRight size={14} aria-hidden="true" />
              </span>
            </Link>
          );
        })}
        </div>
      </section>

      {quickActions.length > 3 ? (
        <section className="panel p-4">
          <div className="admin-actions">
            {quickActions.slice(3).map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} className="action-button action-button--quiet">
                  <Icon size={16} aria-hidden="true" />
                  {action.label}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}
