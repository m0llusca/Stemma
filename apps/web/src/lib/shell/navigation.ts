import type { RoleName } from "@prisma/client";
import { adminSectionTitles } from "@/lib/admin-sections";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

export type ShellNavIcon = "today" | "work" | "quality" | "team" | "system";
export type ShellNavModeId = "today" | "work" | "quality" | "team" | "system";

export type ShellNavDestination = {
  href: string;
  label: string;
  description: string;
  aliases: string[];
};

export type ShellNavMode = {
  id: ShellNavModeId;
  href: string;
  label: string;
  compactLabel: string;
  description: string;
  icon: ShellNavIcon;
  destinations: ShellNavDestination[];
};

export type ShellCommandItem = ShellNavDestination & {
  modeId: ShellNavModeId;
  modeLabel: string;
  kind: "mode" | "destination" | "action";
};

export type ShellNavigation = {
  modes: ShellNavMode[];
  commandItems: ShellCommandItem[];
};

export type ShellNavAreaId = "today" | "feedback" | "review" | "calibration" | "coaching" | "analytics" | "settings";
export type ShellNavAreaIcon = "today" | "feedback" | "review" | "calibration" | "coaching" | "analytics" | "settings";

export type ShellNavArea = {
  id: ShellNavAreaId;
  href: string;
  label: string;
  description: string;
  icon: ShellNavAreaIcon;
  /** Only these roles see the area. Undefined = any role (permission still applies). */
  roles?: RoleName[];
  /** Role must hold this permission — mirrors the target page's own guard. */
  permission?: Permission;
};

/**
 * Primary product areas surfaced in the global top navigation bar. Labels and
 * descriptions are derived from the existing mode/destination copy so the two
 * navigation models stay in sync, while the area identity (icon + ordering) is
 * tailored to the flatter top-bar layout.
 */
export const topNavAreas: ShellNavArea[] = [
  {
    id: "today",
    href: "/dashboard",
    label: "Сегодня",
    description: "Пульс дня и следующий управленческий фокус.",
    icon: "today",
    permission: "reviews:read"
  },
  {
    id: "feedback",
    href: "/self-review",
    label: "Моя обратная связь",
    description: "Личный результат, сравнение с командой и ответы на проверки.",
    icon: "feedback",
    roles: ["SUPPORT_AGENT"],
    permission: "feedback:acknowledge"
  },
  {
    id: "review",
    href: "/reviews",
    label: "Проверки",
    description: "Единый список диалогов для проверки и triage.",
    icon: "review",
    permission: "reviews:read"
  },
  {
    id: "calibration",
    href: "/calibration",
    label: "Калибровка",
    description: "Согласование оценок между проверяющими.",
    icon: "calibration",
    permission: "calibration:manage"
  },
  {
    id: "coaching",
    href: "/coaching",
    label: "Обучение",
    description: "Задачи, коучинг и корректирующие действия после проверок.",
    icon: "coaching",
    permission: "training:manage"
  },
  {
    id: "analytics",
    href: "/reports",
    label: "Аналитика",
    description: "Тренды качества, факторы риска и разрезы по командам.",
    icon: "analytics",
    permission: "reports:read"
  },
  {
    id: "settings",
    href: "/admin",
    label: "Настройки",
    description: "Формы оценки, доступы, интеграции и система.",
    icon: "settings",
    // /admin гейтится audit:read — из ролей с настройками это ADMIN и TEAM_LEAD.
    roles: ["ADMIN", "TEAM_LEAD"]
  }
];

/**
 * Top-nav areas a role can actually open: the same roles/permission gating as
 * the mode/destination model, so the bar never links to a page whose own guard
 * would throw «Недостаточно прав».
 */
export function visibleTopNavAreas(role: RoleName): ShellNavArea[] {
  return topNavAreas.filter((area) => canSeeDefinition(role, area));
}

/**
 * Shared prefix matcher: query-string is ignored and a path matches its target
 * or any descendant. Exported so the top-bar shell reuses the exact same
 * active-state semantics as the legacy rail/topbar did.
 */
