"use client";

import type { CSSProperties, ChangeEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, Gauge, ImageUp, Layers3, Palette, RotateCcw, Rows3, Type, X } from "lucide-react";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { getSettingCoachmark, hasAppearancePaletteOverrides } from "@/lib/admin-setup-guidance";
import { updateWorkspaceAppearance } from "@/lib/ui-theme-actions";
import {
  maxBrandLogoUrlLength,
  type UiAppearance,
  type UiContrastId,
  type UiCornersId,
  type UiDensityId,
  type UiPaletteOverrides,
  type UiPaletteToken,
  type UiThemeId,
  type WorkspaceBranding,
  serializeUiPaletteOverrides,
  uiContrastOptions,
  uiCornersOptions,
  uiDensityOptions,
  uiPaletteOverridesToCssVariables,
  uiPaletteTokenOptions,
  uiThemeOptions
} from "@/lib/ui-theme";

type AppearanceState = UiAppearance;

type AppearanceField = keyof AppearanceState;
type SaveState = "idle" | "saving" | "saved" | "error";

type AppearanceSettingsFormProps = {
  initialAppearance: AppearanceState;
};

const appearanceFields = [
  "brandName",
  "brandTagline",
  "brandLogoUrl",
  "brandLogoAlt",
  "brandMark",
  "brandPrimaryColor",
  "brandAccentColor",
  "uiPaletteOverridesJson",
  "uiTheme",
  "uiDensity",
  "uiCorners",
  "uiContrast"
] as const satisfies readonly AppearanceField[];

const maxLogoUploadSize = 240 * 1024;
const allowedLogoTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

const brandColorPresets = [
  { name: "Cobalt", primary: "#2f5fff", accent: "#7c97ff", button: "#274fc7", sidebar: "#121a26" },
  { name: "Teal", primary: "#0f8f84", accent: "#2dd4bf", button: "#0b6f66", sidebar: "#06231f" },
  { name: "Ink", primary: "#172033", accent: "#6b7a90", button: "#263244", sidebar: "#0d1420" },
  { name: "Cranberry", primary: "#cf244d", accent: "#fb7185", button: "#a41437", sidebar: "#2a0e19" }
] as const;

const paletteGroups = [
  {
    id: "buttons",
    title: "Кнопки",
    description: "Основные действия, hover и текст primary-кнопки.",
    tokens: ["buttonPrimaryBg", "buttonPrimaryHover", "buttonPrimaryText"] satisfies UiPaletteToken[]
  },
  {
    id: "sidebar",
    title: "Сайдбар",
    description: "Фон навигации и цвет активных элементов.",
    tokens: ["sidebarBg", "sidebarAccent"] satisfies UiPaletteToken[]
  },
  {
    id: "surfaces",
    title: "Поверхности",
    description: "Фон приложения, панели, мягкие блоки и границы.",
    tokens: ["background", "panel", "panelMuted", "panelTint", "panelHeader", "border"] satisfies UiPaletteToken[]
  },
  {
    id: "status",
    title: "Статусы",
    description: "Успех, предупреждения и высокий риск.",
    tokens: ["success", "warning", "danger"] satisfies UiPaletteToken[]
  }
] as const;

const defaultStatusPalette = {
  success: "#15803d",
  warning: "#b45309",
  danger: "#b91c1c",
  buttonPrimaryText: "#ffffff"
} as const;

const previewPaletteVariableNames = [
  ...uiPaletteTokenOptions.map((token) => token.cssVariable),
  "--accent-soft",
  "--accent-muted",
  "--accent-border",
  "--control-selected-bg",
  "--control-selected-border",
  "--sidebar-glow",
  "--sidebar-active-icon",
  "--success-soft",
  "--warning-soft",
  "--danger-soft"
] as const;

function themePreviewStyle(theme: (typeof uiThemeOptions)[number]) {
  return {
    "--theme-accent": theme.accent,
    "--theme-surface": theme.surface,
    "--theme-panel": theme.panel,
    "--theme-panel-header": theme.panelHeader,
    "--theme-sidebar": theme.sidebar,
    "--theme-primary": theme.primary
  } as CSSProperties;
}

