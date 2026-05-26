export const defaultUiTheme = "graphite";
export const defaultUiDensity = "comfortable";
export const defaultUiCorners = "medium";
export const defaultUiContrast = "standard";

export const uiThemeOptions = [
  {
    id: "graphite",
    label: "Graphite",
    description: "Сдержанная рабочая тема: темная навигация, чистые панели, кобальтовый акцент.",
    accent: "#3157d5",
    surface: "#eef2f6",
    panel: "#ffffff",
    panelHeader: "#f7f9fc",
    sidebar: "#101720",
    primary: "#2445b8",
    dark: {
      accent: "#60a5fa",
      surface: "#070b12",
      panel: "#111827",
      panelHeader: "#152033",
      sidebar: "#020617",
      primary: "#2563eb"
    }
  },
  {
    id: "azure",
    label: "Cobalt",
    description: "Более контрастная синяя тема для отчетов, очередей и плотных операционных экранов.",
    accent: "#0f5fff",
    surface: "#eff6ff",
    panel: "#f8fbff",
    panelHeader: "#e8f2ff",
    sidebar: "#061a38",
    primary: "#0747a6",
    dark: {
      accent: "#60a5fa",
      surface: "#061326",
      panel: "#0b1f3a",
      panelHeader: "#0d2b50",
      sidebar: "#020b1a",
      primary: "#2563eb"
    }
  },
  {
    id: "emerald",
    label: "Emerald",
    description: "Зеленовато-синяя тема для спокойной навигации; success-статусы остаются отдельным зеленым.",
    accent: "#0f766e",
    surface: "#f0fdfa",
    panel: "#fbfffd",
    panelHeader: "#e7fbf3",
    sidebar: "#04201a",
    primary: "#064e3b",
    dark: {
      accent: "#34d399",
      surface: "#031712",
      panel: "#08231d",
      panelHeader: "#0b332a",
      sidebar: "#02120f",
      primary: "#0f766e"
    }
  },
  {
    id: "violet",
    label: "Violet",
    description: "Заметная фиолетовая тема для команд, которым нужны более выраженные акценты.",
    accent: "#7c3aed",
    surface: "#f5f3ff",
    panel: "#fefcff",
    panelHeader: "#f0ebff",
    sidebar: "#160f2f",
    primary: "#4c1d95",
    dark: {
      accent: "#a78bfa",
      surface: "#120b24",
      panel: "#1d1535",
      panelHeader: "#281e49",
      sidebar: "#0d071c",
      primary: "#7c3aed"
    }
  },
  {
    id: "amber",
    label: "Amber",
    description: "Теплая тема для админских и обучающих сценариев с янтарным акцентом.",
    accent: "#b45309",
    surface: "#fffbeb",
    panel: "#fffdf7",
    panelHeader: "#fff3db",
    sidebar: "#201307",
    primary: "#7c2d12",
    dark: {
      accent: "#f59e0b",
      surface: "#1c1206",
      panel: "#2a1a08",
      panelHeader: "#3a250c",
      sidebar: "#140c04",
      primary: "#b45309"
    }
  },
  {
    id: "rose",
    label: "Rose",
    description: "Высокозаметная розово-красная тема для команд, работающих с рисками и эскалациями.",
    accent: "#e11d48",
    surface: "#fff1f4",
    panel: "#fffafa",
    panelHeader: "#ffecef",
    sidebar: "#250915",
    primary: "#881337",
    dark: {
      accent: "#fb7185",
      surface: "#210914",
      panel: "#34111d",
      panelHeader: "#471827",
      sidebar: "#17050d",
      primary: "#be123c"
    }
  }
] as const;

export const uiDensityOptions = [
  {
    id: "compact",
    label: "Compact",
    description: "Больше строк и данных на экране.",
    preview: "Плотно"
  },
  {
    id: "comfortable",
    label: "Comfortable",
    description: "Баланс плотности и читаемости.",
    preview: "Стандарт"
  },
  {
    id: "spacious",
    label: "Spacious",
    description: "Больше воздуха для презентационного режима.",
    preview: "Свободно"
  }
] as const;

