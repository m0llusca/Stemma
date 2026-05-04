import type { CSSProperties } from "react";
import { CheckCircle2, Gauge, Layers3, Palette, Rows3 } from "lucide-react";
import Link from "next/link";
import { updateWorkspaceAppearance } from "@/lib/ui-theme-actions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  resolveUiAppearance,
  uiContrastOptions,
  uiCornersOptions,
  uiDensityOptions,
  uiThemeOptions
} from "@/lib/ui-theme";

export const dynamic = "force-dynamic";

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

export default async function AdminAppearancePage() {
  const user = await requireCurrentUserPermission("appearance:manage");
  const workspace = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: {
      name: true,
      uiTheme: true,
      uiDensity: true,
      uiCorners: true,
      uiContrast: true
    }
  });
  const appearance = resolveUiAppearance(workspace ?? {});

  return (
    <section className="page-shell admin-shell">
      <div className="command-center command-center--split">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Внешний вид</h1>
          <p className="page-subtitle">
            Настройки применяются ко всему рабочему пространству: навигация, кнопки, панели, выбранные состояния и плотность используют один набор токенов.
            Если на устройстве включена темная тема, выбранная палитра автоматически использует темный вариант.
          </p>
        </div>
        <div className="admin-actions xl:justify-end">
          <Link href="/admin" className="action-button">
            К настройкам
          </Link>
        </div>
      </div>

      <section className="panel overflow-hidden">
        <div className="learning-section-header">
          <div className="min-w-0">
            <h2>{workspace?.name ?? "Рабочее пространство"}</h2>
            <p>Статусы готовности, завершения и выполнения остаются зелеными в любой теме.</p>
          </div>
          <span className="pill pill--ok">
            <CheckCircle2 size={14} aria-hidden="true" />
            Готово
          </span>
        </div>

        <form action={updateWorkspaceAppearance} className="appearance-form">
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
                    <input name="uiTheme" type="radio" value={theme.id} defaultChecked={isSelected} />
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
                {uiDensityOptions.map((option) => (
                  <label key={option.id} className="appearance-choice-card">
                    <input name="uiDensity" type="radio" value={option.id} defaultChecked={option.id === appearance.uiDensity} />
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
                ))}
              </fieldset>

              <fieldset className="appearance-choice-group">
                <legend>
                  <Gauge size={15} aria-hidden="true" />
                  Радиусы
                </legend>
                {uiCornersOptions.map((option) => (
                  <label key={option.id} className="appearance-choice-card" style={cornersPreviewStyle(option.previewRadius)}>
                    <input name="uiCorners" type="radio" value={option.id} defaultChecked={option.id === appearance.uiCorners} />
                    <span className="appearance-choice-card__corner-preview" aria-hidden="true" />
                    <span className="appearance-choice-card__body">
                      <span className="appearance-choice-card__title">{option.label}</span>
                      <span className="appearance-choice-card__description">{option.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="appearance-choice-group">
                <legend>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Контраст
                </legend>
                {uiContrastOptions.map((option) => (
                  <label key={option.id} className="appearance-choice-card">
                    <input name="uiContrast" type="radio" value={option.id} defaultChecked={option.id === appearance.uiContrast} />
                    <span className={`appearance-choice-card__contrast appearance-choice-card__contrast--${option.id}`} aria-hidden="true" />
                    <span className="appearance-choice-card__body">
                      <span className="appearance-choice-card__title">{option.label}</span>
                      <span className="appearance-choice-card__description">{option.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
          </section>

          <div className="appearance-form__footer">
            <button type="submit" className="action-button action-button--primary">
              Сохранить внешний вид
            </button>
            <span className="record-meta">Изменения сохраняются на бэкенде и применяются ко всему рабочему пространству.</span>
          </div>
        </form>
      </section>
    </section>
  );
}