function cornersPreviewStyle(radius: string) {
  return { "--corner-preview-radius": radius } as CSSProperties;
}

function brandPreviewStyle(appearance: AppearanceState) {
  return {
    "--preview-brand-primary": appearance.brandPrimaryColor,
    "--preview-brand-accent": appearance.brandAccentColor,
    "--preview-button": appearance.uiPaletteOverrides.buttonPrimaryBg ?? appearance.brandPrimaryColor,
    "--preview-sidebar": appearance.uiPaletteOverrides.sidebarBg ?? "#101720",
    "--preview-sidebar-accent": appearance.uiPaletteOverrides.sidebarAccent ?? appearance.brandAccentColor
  } as CSSProperties;
}

function getThemeDefaults(themeId: UiThemeId): UiPaletteOverrides {
  const theme = uiThemeOptions.find((option) => option.id === themeId) ?? uiThemeOptions[0];

  return {
    accent: theme.accent,
    accentStrong: theme.primary,
    buttonPrimaryBg: theme.primary,
    buttonPrimaryHover: theme.accent,
    buttonPrimaryText: defaultStatusPalette.buttonPrimaryText,
    sidebarBg: theme.sidebar,
    sidebarAccent: theme.accent,
    background: theme.surface,
    panel: theme.panel,
    panelMuted: theme.panelHeader,
    panelTint: theme.panelHeader,
    panelHeader: theme.panelHeader,
    border: "#d8e0ea",
    success: defaultStatusPalette.success,
    warning: defaultStatusPalette.warning,
    danger: defaultStatusPalette.danger
  };
}

function paletteValue(appearance: AppearanceState, token: UiPaletteToken) {
  return appearance.uiPaletteOverrides[token] ?? getThemeDefaults(appearance.uiTheme)[token] ?? "#3157d5";
}

function paletteTokenLabel(token: UiPaletteToken) {
  return uiPaletteTokenOptions.find((option) => option.id === token)?.label ?? token;
}

function appearanceToBranding(appearance: AppearanceState): WorkspaceBranding {
  return {
    brandName: appearance.brandName,
    brandTagline: appearance.brandTagline,
    brandLogoUrl: appearance.brandLogoUrl,
    brandLogoAlt: appearance.brandLogoAlt,
    brandMark: appearance.brandMark,
    brandPrimaryColor: appearance.brandPrimaryColor,
    brandAccentColor: appearance.brandAccentColor
  };
}

function appearanceToFormData(appearance: AppearanceState) {
  const formData = new FormData();
  formData.set("brandName", appearance.brandName);
  formData.set("brandTagline", appearance.brandTagline);
  formData.set("brandLogoUrl", appearance.brandLogoUrl);
  formData.set("brandLogoAlt", appearance.brandLogoAlt);
  formData.set("brandMark", appearance.brandMark);
  formData.set("brandPrimaryColor", appearance.brandPrimaryColor);
  formData.set("brandAccentColor", appearance.brandAccentColor);
  formData.set("uiPaletteOverridesJson", serializeUiPaletteOverrides(appearance.uiPaletteOverrides));
  formData.set("uiTheme", appearance.uiTheme);
  formData.set("uiDensity", appearance.uiDensity);
  formData.set("uiCorners", appearance.uiCorners);
  formData.set("uiContrast", appearance.uiContrast);
  return formData;
}

function appearancesEqual(left: AppearanceState, right: AppearanceState) {
  return appearanceFields.every((field) => left[field] === right[field]);
}

function saveStatusLabel(state: SaveState) {
  if (state === "saving") {
    return "Сохраняем автоматически...";
  }

  if (state === "saved") {
    return "Сохранено";
  }

  if (state === "error") {
    return "Не удалось сохранить. Изменение видно до обновления страницы.";
  }

  return "Изменения применяются в предпросмотре и сохраняются автоматически.";
}

