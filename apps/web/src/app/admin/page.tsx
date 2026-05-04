import type { RoleName } from "@prisma/client";
import { Activity, ArrowRight, Gauge, History, KeyRound, ListChecks, Palette, Plug, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getUiDensityOption, getUiThemeOption } from "@/lib/ui-theme";

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
  const [workspace, activeScorecard, activeSamplingRules, integrations, providerWarnings, failedJobs, recentAuditLogs, apiTokens] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { uiTheme: true, uiDensity: true }
    }),
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
  const currentTheme = getUiThemeOption(workspace?.uiTheme);
  const currentDensity = getUiDensityOption(workspace?.uiDensity);
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
      href: "/admin/appearance",
      title: "Внешний вид",
      description: "Темы, плотность, радиусы, контраст и единый стиль интерфейса.",
      icon: Palette,
      roles: ["ADMIN"],
      metric: `${currentTheme.label} · ${currentDensity.label}`,
      tone: "ok"
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
  const groupedCards = [
    {
      title: "Методология",
      description: "То, по чему проверяем и как отбираем обращения.",
      hrefs: ["/admin/scorecards", "/admin/sampling"]
    },
    {
      title: "Подключения",
      description: "Источники обращений, вход пользователей и API-доступ.",
      hrefs: ["/admin/integrations", "/admin/access", "/admin/tokens"]
    },
    {
      title: "Контроль",
      description: "Системные задачи, ошибки и история изменений.",
      hrefs: ["/admin/system", "/admin/appearance", "/admin/audit"]
    }
  ]
    .map((group) => ({
      ...group,
      cards: group.hrefs
        .map((href) => visibleCards.find((card) => card.href === href))
        .filter((card): card is AdminCard => Boolean(card))
    }))
    .filter((group) => group.cards.length > 0);

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
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
      </div>

      <section className="admin-group-grid" aria-label="Разделы администрирования">
        {groupedCards.map((group) => (
          <div key={group.title} className="admin-group">
            <div className="admin-group__header">
              <h2 className="text-base font-semibold text-[#111827]">{group.title}</h2>
              <p className="text-sm leading-5 text-[#64748b]">{group.description}</p>
            </div>
            <div className="grid gap-2">
              {group.cards.map((card) => {
                const Icon = card.icon;

                return (
                  <Link key={card.href} href={card.href} className="admin-tile">
                    <span className="admin-tile__icon">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className="admin-tile__body">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="record-title">{card.title}</span>
                        <span className={`pill ${pillTone(card.tone)}`}>{card.metric}</span>
                      </span>
                      <span className="record-meta">{card.description}</span>
                      <span className="quiet-link inline-flex items-center gap-1">
                        Открыть <ArrowRight size={13} aria-hidden="true" />
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </section>
  );
}
