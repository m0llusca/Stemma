"use client";

import type { CSSProperties, ChangeEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Gauge, Layers3, Palette, Rows3 } from "lucide-react";
import { updateWorkspaceAppearance } from "@/lib/ui-theme-actions";
import {
  type UiContrastId,
  type UiCornersId,
  type UiDensityId,
  type UiThemeId,
  uiContrastOptions,
  uiCornersOptions,
  uiDensityOptions,
  uiThemeOptions
} from "@/lib/ui-theme";

type AppearanceState = {
  uiTheme: UiThemeId;
  uiDensity: UiDensityId;
  uiCorners: UiCornersId;
  uiContrast: UiContrastId;
};

type AppearanceField = keyof AppearanceState;
type SaveState = "idle" | "saving" | "saved" | "error";

type AppearanceSettingsFormProps = {
  initialAppearance: AppearanceState;
};

function themePreviewStyle(theme: (typeof uiThemeOptions)[number]) {
  return {
    "--theme-accent": theme.accent,
    "--theme-surface": theme.surface,
    "--theme-panel": theme.panel,
    "--theme-sidebar": theme.sidebar,
    "--theme-primary": theme.primary,
    "--theme-dark-accent": theme.dark.accent,
    "--theme-dark-surface": theme.dark.surface,
    "--theme-dark-panel": theme.dark.panel,
    "--theme-dark-sidebar": theme.dark.sidebar,
    "--theme-dark-primary": theme.dark.primary
  } as CSSProperties;
}

function cornersPreviewStyle(radius: string) {
  return { "--corner-preview-radius": radius } as CSSProperties;
}

function appearanceToFormData(appearance: AppearanceState) {
  const formData = new FormData();
  formData.set("uiTheme", appearance.uiTheme);
  formData.set("uiDensity", appearance.uiDensity);
  formData.set("uiCorners", appearance.uiCorners);
  formData.set("uiContrast", appearance.uiContrast);
  return formData;
}

function appearancesEqual(left: AppearanceState, right: AppearanceState) {
  return (
    left.uiTheme === right.uiTheme &&
    left.uiDensity === right.uiDensity &&
    left.uiCorners === right.uiCorners &&
    left.uiContrast === right.uiContrast
  );
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

  return "Изменения применяются сразу и сохраняются автоматически.";
}

export function AppearanceSettingsForm({ initialAppearance }: AppearanceSettingsFormProps) {
  const [appearance, setAppearance] = useState<AppearanceState>(initialAppearance);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [, startTransition] = useTransition();
  const latestAppearanceRef = useRef<AppearanceState>(initialAppearance);
  const lastPersistedRef = useRef<AppearanceState>(initialAppearance);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const hasQueuedSaveRef = useRef(false);
  const hasMountedRef = useRef(false);

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

  const updateAppearance = (field: AppearanceField, value: AppearanceState[AppearanceField]) => {
    setAppearance((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleChange =
    <Field extends AppearanceField>(field: Field) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      updateAppearance(field, event.target.value as AppearanceState[Field]);
    };

  return (
    <div className="appearance-form">
      <section className="appearance-section">
        <div className="appearance-section__header">
          <div className="min-w-0">
            <h3>Цветовая тема</h3>
            <p>Тема меняет фон приложения, сайдбар, primary-кнопки, выбранные состояния, hover и акцентные панели; темный вариант включается по системной настройке устройства.</p>
          </div>
          <Palette size={18} aria-hidden="true" />
        </div>
        <div className="theme-option-grid" role="radiogroup" aria-label="Цветовая тема">
          {uiThemeOptions.map((theme) => {
            const isSelected = theme.id === appearance.uiTheme;

            return (
              <label
                key={theme.id}
                className={`theme-option-card ${isSelected ? "theme-option-card--selected" : ""}`}
                style={themePreviewStyle(theme)}
              >
                <input name="uiTheme" type="radio" value={theme.id} checked={isSelected} onChange={handleChange("uiTheme")} />
                <span className="theme-option-card__preview" aria-hidden="true">
                  <span className="theme-option-card__sidebar" />
                  <span className="theme-option-card__surface">
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
        </div>
      </section>

      <section className="appearance-section">
        <div className="appearance-section__header">
          <div className="min-w-0">
            <h3>Интерфейс</h3>
            <p>Эти параметры помогают выбрать между более плотной рабочей средой и мягким презентационным видом.</p>
          </div>
          <Layers3 size={18} aria-hidden="true" />
        </div>

        <div className="appearance-option-grid">
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
        </div>
      </section>

      <div className="appearance-form__footer">
        <span className={`appearance-save-status appearance-save-status--${saveState}`} role={saveState === "error" ? "alert" : "status"}>
          {saveStatusLabel(saveState)}
        </span>
      </div>
    </div>
  );
}
