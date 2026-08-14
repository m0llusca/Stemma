import type { RoleName } from "@prisma/client";
import { Activity, ArrowRight, CalendarClock, Gauge, History, KeyRound, Languages, ListChecks, Palette, Plug, Send, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TriageStrip } from "@/components/ui/triage-strip";
import { PageSkeleton } from "@/components/loading-states";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { getMissingSettingsCoachmarks, type SettingCoachmarkId } from "@/lib/admin-setup-guidance";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { russianPlural } from "@/lib/reports/report-format";
import { statusSurfaceClass } from "@/lib/ui/status-tone";
import { resolveAiScoringProviderName } from "@/lib/ai-quality/scoring";
import { loadWorkspaceAiCredentials } from "@/lib/ai-quality/credentials";
import { getUiDensityOption, getUiThemeOption } from "@/lib/ui-theme";
import { cn } from "@/lib/utils";

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

function metricBadgeVariant(tone: AdminCard["tone"]): "default" | "secondary" | "destructive" | "outline" {
  if (tone === "ok") return "secondary";
  if (tone === "warn") return "destructive";
  return "outline";
}

function toneIconClass(tone: AdminCard["tone"]) {
  if (tone === "ok") {
    return cn("border-success/30", statusSurfaceClass("positive"));
  }
  if (tone === "warn") {
    return cn("border-warning/30", statusSurfaceClass("warning"));
  }
  return cn("border-border", statusSurfaceClass("neutral"));
}

