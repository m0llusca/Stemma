import type { RoleName } from "@prisma/client";
import { Activity, ArrowRight, CalendarClock, Gauge, History, KeyRound, ListChecks, Palette, Plug, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { TriageStrip } from "@/components/ui/triage-strip";
import { PageSkeleton } from "@/components/loading-states";
import { getMissingSettingsCoachmarks, type SettingCoachmarkId } from "@/lib/admin-setup-guidance";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getUiDensityOption, getUiThemeOption } from "@/lib/ui-theme";

export const dynamic = "force-dynamic";

type AdminCard = {
  href: string;
  title: string;
  icon: typeof Gauge;
  roles: RoleName[];
  metric?: string;
  tone?: "ok" | "warn" | "neutral";
};

function canSee(role: RoleName, roles: RoleName[]) {
  return roles.includes(role);
}

export default function AdminHomePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка администрирования" />}>
      <AdminHomePageContent />
    </Suspense>
  );
}

async function AdminHomePageContent() {
  const user = await requireCurrentUserPermission("audit:read");
  const [
    workspace,
    activeScorecard,
    activeSamplingRules,
    integrations,
    users,
    providerWarnings,
    activeProviders,
    activeGroupMappings,
    failedJobs,
    recentAuditLogs,
    apiTokens,
    reportSchedules
  ] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { uiTheme: true, uiDensity: true, brandLogoUrl: true, uiPaletteOverridesJson: true }
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
    prisma.identityProvider.count({
      where: {
        workspaceId: user.workspaceId,
        type: { not: "DEMO" },
        status: "active"
      }
    }),
    prisma.groupRoleMapping.count({
      where: {
        workspaceId: user.workspaceId,
        isActive: true
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
    }),
    prisma.reportSchedule.count({
      where: { workspaceId: user.workspaceId, isActive: true }
    })
  ]);
  const currentTheme = getUiThemeOption(workspace?.uiTheme);
  const currentDensity = getUiDensityOption(workspace?.uiDensity);
  const setupCoachmarkRoles: Record<SettingCoachmarkId, RoleName[]> = {
    scorecards: ["ADMIN", "TEAM_LEAD"],
    sampling: ["ADMIN", "TEAM_LEAD"],
    integrations: ["ADMIN"],
    access: ["ADMIN"],
    groupMappings: ["ADMIN"],
    users: ["ADMIN"],
    apiTokens: ["ADMIN"],
    brandLogo: ["ADMIN"],
    componentPalette: ["ADMIN"]
  };
  const setupCoachmarks = getMissingSettingsCoachmarks({
    activeScorecardVersion: activeScorecard?.version ?? null,
    activeSamplingRules,
    integrationCount: integrations,
    activeIntegrationCount: integrations,
    nonDemoProviderCount: activeProviders + providerWarnings,
    activeProviderCount: activeProviders,
    activeGroupMappings,
    apiTokenCount: apiTokens,
    userCount: users,
    brandLogoUrl: workspace?.brandLogoUrl,
    uiPaletteOverridesJson: workspace?.uiPaletteOverridesJson
  }).filter((item) => canSee(user.role, setupCoachmarkRoles[item.id]));
  const primarySetupCoachmark = setupCoachmarks[0] ?? null;
  const cards: AdminCard[] = [
    {
      href: "/admin/scorecards",
      title: "Формы оценки",
      icon: Gauge,
      roles: ["ADMIN", "TEAM_LEAD"],
      metric: activeScorecard ? `Версия ${activeScorecard.version}` : "Не настроено",
      tone: activeScorecard ? "ok" : "warn"
    },
    {
      href: "/admin/sampling",
      title: "Выборки",
      icon: ListChecks,
      roles: ["ADMIN", "TEAM_LEAD"],
      metric: `${activeSamplingRules} активных`,
      tone: activeSamplingRules > 0 ? "ok" : "warn"
    },
    {
      href: "/admin/integrations",
      title: "Интеграции",
      icon: Plug,
      roles: ["ADMIN"],
      metric: `${integrations} источников`,
      tone: integrations > 0 ? "ok" : "neutral"
    },
    {
      href: "/admin/access",
      title: "Доступ и SSO",
      icon: ShieldCheck,
      roles: ["ADMIN"],
      metric: providerWarnings > 0 ? `${providerWarnings} требуют настройки` : "Готово",
      tone: providerWarnings > 0 ? "warn" : "ok"
    },
    {
      href: "/admin/users",
      title: "Пользователи и роли",
      icon: UsersRound,
      roles: ["ADMIN"],
      metric: `${users} пользователей`,
      tone: users > 0 ? "ok" : "warn"
    },
    {
      href: "/admin/system",
      title: "Состояние системы",
      icon: Activity,
      roles: ["ADMIN"],
      metric: failedJobs > 0 ? `${failedJobs} ошибок` : "Без ошибок",
      tone: failedJobs > 0 ? "warn" : "ok"
    },
    {
      href: "/admin/tokens",
      title: "API-доступ",
      icon: KeyRound,
      roles: ["ADMIN"],
      metric: `${apiTokens} ключей`,
      tone: apiTokens > 0 ? "ok" : "neutral"
    },
    {
      href: "/admin/appearance",
      title: "Внешний вид",
      icon: Palette,
      roles: ["ADMIN"],
      metric: `${currentTheme.label}, ${currentDensity.label}`,
      tone: "ok"
    },
    {
      href: "/admin/audit",
      title: "Журнал действий",
      icon: History,
      roles: ["ADMIN", "TEAM_LEAD"],
      metric: `${recentAuditLogs} событий`,
      tone: "neutral"
    },
    {
      href: "/admin/report-schedules",
      title: "Расписания отчетов",
      icon: CalendarClock,
      roles: ["ADMIN", "TEAM_LEAD"],
      metric: `${reportSchedules} активных`,
      tone: reportSchedules > 0 ? "ok" : "neutral"
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
  const attentionBlockers = [
    { active: failedJobs > 0, roles: ["ADMIN"] as RoleName[] },
    { active: providerWarnings > 0, roles: ["ADMIN"] as RoleName[] },
    { active: !activeScorecard, roles: ["ADMIN", "TEAM_LEAD"] as RoleName[] },
    { active: activeSamplingRules === 0, roles: ["ADMIN", "TEAM_LEAD"] as RoleName[] },
    { active: integrations === 0, roles: ["ADMIN"] as RoleName[] },
    { active: apiTokens === 0, roles: ["ADMIN"] as RoleName[] }
  ].filter((blocker) => blocker.active && canSee(user.role, blocker.roles));
  const attentionCount = attentionBlockers.length;
  const priorityTitle = primarySetupCoachmark
    ? primarySetupCoachmark.title
    : attentionCount > 0
      ? "Продолжить настройку"
      : "Настройки в рабочем состоянии";
  const priorityBody = primarySetupCoachmark
    ? primarySetupCoachmark.body
    : attentionCount > 0
      ? "Сначала закрывайте блокеры, которые мешают проверкам и импорту."
      : "Можно переходить к методологии, источникам или журналу действий.";

  return (
    <PageShell
      eyebrow="Администрирование"
      title="Настройки"
      description="Главные действия доступны отсюда напрямую, а редкие технические детали остаются внутри профильных разделов."
      actions={quickActions.slice(0, 3).map((action, index) => {
        const Icon = action.icon;
        return (
          <Link key={action.href} href={action.href} className={`action-button ${index === 0 ? "action-button--primary" : ""}`}>
            <Icon size={16} aria-hidden="true" />
            {action.label}
          </Link>
        );
      })}
    >
      <AdminFrame>
        <TriageStrip
          tone={primarySetupCoachmark || attentionCount > 0 ? "warning" : "success"}
          icon={<Sparkles size={18} aria-hidden="true" />}
          title={priorityTitle}
          description={priorityBody}
          action={
            primarySetupCoachmark ? (
              <Link href={primarySetupCoachmark.href} className="action-button action-button--small action-button--primary">
                {primarySetupCoachmark.actionLabel}
              </Link>
            ) : undefined
          }
        />

        {visibleCards.length > 0 ? (
          <section className="ops-panel admin-status-panel" aria-labelledby="admin-status-heading">
            <div className="ops-panel__header">
              <div>
                <h2 id="admin-status-heading" className="ops-panel__title">Состояние разделов</h2>
                <p className="ops-panel__subtitle">Текущее значение и статус по каждой области настроек.</p>
              </div>
            </div>
            <ul className="admin-status-list">
              {visibleCards.map((card) => {
                const Icon = card.icon;
                const tone = card.tone ?? "neutral";

                return (
                  <li key={card.href}>
                    <Link href={card.href} className="admin-status-row">
                      <span className={`admin-status-row__icon admin-status-row__icon--${tone}`} aria-hidden="true">
                        <Icon size={15} aria-hidden="true" />
                      </span>
                      <span className="admin-status-row__label record-title record-title--tight">{card.title}</span>
                      {card.metric ? (
                        <span className={`admin-status-row__metric tabular-nums admin-status-row__metric--${tone}`}>{card.metric}</span>
                      ) : null}
                      <ArrowRight className="admin-status-row__arrow" size={14} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </AdminFrame>
    </PageShell>
  );
}
