import {
  isBrandHexColor,
  resolveWorkspaceBranding
} from "@/lib/ui-branding";
export {
  defaultBrandAccentColor,
  defaultBrandMark,
  defaultBrandName,
  defaultBrandPrimaryColor,
  defaultBrandTagline,
  isBrandHexColor,
  isBrandLogoUrl,
  maxBrandLogoUrlLength,
  normalizeBrandLogoUrl,
  normalizeBrandMark,
  normalizeBrandText,
  resolveBrandColor,
  resolveWorkspaceBranding,
  type WorkspaceBranding
} from "@/lib/ui-branding";

export const defaultUiTheme = "graphite";
export const defaultUiDensity = "comfortable";
export const defaultUiCorners = "medium";
export const defaultUiContrast = "standard";

export const uiPaletteTokenOptions = [
  { id: "accent", label: "Акцент", cssVariable: "--accent", group: "brand" },
  { id: "accentStrong", label: "Сильный акцент", cssVariable: "--accent-strong", group: "brand" },
  { id: "buttonPrimaryBg", label: "Primary кнопка", cssVariable: "--button-primary-bg", group: "buttons" },
  { id: "buttonPrimaryHover", label: "Primary hover", cssVariable: "--button-primary-hover", group: "buttons" },
  { id: "buttonPrimaryText", label: "Текст кнопки", cssVariable: "--button-primary-text", group: "buttons" },
  { id: "sidebarBg", label: "Фон сайдбара", cssVariable: "--sidebar-bg", group: "sidebar" },
  { id: "sidebarAccent", label: "Активный пункт", cssVariable: "--sidebar-accent", group: "sidebar" },
  { id: "background", label: "Фон приложения", cssVariable: "--background", group: "surfaces" },
  { id: "panel", label: "Панель", cssVariable: "--panel", group: "surfaces" },
  { id: "panelMuted", label: "Мягкая панель", cssVariable: "--panel-muted", group: "surfaces" },
  { id: "panelTint", label: "Hover/tint", cssVariable: "--panel-tint", group: "surfaces" },
  { id: "panelHeader", label: "Шапка панели", cssVariable: "--panel-header", group: "surfaces" },
  { id: "border", label: "Границы", cssVariable: "--border", group: "surfaces" },
  { id: "success", label: "Успех", cssVariable: "--success", group: "status" },
  { id: "warning", label: "Внимание", cssVariable: "--warning", group: "status" },
  { id: "danger", label: "Риск", cssVariable: "--danger", group: "status" }
] as const;

export const uiThemeOptions = [
  {
    id: "graphite",
    label: "Graphite",
    description: "Нейтральная рабочая тема с темной навигацией, ясными панелями и спокойным синим акцентом.",
    mode: "light",
    accent: "#2f5fff",
    surface: "#eef3f8",
    panel: "#ffffff",
    panelHeader: "#f6f8fb",
    sidebar: "#121a26",
    primary: "#274fc7"
  },
  {
    id: "azure",
    label: "Signal Blue",
    description: "Холодная синяя палитра для аналитики, очередей и экранов с большим количеством сигналов.",
    mode: "light",
    accent: "#2563eb",
    surface: "#edf5ff",
    panel: "#fbfdff",
    panelHeader: "#eaf2ff",
    sidebar: "#071a33",
    primary: "#1d4ed8"
  },
  {
    id: "emerald",
    label: "Mint Steel",
    description: "Спокойная зелено-синяя палитра для команд, которым нужен менее холодный рабочий интерфейс.",
    mode: "light",
    accent: "#0f8f84",
    surface: "#eefbf8",
    panel: "#fbfffd",
    panelHeader: "#e8f7f3",
    sidebar: "#06231f",
    primary: "#0b6f66"
  },
  {
    id: "violet",
    label: "Iris",
    description: "Глубокая фиолетовая тема без неонового эффекта, хорошо работает для брендированных демо.",
    mode: "light",
    accent: "#6d4aff",
    surface: "#f4f2ff",
    panel: "#fefcff",
    panelHeader: "#efecff",
    sidebar: "#17112c",
    primary: "#5338d5"
  },
  {
    id: "amber",
    label: "Copper",
    description: "Теплая медная палитра для демонстраций, обучения и админских сценариев.",
    mode: "light",
    accent: "#b85f17",
    surface: "#fff7ed",
    panel: "#fffdf8",
    panelHeader: "#fff0dd",
    sidebar: "#24180b",
    primary: "#9a4312"
  },
  {
    id: "rose",
    label: "Cranberry",
    description: "Собранная красная палитра для команд, где важны риски, эскалации и контроль качества.",
    mode: "light",
    accent: "#cf244d",
    surface: "#fff2f5",
    panel: "#fffafb",
    panelHeader: "#ffedf1",
    sidebar: "#2a0e19",
    primary: "#a41437"
  },
  {
    id: "ops",
    label: "Night Ops",
    description: "Темная операционная тема для мониторов, очередей и дежурных рабочих пространств.",
    mode: "dark",
    accent: "#5ea0ff",
    surface: "#0b0f17",
    panel: "#151a24",
    panelHeader: "#1c2230",
    sidebar: "#0a0e15",
    primary: "#2563eb"
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
export type ThemeDefinition = Readonly<{
  id: UiThemeId;
  label: string;
  description: string;
  mode: "light" | "dark";
}>;
export type UiDensityId = (typeof uiDensityOptions)[number]["id"];
export type UiCornersId = (typeof uiCornersOptions)[number]["id"];
export type UiContrastId = (typeof uiContrastOptions)[number]["id"];
export type UiPaletteToken = (typeof uiPaletteTokenOptions)[number]["id"];
export type UiPaletteOverrides = Partial<Record<UiPaletteToken, string>>;

const uiThemeIds = new Set<string>(uiThemeOptions.map((theme) => theme.id));
const uiDensityIds = new Set<string>(uiDensityOptions.map((option) => option.id));
const uiCornersIds = new Set<string>(uiCornersOptions.map((option) => option.id));
const uiContrastIds = new Set<string>(uiContrastOptions.map((option) => option.id));
const uiPaletteTokenIds = new Set<string>(uiPaletteTokenOptions.map((option) => option.id));

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

export function isUiPaletteToken(value: string): value is UiPaletteToken {
  return uiPaletteTokenIds.has(value);
}

function stablePaletteJson(overrides: UiPaletteOverrides) {
  const entries = uiPaletteTokenOptions
    .map((token) => [token.id, overrides[token.id]] as const)
    .filter((entry): entry is readonly [UiPaletteToken, string] => Boolean(entry[1]));

  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : "{}";
}

export function sanitizeUiPaletteOverrides(value: unknown): UiPaletteOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: UiPaletteOverrides = {};

  for (const [key, rawValue] of Object.entries(value)) {
    if (!isUiPaletteToken(key) || typeof rawValue !== "string") {
      continue;
    }

    const normalized = rawValue.trim();

    if (isBrandHexColor(normalized)) {
      result[key] = normalized;
    }
  }

  return result;
}

export function parseUiPaletteOverridesJson(value: string | null | undefined): UiPaletteOverrides {
  const normalized = (value ?? "").trim();

  if (!normalized) {
    return {};
  }

  try {
    return sanitizeUiPaletteOverrides(JSON.parse(normalized));
  } catch {
    return {};
  }
}

export function serializeUiPaletteOverrides(overrides: UiPaletteOverrides) {
  return stablePaletteJson(sanitizeUiPaletteOverrides(overrides));
}

export function validateUiPaletteOverridesJson(value: string | null | undefined) {
  const normalized = (value ?? "").trim();

  if (!normalized) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("Палитра интерфейса должна быть корректным JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Палитра интерфейса должна быть объектом.");
  }

  for (const [key, rawValue] of Object.entries(parsed)) {
    if (!isUiPaletteToken(key)) {
      throw new Error("Палитра содержит неизвестный токен интерфейса.");
    }

    if (typeof rawValue !== "string" || !isBrandHexColor(rawValue.trim())) {
      throw new Error("Все цвета интерфейса должны быть в формате #RRGGBB.");
    }
  }

  return sanitizeUiPaletteOverrides(parsed);
}

