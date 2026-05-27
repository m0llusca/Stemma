export type SettingCoachmarkId =
  | "scorecards"
  | "sampling"
  | "integrations"
  | "access"
  | "groupMappings"
  | "users"
  | "apiTokens"
  | "brandLogo"
  | "componentPalette";

export type SettingsSetupState = Partial<{
  activeScorecardVersion: number | null;
  activeSamplingRules: number;
  integrationCount: number;
  activeIntegrationCount: number;
  nonDemoProviderCount: number;
  activeProviderCount: number;
  activeGroupMappings: number;
  apiTokenCount: number;
  userCount: number;
  brandLogoUrl: string | null;
  uiPaletteOverridesJson: string | null;
}>;

export type SettingsCoachmark = {
  id: SettingCoachmarkId;
  title: string;
  body: string;
  href: string;
  actionLabel: string;
};

const coachmarkContent: Record<SettingCoachmarkId, SettingsCoachmark> = {
  scorecards: {
    id: "scorecards",
    title: "Начните с формы оценки",
    body: "Без активной формы новые проверки не получают критерии, веса и понятную шкалу качества.",
    href: "/admin/scorecards?section=create",
    actionLabel: "Настроить форму"
  },
  sampling: {
    id: "sampling",
    title: "Добавьте правила выборки",
    body: "Правила объясняют, почему обращения попадают в очередь: случайная выборка, CSAT, новый оператор или ручной сигнал.",
    href: "/admin/sampling?section=create",
    actionLabel: "Создать правило"
  },
  integrations: {
    id: "integrations",
    title: "Подключите первый источник",
    body: "Интеграция приносит реальные обращения, диагностику и историю импортов вместо ручного наполнения очереди.",
    href: "/admin/integrations/new",
    actionLabel: "Подключить"
  },
  access: {
    id: "access",
    title: "Настройте боевой вход",
    body: "После провайдера SSO пользователи смогут входить через корпоративный каталог, а не только локальные учетные записи.",
    href: "/admin/access?section=provider",
    actionLabel: "Настроить SSO"
  },
  groupMappings: {
    id: "groupMappings",
    title: "Свяжите группы с ролями",
    body: "Групповые правила переводят AD или Entra-группы в роли платформы без ручного изменения каждого пользователя.",
    href: "/admin/access?section=mappings",
    actionLabel: "Добавить группу"
  },
  users: {
    id: "users",
    title: "Добавьте команду",
    body: "Минимальный рабочий набор: администратор, QA-аналитик, руководитель и несколько операторов для очереди и отчетов.",
    href: "/admin/users?create=1",
    actionLabel: "Создать пользователя"
  },
  apiTokens: {
    id: "apiTokens",
    title: "Выпустите API-ключ",
    body: "Ключ нужен для собственного импорта, интеграционных smoke-проверок и загрузки обращений через публичный API.",
    href: "/admin/tokens?section=create",
    actionLabel: "Новый ключ"
  },
  brandLogo: {
    id: "brandLogo",
    title: "Добавьте логотип",
    body: "Логотип делает рабочее пространство узнаваемым в сайдбаре, превью бренда и экспортируемых материалах.",
    href: "/admin/appearance",
    actionLabel: "Загрузить"
  },
  componentPalette: {
    id: "componentPalette",
    title: "Зафиксируйте палитру компонентов",
    body: "Ручные цвета для кнопок, сайдбара, поверхностей и статусов сохраняют единый язык интерфейса поверх выбранной темы.",
    href: "/admin/appearance",
    actionLabel: "Настроить цвета"
  }
};

function positive(value: number | null | undefined) {
  return typeof value === "number" && value > 0;
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export function hasAppearancePaletteOverrides(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized || normalized === "{}") {
    return false;
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length > 0);
  } catch {
    return false;
  }
}

export function isSettingBlockConfigured(id: SettingCoachmarkId, state: SettingsSetupState) {
  switch (id) {
    case "scorecards":
      return positive(state.activeScorecardVersion);
    case "sampling":
      return positive(state.activeSamplingRules);
    case "integrations":
      return positive(state.activeIntegrationCount);
    case "access":
      return positive(state.activeProviderCount);
    case "groupMappings":
      return !positive(state.activeProviderCount) || positive(state.activeGroupMappings);
    case "users":
      return (state.userCount ?? 0) > 1;
    case "apiTokens":
      return positive(state.apiTokenCount);
    case "brandLogo":
      return hasText(state.brandLogoUrl);
    case "componentPalette":
      return hasAppearancePaletteOverrides(state.uiPaletteOverridesJson);
  }
}

export function getMissingSettingsCoachmarks(state: SettingsSetupState) {
  const ids: SettingCoachmarkId[] = [
    "scorecards",
    "sampling",
    "integrations",
    "access",
    "groupMappings",
    "users",
    "apiTokens",
    "brandLogo",
    "componentPalette"
  ];

  return ids
    .filter((id) => {
      if (id === "groupMappings") {
        return positive(state.activeProviderCount) && !isSettingBlockConfigured(id, state);
      }

      return !isSettingBlockConfigured(id, state);
    })
    .map((id) => coachmarkContent[id]);
}

export function getSettingCoachmark(id: SettingCoachmarkId) {
  return coachmarkContent[id];
}
