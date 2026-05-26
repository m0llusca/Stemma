import type { RoleName } from "@prisma/client";
import { Activity, ArrowRight, Gauge, History, KeyRound, ListChecks, Palette, Plug, ShieldCheck, UsersRound } from "lucide-react";
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

function canSee(role: RoleName, roles: RoleName[]) {
  return roles.includes(role);
}

export default async function AdminHomePage() {
  const user = await requireCurrentUserPermission("audit:read");
  const [workspace, activeScorecard, activeSamplingRules, integrations, users, providerWarnings, failedJobs, recentAuditLogs, apiTokens] = await Promise.all([
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
    prisma.user.count({
      where: { workspaceId: user.workspaceId }
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
      href: "/admin/users",
      title: "Пользователи и роли",
      description: "Локальные учетные записи и назначение ролей.",
      icon: UsersRound,
      roles: ["ADMIN"],
      metric: `${users} пользователей`,
      tone: users > 0 ? "ok" : "warn"
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
      metric: `${currentTheme.label}, ${currentDensity.label}`,
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
    { href: "/admin/integrations/new", label: "Подключить источник", icon: Plug, roles: ["ADMIN"] as RoleName[] },
    { href: "/admin/scorecards?section=create", label: "Изменить форму оценки", icon: Gauge, roles: ["ADMIN", "TEAM_LEAD"] as RoleName[] },
    { href: "/admin/sampling?section=create", label: "Добавить выборку", icon: ListChecks, roles: ["ADMIN", "TEAM_LEAD"] as RoleName[] },
    { href: "/admin/users?create=1", label: "Создать пользователя", icon: UsersRound, roles: ["ADMIN"] as RoleName[] },
    { href: "/admin/access?section=provider", label: "Настроить SSO", icon: ShieldCheck, roles: ["ADMIN"] as RoleName[] },
    { href: "/admin/system", label: "Проверить систему", icon: Activity, roles: ["ADMIN"] as RoleName[] }
  ].filter((action) => canSee(user.role, action.roles));
  const groupedCards = [
    {
      id: "methodology",
      title: "Методология",
      description: "То, по чему проверяем и как отбираем обращения.",
      hrefs: ["/admin/scorecards", "/admin/sampling"]
    },
    {
      id: "connections",
      title: "Подключения",
      description: "Источники обращений, вход пользователей, API-доступ и состояние системных очередей.",
      hrefs: ["/admin/integrations", "/admin/users", "/admin/access", "/admin/tokens", "/admin/system"]
    },
    {
      id: "control",
      title: "Контроль",
      description: "Внешний вид и история изменений.",
      hrefs: ["/admin/appearance", "/admin/audit"]
    }
  ]
    .map((group) => ({
      ...group,
      cards: group.hrefs
        .map((href) => visibleCards.find((card) => card.href === href))
        .filter((card): card is AdminCard => Boolean(card))
    }))
    .filter((group) => group.cards.length > 0);
  type AttentionItem = {
    href: string;
    label: string;
    value: string;
    description: string;
    tone: "warn" | "neutral";
    roles: RoleName[];
  };

  const attentionItems = [
    failedJobs > 0
      ? {
          href: "/admin/system",
          label: "Фоновые задачи",
          value: `${failedJobs} ошибок`,
          description: "Проверить очередь и повторить сбойные задания",
          tone: "warn" as const,
          roles: ["ADMIN"] as RoleName[]
        }
      : null,
    providerWarnings > 0
      ? {
          href: "/admin/access",
          label: "SSO и доступ",
          value: `${providerWarnings} требуют настройки`,
          description: "Закрыть поля провайдера и групповые правила",
          tone: "warn" as const,
          roles: ["ADMIN"] as RoleName[]
        }
      : null,
    !activeScorecard
      ? {
          href: "/admin/scorecards",
          label: "Форма оценки",
          value: "Не настроено",
          description: "Создать активную версию scorecard",
          tone: "warn" as const,
          roles: ["ADMIN", "TEAM_LEAD"] as RoleName[]
        }
      : null,
    activeSamplingRules === 0
      ? {
          href: "/admin/sampling",
          label: "Выборки",
          value: "0 активных",
          description: "Добавить правила отбора в очередь",
          tone: "warn" as const,
          roles: ["ADMIN", "TEAM_LEAD"] as RoleName[]
        }
      : null,
    integrations === 0
      ? {
          href: "/admin/integrations/new",
          label: "Интеграции",
          value: "Нет источников",
          description: "Подключить helpdesk или API-источник",
          tone: "warn" as const,
          roles: ["ADMIN"] as RoleName[]
        }
      : null,
    apiTokens === 0
      ? {
          href: "/admin/tokens",
          label: "API-доступ",
          value: "Нет ключей",
          description: "Создать ключ для demo/API загрузки",
          tone: "neutral" as const,
          roles: ["ADMIN"] as RoleName[]
        }
      : null
  ].filter((item): item is AttentionItem => item !== null && canSee(user.role, item.roles)).slice(0, 4);

  return (
    <section className="page-shell admin-shell">
      <div className="command-center admin-command-center">
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

      <section className="admin-attention-strip" aria-label="Что требует внимания">
        <div className="admin-attention-strip__lead">
          <p className="ops-panel__eyebrow">Требует внимания</p>
          <h2>{attentionItems.length > 0 ? "Продолжить настройку" : "Настройки в рабочем состоянии"}</h2>
          <p>{attentionItems.length > 0 ? "Сначала закрывайте блокеры, которые мешают проверкам и импорту." : "Можно переходить к методологии, источникам или журналу действий."}</p>
        </div>
        <div className="admin-attention-strip__list">
          {attentionItems.length > 0 ? (
            attentionItems.map((item) => (
              <Link key={item.href} href={item.href} className={`admin-attention-card admin-attention-card--${item.tone}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.description}</small>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ))
          ) : (
            <div className="admin-attention-card admin-attention-card--static">
              <span>Блокеров нет</span>
              <strong>Готово</strong>
              <small>Основные настройки, источники и системные очереди доступны в разделах ниже.</small>
            </div>
          )}
        </div>
      </section>

      <div className="admin-section-grid">
        {groupedCards.map((group) => (
          <section key={group.id} className="admin-section-card" aria-labelledby={`admin-section-${group.id}`}>
            <div className="admin-section-card__header">
              <p className="ops-panel__eyebrow">Разделы администрирования</p>
              <h2 id={`admin-section-${group.id}`} className="ops-panel__title">{group.title}</h2>
              <p className="ops-panel__subtitle">{group.description}</p>
            </div>
            <div className="admin-section-card__list">
              {group.cards.map((card) => {
                const Icon = card.icon;

                return (
                  <Link key={card.href} href={card.href} className="admin-home-link" title={card.description}>
                    <span className="admin-tile__icon">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="admin-home-link__body">
                      <span className="admin-home-link__title">
                        <span className="record-title record-title--tight">{card.title}</span>
                      </span>
                      <span className="record-meta">{card.description}</span>
                    </span>
                    <ArrowRight className="admin-home-link__arrow" size={14} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