export function uiPaletteOverridesToCssVariables(overrides: UiPaletteOverrides) {
  const cssVariables: Record<string, string> = {};

  for (const token of uiPaletteTokenOptions) {
    const value = overrides[token.id];

    if (value) {
      cssVariables[token.cssVariable] = value;
    }
  }

  if (overrides.accent) {
    cssVariables["--accent-soft"] = `color-mix(in srgb, ${overrides.accent} 12%, var(--panel))`;
    cssVariables["--accent-muted"] = `color-mix(in srgb, ${overrides.accent} 18%, var(--panel))`;
    cssVariables["--accent-border"] = `color-mix(in srgb, ${overrides.accent} 42%, var(--border))`;
    cssVariables["--control-selected-bg"] = `color-mix(in srgb, ${overrides.accent} 12%, var(--panel))`;
    cssVariables["--control-selected-border"] = `color-mix(in srgb, ${overrides.accent} 44%, var(--border))`;
  }

  if (overrides.sidebarAccent) {
    cssVariables["--sidebar-glow"] = `color-mix(in srgb, ${overrides.sidebarAccent} 18%, transparent)`;
    cssVariables["--sidebar-active-icon"] = `color-mix(in srgb, ${overrides.sidebarAccent} 24%, transparent)`;
  }

  if (overrides.success) {
    cssVariables["--success-soft"] = `color-mix(in srgb, ${overrides.success} 12%, var(--panel))`;
  }

  if (overrides.warning) {
    cssVariables["--warning-soft"] = `color-mix(in srgb, ${overrides.warning} 12%, var(--panel))`;
  }

  if (overrides.danger) {
    cssVariables["--danger-soft"] = `color-mix(in srgb, ${overrides.danger} 12%, var(--panel))`;
  }

  return cssVariables;
}

export function resolveUiAppearance(input: {
  uiTheme?: string | null;
  uiDensity?: string | null;
  uiCorners?: string | null;
  uiContrast?: string | null;
  brandName?: string | null;
  brandTagline?: string | null;
  brandLogoUrl?: string | null;
  brandLogoAlt?: string | null;
  brandMark?: string | null;
  brandPrimaryColor?: string | null;
  brandAccentColor?: string | null;
  uiPaletteOverridesJson?: string | null;
}) {
  const uiPaletteOverrides = parseUiPaletteOverridesJson(input.uiPaletteOverridesJson);

  return {
    ...resolveWorkspaceBranding(input),
    uiTheme: resolveUiTheme(input.uiTheme),
    uiDensity: resolveUiDensity(input.uiDensity),
    uiCorners: resolveUiCorners(input.uiCorners),
    uiContrast: resolveUiContrast(input.uiContrast),
    uiPaletteOverrides,
    uiPaletteOverridesJson: serializeUiPaletteOverrides(uiPaletteOverrides)
  };
}

export type UiAppearance = ReturnType<typeof resolveUiAppearance>;

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