export const uiCornersOptions = [
  {
    id: "sharp",
    label: "Sharp",
    description: "Более строгие углы для dense UI.",
    previewRadius: "6px"
  },
  {
    id: "medium",
    label: "Medium",
    description: "Базовый радиус интерфейса.",
    previewRadius: "10px"
  },
  {
    id: "soft",
    label: "Soft",
    description: "Более мягкие панели и контролы.",
    previewRadius: "18px"
  }
] as const;

export const uiContrastOptions = [
  {
    id: "standard",
    label: "Standard",
    description: "Обычная контрастность для ежедневной работы."
  },
  {
    id: "high",
    label: "High",
    description: "Сильнее границы, текст и интерактивные состояния."
  }
] as const;

export type UiThemeId = (typeof uiThemeOptions)[number]["id"];
export type UiDensityId = (typeof uiDensityOptions)[number]["id"];
export type UiCornersId = (typeof uiCornersOptions)[number]["id"];
export type UiContrastId = (typeof uiContrastOptions)[number]["id"];

const uiThemeIds = new Set<string>(uiThemeOptions.map((theme) => theme.id));
const uiDensityIds = new Set<string>(uiDensityOptions.map((option) => option.id));
const uiCornersIds = new Set<string>(uiCornersOptions.map((option) => option.id));
const uiContrastIds = new Set<string>(uiContrastOptions.map((option) => option.id));

export function isUiThemeId(value: string): value is UiThemeId {
  return uiThemeIds.has(value);
}

export function isUiDensityId(value: string): value is UiDensityId {
  return uiDensityIds.has(value);
}

export function isUiCornersId(value: string): value is UiCornersId {
  return uiCornersIds.has(value);
}

export function isUiContrastId(value: string): value is UiContrastId {
  return uiContrastIds.has(value);
}

export function resolveUiTheme(value: string | null | undefined): UiThemeId {
  return value && isUiThemeId(value) ? value : defaultUiTheme;
}

export function resolveUiDensity(value: string | null | undefined): UiDensityId {
  return value && isUiDensityId(value) ? value : defaultUiDensity;
}

export function resolveUiCorners(value: string | null | undefined): UiCornersId {
  return value && isUiCornersId(value) ? value : defaultUiCorners;
}

export function resolveUiContrast(value: string | null | undefined): UiContrastId {
  return value && isUiContrastId(value) ? value : defaultUiContrast;
}

export function resolveUiAppearance(input: {
  uiTheme?: string | null;
  uiDensity?: string | null;
  uiCorners?: string | null;
  uiContrast?: string | null;
}) {
  return {
    uiTheme: resolveUiTheme(input.uiTheme),
    uiDensity: resolveUiDensity(input.uiDensity),
    uiCorners: resolveUiCorners(input.uiCorners),
    uiContrast: resolveUiContrast(input.uiContrast)
  };
}

export function getUiThemeOption(value: string | null | undefined) {
  const theme = resolveUiTheme(value);
  return uiThemeOptions.find((option) => option.id === theme) ?? uiThemeOptions[0];
}

export function getUiDensityOption(value: string | null | undefined) {
  const density = resolveUiDensity(value);
  return uiDensityOptions.find((option) => option.id === density) ?? uiDensityOptions[1];
}

export function getUiCornersOption(value: string | null | undefined) {
  const corners = resolveUiCorners(value);
  return uiCornersOptions.find((option) => option.id === corners) ?? uiCornersOptions[1];
}

export function getUiContrastOption(value: string | null | undefined) {
  const contrast = resolveUiContrast(value);
  return uiContrastOptions.find((option) => option.id === contrast) ?? uiContrastOptions[0];
}