export function AppearanceSettingsForm({ initialAppearance }: AppearanceSettingsFormProps) {
  const [appearance, setAppearance] = useState<AppearanceState>(initialAppearance);
  const [openSections, setOpenSections] = useState({ branding: false, theme: false, palette: false, ui: false });
  const [logoError, setLogoError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [, startTransition] = useTransition();
  const latestAppearanceRef = useRef<AppearanceState>(initialAppearance);
  const lastPersistedRef = useRef<AppearanceState>(initialAppearance);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const hasQueuedSaveRef = useRef(false);
  const hasMountedRef = useRef(false);

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const persistLatest = () => {
    if (isSavingRef.current) {
      hasQueuedSaveRef.current = true;
      return;
    }

    const snapshot = latestAppearanceRef.current;

    if (appearancesEqual(snapshot, lastPersistedRef.current)) {
      setSaveState("saved");
      return;
    }

    isSavingRef.current = true;
    hasQueuedSaveRef.current = false;
    setSaveState("saving");

    startTransition(() => {
      void updateWorkspaceAppearance(appearanceToFormData(snapshot))
        .then(() => {
          lastPersistedRef.current = snapshot;
          setSaveState("saved");
        })
        .catch(() => {
          setSaveState("error");
        })
        .finally(() => {
          isSavingRef.current = false;

          if (hasQueuedSaveRef.current) {
            hasQueuedSaveRef.current = false;
            persistLatest();
          }
        });
    });
  };

  const schedulePersist = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    setSaveState("saving");
    saveTimerRef.current = setTimeout(persistLatest, 180);
  };

  useEffect(() => {
    latestAppearanceRef.current = appearance;

    document.body.dataset.theme = appearance.uiTheme;
    document.body.dataset.density = appearance.uiDensity;
    document.body.dataset.corners = appearance.uiCorners;
    document.body.dataset.contrast = appearance.uiContrast;
    document.body.style.setProperty("--brand-primary", appearance.brandPrimaryColor);
    document.body.style.setProperty("--brand-accent", appearance.brandAccentColor);
    for (const variableName of previewPaletteVariableNames) {
      document.body.style.removeProperty(variableName);
    }
    for (const [variableName, value] of Object.entries(uiPaletteOverridesToCssVariables(appearance.uiPaletteOverrides))) {
      document.body.style.setProperty(variableName, value);
    }
    window.dispatchEvent(new CustomEvent("qc-branding-preview", { detail: appearanceToBranding(appearance) }));

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    schedulePersist();

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [appearance]);

  const patchAppearance = (patch: Partial<AppearanceState>) => {
    setAppearance((current) => ({
      ...current,
      ...patch
    }));
  };

  const updateAppearance = (field: AppearanceField, value: AppearanceState[AppearanceField]) => {
    patchAppearance({ [field]: value } as Partial<AppearanceState>);
  };

  const updatePaletteOverride = (token: UiPaletteToken, value: string) => {
    const nextOverrides = {
      ...appearance.uiPaletteOverrides,
      [token]: value
    };
    const nextOverridesJson = serializeUiPaletteOverrides(nextOverrides);

    patchAppearance({
      uiPaletteOverrides: nextOverrides,
      uiPaletteOverridesJson: nextOverridesJson
    });
  };

  const resetPaletteOverride = (token: UiPaletteToken) => {
    const nextOverrides = { ...appearance.uiPaletteOverrides };
    delete nextOverrides[token];

    patchAppearance({
      uiPaletteOverrides: nextOverrides,
      uiPaletteOverridesJson: serializeUiPaletteOverrides(nextOverrides)
    });
  };

  const resetPaletteOverrides = () => {
    patchAppearance({
      uiPaletteOverrides: {},
      uiPaletteOverridesJson: "{}"
    });
  };

  const handleChange =
    <Field extends AppearanceField>(field: Field) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      updateAppearance(field, event.target.value as AppearanceState[Field]);
    };

  const handleThemeChange = (event: ChangeEvent<HTMLInputElement>) => {
    patchAppearance({
      uiTheme: event.target.value as UiThemeId,
      uiPaletteOverrides: {},
      uiPaletteOverridesJson: "{}"
    });
  };

  const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!allowedLogoTypes.has(file.type)) {
      setLogoError("Поддерживаются только PNG, JPG и WebP.");
      return;
    }

    if (file.size > maxLogoUploadSize) {
      setLogoError("Файл должен быть до 240 КБ.");
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string" || reader.result.length > maxBrandLogoUrlLength) {
        setLogoError("Не удалось подготовить логотип для сохранения.");
        return;
      }

      setLogoError("");
      patchAppearance({
        brandLogoUrl: reader.result,
        brandLogoAlt: appearance.brandLogoAlt || appearance.brandName
      });
    });
    reader.addEventListener("error", () => {
      setLogoError("Не удалось прочитать файл.");
    });
    reader.readAsDataURL(file);
  };

  const logoIsUploaded = appearance.brandLogoUrl.startsWith("data:image/");
  const logoUrlValue = logoIsUploaded ? "" : appearance.brandLogoUrl;
  const brandLogoHint = appearance.brandLogoUrl ? null : getSettingCoachmark("brandLogo");
  const paletteHint = hasAppearancePaletteOverrides(appearance.uiPaletteOverridesJson) ? null : getSettingCoachmark("componentPalette");

  return (
    <div className="appearance-form">
      <section id="appearance-branding" className="appearance-section">
        <button
          type="button"
          className="appearance-section__header appearance-section__header--toggle"
          onClick={() => toggleSection("branding")}
          aria-expanded={openSections.branding}
        >
          <div className="min-w-0">
            <h3>Брендинг</h3>
            <p>Название, знак, логотип и фирменные акценты для навигации, превью и рабочих состояний интерфейса.</p>
          </div>
          <span className="appearance-section__header-icons">
            <Type size={18} aria-hidden="true" />
            <ChevronDown size={16} className={`appearance-section__chevron${openSections.branding ? "" : " appearance-section__chevron--collapsed"}`} aria-hidden="true" />
          </span>
        </button>

        {openSections.branding && <div className={brandLogoHint ? "appearance-section__body-with-coach" : ""}>
          <div className="brand-settings-grid">
            <div className="brand-preview-card" style={brandPreviewStyle(appearance)} aria-label="Предпросмотр бренда">
              <div className="brand-preview-card__sidebar">
                <span className={`brand-preview-card__logo ${appearance.brandLogoUrl ? "brand-preview-card__logo--image" : ""}`}>
                  {appearance.brandLogoUrl ? <img src={appearance.brandLogoUrl} alt="" /> : appearance.brandMark}
                </span>
                <span className="brand-preview-card__copy">
                  <strong>{appearance.brandName}</strong>
                  <span>{appearance.brandTagline}</span>
                </span>
                <span className="brand-preview-card__nav brand-preview-card__nav--active">Проверки</span>
                <span className="brand-preview-card__nav">Аналитика</span>
              </div>
              <div className="brand-preview-card__surface">
                <span className="brand-preview-card__kicker">Рабочее пространство</span>
                <strong>{appearance.brandName}</strong>
                <span className="brand-preview-card__line brand-preview-card__line--wide" />
                <span className="brand-preview-card__line" />
                <button type="button">Основное действие</button>
              </div>
            </div>

            <div className="brand-settings-panel">
              <div className="brand-field-grid">
                <label className="appearance-field">
                  <span>Название</span>
                  <input
                    className="form-control"
                    type="text"
                    value={appearance.brandName}
                    maxLength={64}
                    placeholder="КК поддержки"
                    onChange={handleChange("brandName")}
                  />
                </label>
                <label className="appearance-field">
                  <span>Подпись</span>
                  <input
                    className="form-control"
                    type="text"
                    value={appearance.brandTagline}
                    maxLength={96}
                    placeholder="Ручная проверка"
                    onChange={handleChange("brandTagline")}
                  />
                </label>
                <label className="appearance-field appearance-field--short">
                  <span>Знак</span>
                  <input className="form-control" type="text" value={appearance.brandMark} maxLength={3} onChange={handleChange("brandMark")} />
                </label>
                <label className="appearance-field">
                  <span>Alt логотипа</span>
                  <input
                    className="form-control"
                    type="text"
                    value={appearance.brandLogoAlt}
                    maxLength={96}
                    placeholder={appearance.brandName}
                    onChange={handleChange("brandLogoAlt")}
                  />
                </label>
              </div>

              <div className="brand-logo-control">
                <span className={`brand-logo-control__preview ${appearance.brandLogoUrl ? "brand-logo-control__preview--image" : ""}`}>
                  {appearance.brandLogoUrl ? <img src={appearance.brandLogoUrl} alt="" /> : appearance.brandMark}
                </span>
                <div className="brand-logo-control__body">
                  <div className="brand-logo-control__actions">
                    <label className="action-button appearance-logo-upload">
                      <ImageUp size={16} aria-hidden="true" />
                      Загрузить
                      <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} />
                    </label>
                    {appearance.brandLogoUrl ? (
                      <button type="button" className="action-button appearance-logo-remove" onClick={() => patchAppearance({ brandLogoUrl: "" })}>
                        <X size={15} aria-hidden="true" />
                        Убрать
                      </button>
                    ) : null}
                  </div>
                  <label className="appearance-field">
                    <span>URL логотипа</span>
                    <input
                      className="form-control"
                      type="url"
                      value={logoUrlValue}
                      placeholder={logoIsUploaded ? "Загруженный файл сохранен" : "https://cdn.example.com/logo.png"}
                      onChange={handleChange("brandLogoUrl")}
                    />
                  </label>
                  <p className={`brand-logo-control__hint ${logoError ? "brand-logo-control__hint--error" : ""}`}>
                    {logoError || "PNG, JPG или WebP до 240 КБ; HTTPS-ссылку можно оставить вместо файла."}
                  </p>
                </div>
              </div>

              <div className="brand-color-grid" aria-label="Цвета бренда">
                <label className="brand-color-field">
                  <span>Основной</span>
                  <input type="color" value={appearance.brandPrimaryColor} onChange={handleChange("brandPrimaryColor")} />
                  <input className="form-control" type="text" value={appearance.brandPrimaryColor} onChange={handleChange("brandPrimaryColor")} />
                </label>
                <label className="brand-color-field">
                  <span>Акцент</span>
                  <input type="color" value={appearance.brandAccentColor} onChange={handleChange("brandAccentColor")} />
                  <input className="form-control" type="text" value={appearance.brandAccentColor} onChange={handleChange("brandAccentColor")} />
                </label>
              </div>

              <div className="brand-preset-row" aria-label="Быстрые палитры">
                {brandColorPresets.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    className="brand-preset-button"
                    style={{ "--preset-primary": preset.primary, "--preset-accent": preset.accent } as CSSProperties}
                    onClick={() => {
                      const nextOverrides = {
                        ...appearance.uiPaletteOverrides,
                        accent: preset.primary,
                        accentStrong: preset.button,
                        buttonPrimaryBg: preset.button,
                        buttonPrimaryHover: preset.primary,
                        sidebarBg: preset.sidebar,
                        sidebarAccent: preset.accent
                      };

                      patchAppearance({
                        brandPrimaryColor: preset.primary,
                        brandAccentColor: preset.accent,
                        uiPaletteOverrides: nextOverrides,
                        uiPaletteOverridesJson: serializeUiPaletteOverrides(nextOverrides)
                      });
                    }}
                  >
                    <span aria-hidden="true" />
                    {preset.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="brand-preset-button brand-preset-button--reset"
                  onClick={() => {
                    patchAppearance({ brandLogoUrl: "", brandPrimaryColor: "#3157d5", brandAccentColor: "#7c97ff" });
                    resetPaletteOverrides();
                  }}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Сброс
                </button>
              </div>
            </div>
          </div>
          {brandLogoHint ? (
            <CoachCallout
              title={brandLogoHint.title}
              body={brandLogoHint.body}
              href="#appearance-branding"
              actionLabel={brandLogoHint.actionLabel}
              variant="spotlight"
              placement="left"
              anchorLabel="Подсказка к брендингу"
              stepIndex={1}
              dismissId="settings:brandLogo"
            />
          ) : null}
        </div>}
      </section>

      <section className="appearance-section">
        <button
          type="button"
          className="appearance-section__header appearance-section__header--toggle"
          onClick={() => toggleSection("theme")}
          aria-expanded={openSections.theme}
        >
          <div className="min-w-0">
            <h3>Цветовая тема</h3>
            <p>Тема меняет фон приложения, сайдбар, шапки панелей, primary-кнопки, выбранные состояния, hover и акцентные панели. Палитры светлые; тёмное оформление — тема Night Ops.</p>
          </div>
          <span className="appearance-section__header-icons">
            <Palette size={18} aria-hidden="true" />
            <ChevronDown size={16} className={`appearance-section__chevron${openSections.theme ? "" : " appearance-section__chevron--collapsed"}`} aria-hidden="true" />
          </span>
        </button>
        {openSections.theme && <div className="theme-option-grid" role="radiogroup" aria-label="Цветовая тема">
          {uiThemeOptions.map((theme) => {
            const isSelected = theme.id === appearance.uiTheme;

            return (
              <label
                key={theme.id}
                className={`theme-option-card ${isSelected ? "theme-option-card--selected" : ""}`}
                style={themePreviewStyle(theme)}
              >
                <input name="uiTheme" type="radio" value={theme.id} checked={isSelected} onChange={handleThemeChange} />
                <span className="theme-option-card__preview" aria-hidden="true">
                  <span className="theme-option-card__sidebar" />
                  <span className="theme-option-card__surface">
                    <span className="theme-option-card__panel-header" />
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
                <span className="theme-option-card__body">
                  <span className="theme-option-card__title">
                    <Palette size={16} aria-hidden="true" />
                    {theme.label}
                  </span>
                  <span className="theme-option-card__description">{theme.description}</span>
                </span>
              </label>
            );
          })}
        </div>}
      </section>

      <section id="appearance-palette" className="appearance-section">
        <button
          type="button"
          className="appearance-section__header appearance-section__header--toggle"
          onClick={() => toggleSection("palette")}
          aria-expanded={openSections.palette}
        >
          <div className="min-w-0">
            <h3>Палитра компонентов</h3>
            <p>Ручные цвета переопределяют выбранную тему для кнопок, сайдбара, рабочих поверхностей и статусов. Смена темы сбрасывает эти переопределения.</p>
          </div>
          <span className="appearance-section__header-icons">
            <Palette size={18} aria-hidden="true" />
            <ChevronDown size={16} className={`appearance-section__chevron${openSections.palette ? "" : " appearance-section__chevron--collapsed"}`} aria-hidden="true" />
          </span>
        </button>
        {openSections.palette && <div className={paletteHint ? "appearance-section__body-with-coach" : ""}>
          <div className="appearance-section__body-main">
            <div className="palette-token-board">
              {paletteGroups.map((group) => (
                <section key={group.id} className="palette-token-group" aria-labelledby={`palette-token-${group.id}`}>
                  <div className="palette-token-group__header">
                    <h4 id={`palette-token-${group.id}`}>{group.title}</h4>
                    <p>{group.description}</p>
                  </div>
                  <div className="palette-token-list">
                    {group.tokens.map((token) => {
                      const isCustom = Boolean(appearance.uiPaletteOverrides[token]);

                      return (
                        <label key={token} className={`palette-token-field ${isCustom ? "palette-token-field--custom" : ""}`}>
                          <span className="palette-token-field__label">
                            <span>{paletteTokenLabel(token)}</span>
                            {isCustom ? (
                              <button type="button" onClick={() => resetPaletteOverride(token)} aria-label={`Сбросить ${paletteTokenLabel(token)}`}>
                                <RotateCcw size={13} aria-hidden="true" />
                              </button>
                            ) : null}
                          </span>
                          <span className="palette-token-field__control">
                            <input type="color" value={paletteValue(appearance, token)} onChange={(event) => updatePaletteOverride(token, event.target.value)} />
                            <code>{paletteValue(appearance, token).toUpperCase()}</code>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <button type="button" className="action-button action-button--small appearance-reset-palette" onClick={resetPaletteOverrides}>
              <RotateCcw size={14} aria-hidden="true" />
              Сбросить ручную палитру
            </button>
          </div>
          {paletteHint ? (
            <CoachCallout
              title={paletteHint.title}
              body={paletteHint.body}
              href="#appearance-palette"
              actionLabel={paletteHint.actionLabel}
              variant="spotlight"
              placement="left"
              anchorLabel="Подсказка к палитре компонентов"
              stepIndex={2}
              dismissId="settings:componentPalette"
            />
          ) : null}
        </div>}
      </section>

      <section className="appearance-section">
        <button
          type="button"
          className="appearance-section__header appearance-section__header--toggle"
          onClick={() => toggleSection("ui")}
          aria-expanded={openSections.ui}
        >
          <div className="min-w-0">
            <h3>Интерфейс</h3>
            <p>Эти параметры помогают выбрать между более плотной рабочей средой и мягким презентационным видом.</p>
          </div>
          <span className="appearance-section__header-icons">
            <Layers3 size={18} aria-hidden="true" />
            <ChevronDown size={16} className={`appearance-section__chevron${openSections.ui ? "" : " appearance-section__chevron--collapsed"}`} aria-hidden="true" />
          </span>
        </button>

        {openSections.ui && <div className="appearance-option-grid">
          <fieldset className="appearance-choice-group">
            <legend>
              <Rows3 size={15} aria-hidden="true" />
              Плотность
            </legend>
            {uiDensityOptions.map((option) => {
              const isSelected = option.id === appearance.uiDensity;

              return (
                <label key={option.id} className={`appearance-choice-card ${isSelected ? "appearance-choice-card--selected" : ""}`}>
                  <input name="uiDensity" type="radio" value={option.id} checked={isSelected} onChange={handleChange("uiDensity")} />
                  <span className={`appearance-choice-card__density appearance-choice-card__density--${option.id}`} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="appearance-choice-card__body">
                    <span className="appearance-choice-card__title">{option.label}</span>
                    <span className="appearance-choice-card__description">{option.description}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <fieldset className="appearance-choice-group">
            <legend>
              <Gauge size={15} aria-hidden="true" />
              Радиусы
            </legend>
            {uiCornersOptions.map((option) => {
              const isSelected = option.id === appearance.uiCorners;

              return (
                <label
                  key={option.id}
                  className={`appearance-choice-card ${isSelected ? "appearance-choice-card--selected" : ""}`}
                  style={cornersPreviewStyle(option.previewRadius)}
                >
                  <input name="uiCorners" type="radio" value={option.id} checked={isSelected} onChange={handleChange("uiCorners")} />
                  <span className="appearance-choice-card__corner-preview" aria-hidden="true" />
                  <span className="appearance-choice-card__body">
                    <span className="appearance-choice-card__title">{option.label}</span>
                    <span className="appearance-choice-card__description">{option.description}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <fieldset className="appearance-choice-group">
            <legend>
              <CheckCircle2 size={15} aria-hidden="true" />
              Контраст
            </legend>
            {uiContrastOptions.map((option) => {
              const isSelected = option.id === appearance.uiContrast;

              return (
                <label key={option.id} className={`appearance-choice-card ${isSelected ? "appearance-choice-card--selected" : ""}`}>
                  <input name="uiContrast" type="radio" value={option.id} checked={isSelected} onChange={handleChange("uiContrast")} />
                  <span className={`appearance-choice-card__contrast appearance-choice-card__contrast--${option.id}`} aria-hidden="true" />
                  <span className="appearance-choice-card__body">
                    <span className="appearance-choice-card__title">{option.label}</span>
                    <span className="appearance-choice-card__description">{option.description}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        </div>}
      </section>

      <div className="appearance-form__footer">
        <span className={`appearance-save-status appearance-save-status--${saveState}`} role={saveState === "error" ? "alert" : "status"}>
          {saveStatusLabel(saveState)}
        </span>
      </div>
    </div>
  );
}