export function isActivePath(pathname: string, href: string) {
  const path = href.split("?")[0] || href;
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Resolve the active top-nav area for a pathname using a longest-prefix match.
 * Paths without a matching area resolve to `null` (no area highlighted)
 * rather than falling back to a default.
 */
export function activeAreaForPath(pathname: string): ShellNavAreaId | null {
  return (
    topNavAreas
      .filter((area) => isActivePath(pathname, area.href))
      .sort((first, second) => second.href.length - first.href.length)[0]?.id ?? null
  );
}

type DestinationDefinition = ShellNavDestination & {
  roles?: RoleName[];
  permission?: Permission;
};

type ModeDefinition = Omit<ShellNavMode, "href" | "destinations"> & {
  roles?: RoleName[];
  permission?: Permission;
  destinations: DestinationDefinition[];
};

const modeDefinitions: ModeDefinition[] = [
  {
    id: "today",
    label: "Сегодня",
    compactLabel: "Сегодня",
    description: "Пульс дня и следующий управленческий фокус.",
    icon: "today",
    // /dashboard гейтится reviews:read — зеркалим гвард на уровне мода, чтобы
    // роли без права (VIEWER) не получали командных ссылок в никуда.
    permission: "reviews:read",
    destinations: [
      {
        href: "/dashboard",
        label: "Пульс дня",
        description: "Очередь, риск, обучение и последние изменения в одном входном экране.",
        aliases: ["дашборд", "dashboard", "обзор", "пульс"],
        permission: "reviews:read"
      }
    ]
  },
  {
    id: "work",
    label: "Работа",
    compactLabel: "Работа",
    description: "Все, что нужно разобрать, проверить или вернуть в процесс.",
    icon: "work",
    destinations: [
      {
        href: "/reviews",
        label: "Очередь",
        description: "Единый список диалогов для проверки и triage.",
        aliases: ["проверки", "ревью", "queue", "очередь"],
        permission: "reviews:read",
        roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"]
      },
      {
        href: "/reviews?qaStatus=IN_PROGRESS",
        label: "В работе",
        description: "Проверки, которые уже назначены или требуют продолжения.",
        aliases: ["черновики", "назначенные", "in progress"],
        permission: "reviews:read",
        roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"]
      },
      {
        href: "/reviews?status=reviewed&appealStatus=open",
        label: "Апелляции",
        description: "Финальные проверки с открытой обратной связью или спором.",
        aliases: ["споры", "appeals", "feedback"],
        permission: "reviews:read",
        roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"]
      },
      {
        href: "/self-review",
        label: "Моя обратная связь",
        description: "Самопроверка и обратная связь по собственным обращениям.",
        aliases: ["мои проверки", "self review", "feedback"],
        roles: ["SUPPORT_AGENT"]
      }
    ]
  },
  {
    id: "quality",
    label: "Качество",
    compactLabel: "Качество",
    description: "Доверие к оценкам: аналитика, калибровка, правила и выборка.",
    icon: "quality",
    destinations: [
      {
        href: "/reports",
        label: "Аналитика",
        description: "Тренды качества, факторы риска и разрезы по командам.",
        aliases: ["отчеты", "reports", "аналитика"],
        permission: "reports:read"
      },
      {
        href: "/admin/report-schedules",
        label: adminSectionTitles["/admin/report-schedules"],
        description: "Регулярная рассылка отчётов: периодичность, получатели и форматы.",
        aliases: ["расписания", "report schedules", "отчеты по расписанию", "планировщик"],
        // Страница гейтится reports:read, но точка входа скрыта: /admin индекс
        // требует audit:read, а область «Настройки» ограничена ADMIN/TEAM_LEAD.
        // Отдаём её всем, у кого reports:manage (ADMIN, TEAM_LEAD, QA_ANALYST).
        permission: "reports:manage"
      },
      {
        href: "/calibration",
        label: "Калибровка",
        description: "Согласование оценок между проверяющими.",
        aliases: ["calibration", "согласование"],
        permission: "calibration:manage"
      },
      {
        href: "/admin/scorecards",
        label: adminSectionTitles["/admin/scorecards"],
        description: "Scorecards, веса и правила оценки.",
        aliases: ["scorecards", "карты оценки", "критерии"],
        permission: "scorecards:manage"
      },
      {
        href: "/admin/sampling",
        label: adminSectionTitles["/admin/sampling"],
        description: "Политики отбора обращений в QA-процесс.",
        aliases: ["sampling", "отбор", "выборка"],
        permission: "sampling:manage"
      }
    ]
  },
  {
    id: "team",
    label: "Команда",
    compactLabel: "Команда",
    description: "Обучение, коучинг и люди, на которых завязан процесс качества.",
    icon: "team",
    destinations: [
      {
        href: "/coaching",
        label: "Обучение",
        description: "Задачи, коучинг и корректирующие действия после проверок.",
        aliases: ["coaching", "training", "коучинг"],
        permission: "training:manage"
      },
      {
        href: "/admin/users",
        label: adminSectionTitles["/admin/users"],
        description: "Пользователи, роли, линии поддержки и доступ к процессам.",
        aliases: ["users", "пользователи", "команда", "люди"],
        permission: "users:manage"
      }
    ]
  },
  {
    id: "system",
    label: "Система",
    compactLabel: "Система",
    description: "Интеграции, доступы, каналы, внешний вид и контроль платформы.",
    icon: "system",
    destinations: [
      {
        href: "/admin",
        label: adminSectionTitles["/admin"],
        description: "Что настроено, что требует внимания, куда идти дальше.",
        aliases: ["настройки", "admin", "система", "сводка"],
        roles: ["ADMIN", "TEAM_LEAD"]
      },
      {
        href: "/admin/integrations",
        label: adminSectionTitles["/admin/integrations"],
        description: "Helpdesk, API, вебхуки и статусы импортов.",
        aliases: ["источники", "sources", "подключения"],
        permission: "integrations:manage"
      },
      {
        href: "/admin/access",
        label: "Доступ и SSO",
        description: "Identity providers, группы, SCIM и политики доступа.",
        aliases: ["sso", "entra", "active directory", "доступ"],
        permission: "auth_providers:manage"
      },
      {
        href: "/admin/system",
        label: adminSectionTitles["/admin/system"],
        description: "Фоновые задачи, каналы действий и готовность окружения.",
        aliases: ["jobs", "операции", "очередь задач"],
        permission: "backend_jobs:manage"
      },
      {
        href: "/admin/appearance",
        label: adminSectionTitles["/admin/appearance"],
        description: "Брендинг, плотность, палитра и внешний вид рабочего пространства.",
        aliases: ["appearance", "брендинг", "тема", "интерфейс"],
        permission: "appearance:manage"
      },
      {
        href: "/admin/localization",
        label: adminSectionTitles["/admin/localization"],
        description: "Тексты интерфейса и языковые варианты.",
        aliases: ["переводы", "i18n", "язык"],
        permission: "appearance:manage"
      },
      {
        href: "/admin/tokens",
        label: adminSectionTitles["/admin/tokens"],
        description: "Ключи и внешние API-клиенты.",
        aliases: ["api", "tokens", "ключи", "токены"],
        permission: "api_tokens:manage"
      },
      {
        href: "/admin/audit",
        label: adminSectionTitles["/admin/audit"],
        description: "История действий и системных изменений.",
        aliases: ["audit", "журнал", "аудит"],
        permission: "audit:read"
      }
    ]
  }
];

/**
 * Action-type command items turn the ⌘K palette into a real fast path: instead
 * of only jumping to a section, these run the most common manager moves with the
 * exact filters used elsewhere in the product (queue triage, SLA, quarterly
 * analytics, coaching). Routes/filters mirror real links so a click lands on the
 * same filtered view the rest of the app produces.
 */
const actionDefinitions: Array<ShellCommandItem & { permission?: Permission; roles?: RoleName[] }> = [
  {
    href: "/reviews?status=unreviewed",
    label: "Взять следующий кейс",
    description: "Открыть очередь с непроверенными диалогами.",
    aliases: ["следующий кейс", "начать проверку", "next case", "next review", "проверить"],
    modeId: "work",
    modeLabel: "Работа",
    kind: "action",
    permission: "reviews:read",
    roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"]
  },
  {
    href: "/reviews?due=overdue",
    label: "Открыть просроченные SLA",
    description: "Проверки с нарушенным сроком — поднимаются в начало очереди.",
    aliases: ["просрочено", "sla", "overdue", "сроки", "срочно"],
    modeId: "work",
    modeLabel: "Работа",
    kind: "action",
    permission: "reviews:read",
    roles: ["ADMIN", "TEAM_LEAD", "QA_ANALYST"]
  },
  {
    href: "/reports?period=quarter-current",
    label: "Открыть аналитику за квартал",
    description: "Тренды качества и факторы риска за текущий квартал.",
    aliases: ["квартал", "quarter", "аналитика", "отчеты", "reports"],
    modeId: "quality",
    modeLabel: "Качество",
    kind: "action",
    permission: "reports:read"
  },
  {
    href: "/coaching",
    label: "Перейти к обучению",
    description: "Открыть задачи обучения и коучинга.",
    aliases: ["обучение", "training", "коучинг", "coaching"],
    modeId: "team",
    modeLabel: "Команда",
    kind: "action",
    permission: "training:manage"
  }
];

function canSeeDefinition(role: RoleName, definition: { roles?: RoleName[]; permission?: Permission }) {
  if (definition.roles && !definition.roles.includes(role)) {
    return false;
  }

  if (definition.permission && !hasPermission(role, definition.permission)) {
    return false;
  }

  return true;
}

export function buildShellNavigation({ role }: { role: RoleName }): ShellNavigation {
  const modes = modeDefinitions
    .filter((mode) => canSeeDefinition(role, mode))
    .map((mode) => {
      const destinations = mode.destinations.filter((destination) => canSeeDefinition(role, destination));
      const href = destinations[0]?.href ?? "/dashboard";

      return {
        id: mode.id,
        href,
        label: mode.label,
        compactLabel: mode.compactLabel,
        description: mode.description,
        icon: mode.icon,
        destinations
      } satisfies ShellNavMode;
    })
    .filter((mode) => mode.destinations.length > 0);

  const destinationCommands = modes.flatMap((mode) => [
    {
      href: mode.href,
      label: mode.label,
      description: mode.description,
      aliases: [mode.label, mode.compactLabel],
      modeId: mode.id,
      modeLabel: mode.label,
      kind: "mode" as const
    },
    ...mode.destinations.map((destination) => ({
      ...destination,
      modeId: mode.id,
      modeLabel: mode.label,
      kind: "destination" as const
    }))
  ]);
  const actions = actionDefinitions.filter((action) => canSeeDefinition(role, action));

  return {
    modes,
    commandItems: [...destinationCommands, ...actions]
  };
}