export default function AdminHomePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin")} />}>
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
    reportSchedules,
    messagingActiveChannels,
    aiCredentials
  ] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: user.workspaceId },
      select: { uiTheme: true, uiDensity: true, brandLogoUrl: true, uiPaletteOverridesJson: true, aiScoringProvider: true }
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
    }),
    prisma.messagingChannel.count({
      where: { workspaceId: user.workspaceId, status: "active" }
    }),
    loadWorkspaceAiCredentials(user.workspaceId)
  ]);
  const currentTheme = getUiThemeOption(workspace?.uiTheme);
  const currentDensity = getUiDensityOption(workspace?.uiDensity);
  const activeScoringProvider = resolveAiScoringProviderName(workspace?.aiScoringProvider ?? "auto", aiCredentials);
  const scoringProviderLabels: Record<string, string> = {
    yandexgpt: "YandexGPT",
    anthropic: "Claude (Anthropic)",
    openai: "ChatGPT (OpenAI)",
    deterministic: "Детерминированный"
  };
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
      title: adminSectionTitles["/admin/scorecards"],
      icon: Gauge,
      roles: ["ADMIN", "TEAM_LEAD"],
      metric: activeScorecard ? `Версия ${activeScorecard.version}` : "Не настроено",
      tone: activeScorecard ? "ok" : "warn"
    },
    {
      href: "/admin/sampling",
      title: adminSectionTitles["/admin/sampling"],
      icon: ListChecks,
      roles: ["ADMIN", "TEAM_LEAD"],
      metric: russianPlural(activeSamplingRules, ["активное правило", "активных правила", "активных правил"]),
      tone: activeSamplingRules > 0 ? "ok" : "warn"
    },
    {
      href: "/admin/ai-scoring",
      title: adminSectionTitles["/admin/ai-scoring"],
      icon: Sparkles,
      roles: ["ADMIN"],
      metric: scoringProviderLabels[activeScoringProvider] ?? activeScoringProvider,
      tone: activeScoringProvider === "deterministic" ? "warn" : "ok"
    },
    {
      href: "/admin/integrations",
      title: adminSectionTitles["/admin/integrations"],
      icon: Plug,
      roles: ["ADMIN"],
      metric: russianPlural(integrations, ["источник", "источника", "источников"]),
      tone: integrations > 0 ? "ok" : "neutral"
    },
    {
      href: "/admin/access",
      title: adminSectionTitles["/admin/access"],
      icon: ShieldCheck,
      roles: ["ADMIN"],
      metric: providerWarnings > 0 ? `${providerWarnings} требуют настройки` : "Готово",
      tone: providerWarnings > 0 ? "warn" : "ok"
    },
    {
      href: "/admin/channels",
      title: adminSectionTitles["/admin/channels"],
      icon: Send,
      roles: ["ADMIN"],
      metric: russianPlural(messagingActiveChannels, ["активный канал", "активных канала", "активных каналов"]),
      tone: messagingActiveChannels > 0 ? "ok" : "neutral"
    },
    {
      href: "/admin/users",
      title: adminSectionTitles["/admin/users"],
      icon: UsersRound,
      roles: ["ADMIN"],
      metric: russianPlural(users, ["пользователь", "пользователя", "пользователей"]),
      tone: users > 0 ? "ok" : "warn"
    },
    {
      href: "/admin/system",
      title: adminSectionTitles["/admin/system"],
      icon: Activity,
      roles: ["ADMIN"],
      metric: failedJobs > 0 ? russianPlural(failedJobs, ["ошибка", "ошибки", "ошибок"]) : "Без ошибок",
      tone: failedJobs > 0 ? "warn" : "ok"
    },
    {
      href: "/admin/tokens",
      title: adminSectionTitles["/admin/tokens"],
      icon: KeyRound,
      roles: ["ADMIN"],
      metric: russianPlural(apiTokens, ["ключ", "ключа", "ключей"]),
      tone: apiTokens > 0 ? "ok" : "neutral"
    },
    {
      href: "/admin/appearance",
      title: adminSectionTitles["/admin/appearance"],
      icon: Palette,
      roles: ["ADMIN"],
      metric: `${currentTheme.label}, ${currentDensity.label}`,
      tone: "ok"
    },
    {
      href: "/admin/localization",
      title: adminSectionTitles["/admin/localization"],
      icon: Languages,
      roles: ["ADMIN"],
      metric: "Тексты интерфейса",
      tone: "neutral"
    },
    {
      href: "/admin/audit",
      title: adminSectionTitles["/admin/audit"],
      icon: History,
      roles: ["ADMIN", "TEAM_LEAD"],
      metric: russianPlural(recentAuditLogs, ["событие", "события", "событий"]),
      tone: "neutral"
    },
    {
      href: "/admin/report-schedules",
      title: adminSectionTitles["/admin/report-schedules"],
      icon: CalendarClock,
      roles: ["ADMIN", "TEAM_LEAD"],
      metric: russianPlural(reportSchedules, ["активное расписание", "активных расписания", "активных расписаний"]),
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
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin"]}
      description="Главные действия доступны отсюда напрямую, а редкие технические детали остаются внутри профильных разделов."
      actions={quickActions.slice(0, 3).map((action, index) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.href}
            variant={index === 0 ? "default" : "outline"}
            size="sm"
            render={<Link href={action.href} />}
            nativeButton={false}
          >
            <Icon data-icon="inline-start" aria-hidden="true" />
            {action.label}
          </Button>
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
              <Button
                size="sm"
                variant="default"
                render={<Link href={primarySetupCoachmark.href} />}
                nativeButton={false}
              >
                {primarySetupCoachmark.actionLabel}
              </Button>
            ) : undefined
          }
        />

        {visibleCards.length > 0 ? (
          <Card size="sm" aria-labelledby="admin-status-heading">
            <CardHeader className="border-b border-border pb-(--card-spacing)">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Обзор</p>
              <CardTitle id="admin-status-heading">Состояние разделов</CardTitle>
              <CardDescription>Текущее значение и статус по каждой области настроек.</CardDescription>
            </CardHeader>
            <CardContent className="pt-(--card-spacing)">
              <ul className="grid min-w-0 grid-cols-1 gap-1 md:grid-cols-2">
                {visibleCards.map((card) => {
                  const Icon = card.icon;
                  const tone = card.tone ?? "neutral";

                  return (
                    <li key={card.href} className="min-w-0">
                      <Link
                        href={card.href}
                        className="group flex min-w-0 items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 outline-none transition-colors hover:border-border hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span
                          className={cn(
                            "inline-flex size-8 shrink-0 items-center justify-center rounded-md border",
                            toneIconClass(tone)
                          )}
                          aria-hidden="true"
                        >
                          <Icon className="size-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {card.title}
                        </span>
                        {card.metric ? (
                          <Badge
                            variant={metricBadgeVariant(tone)}
                            className="max-w-[50%] shrink-0 truncate tabular-nums"
                          >
                            {card.metric}
                          </Badge>
                        ) : null}
                        <ArrowRight
                          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </AdminFrame>
    </PageShell>
  );
}
