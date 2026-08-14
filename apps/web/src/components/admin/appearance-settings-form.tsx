"use client";

import type { CSSProperties, ChangeEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Gauge,
  ImageUp,
  Layers3,
  Palette,
  RotateCcw,
  Rows3,
  Type,
  Undo2,
  X
} from "lucide-react";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getSettingCoachmark, hasAppearancePaletteOverrides } from "@/lib/admin-setup-guidance";
import { resolveUndoTarget } from "@/lib/appearance-undo";
import { syncUiAppearanceToDocument } from "@/lib/ui-theme-dom";
import { updateWorkspaceAppearance } from "@/lib/ui-theme-actions";
import {
  maxBrandLogoUrlLength,
  type UiAppearance,
  type UiThemeId,
  type UiPaletteOverrides,
  type UiPaletteToken,
  type WorkspaceBranding,
  serializeUiPaletteOverrides,
  uiContrastOptions,
  uiCornersOptions,
  uiDensityOptions,
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
    return "Сохранение…";
  }

  if (state === "error") {
    return "Ошибка сохранения — повторите";
  }

  // idle (ничего не менялось) и saved: все зафиксировано на сервере.
  return "Все изменения сохранены";
}

function saveStatusVariant(state: SaveState): "secondary" | "outline" | "destructive" {
  if (state === "error") {
    return "destructive";
  }

  if (state === "saving") {
    return "outline";
  }

  return "secondary";
}

export function AppearanceSettingsForm({ initialAppearance }: AppearanceSettingsFormProps) {
  const router = useRouter();
  const [appearance, setAppearance] = useState<AppearanceState>(initialAppearance);
  const [logoError, setLogoError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [, startTransition] = useTransition();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const latestAppearanceRef = useRef<AppearanceState>(initialAppearance);
  const lastPersistedRef = useRef<AppearanceState>(initialAppearance);
  const serverConfirmedRef = useRef<AppearanceState>(initialAppearance);
  // Предыдущее сохраненное состояние: цель отката, когда текущие правки уже
  // зафиксированы автосейвом (см. resolveUndoTarget в lib/appearance-undo.ts).
  const previousPersistedRef = useRef<AppearanceState | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const hasQueuedSaveRef = useRef(false);
  const hasMountedRef = useRef(false);
  const isMountedRef = useRef(false);
  const latestRevisionRef = useRef(0);
  const skipNextPersistRef = useRef(false);

  const persistLatest = () => {
    if (isSavingRef.current) {
      hasQueuedSaveRef.current = true;
      return;
    }

    const snapshot = latestAppearanceRef.current;
    const revision = latestRevisionRef.current;

    if (appearancesEqual(snapshot, serverConfirmedRef.current)) {
      if (isMountedRef.current) {
        setSaveState("saved");
      }
      return;
    }

    isSavingRef.current = true;
    hasQueuedSaveRef.current = false;
    setSaveState("saving");

    startTransition(() => {
      void updateWorkspaceAppearance(appearanceToFormData(snapshot))
        .then(() => {
          serverConfirmedRef.current = snapshot;

          if (!isMountedRef.current) {
            return;
          }

          const isSemanticWinner = appearancesEqual(
            snapshot,
            latestAppearanceRef.current
          );

          if (revision === latestRevisionRef.current || isSemanticWinner) {
            previousPersistedRef.current = lastPersistedRef.current;
            lastPersistedRef.current = snapshot;
            setSaveState("saved");
            router.refresh();
          }
        })
        .catch(() => {
          if (!isMountedRef.current || revision !== latestRevisionRef.current) {
            return;
          }

          const rollbackAppearance = serverConfirmedRef.current;
          previousPersistedRef.current = lastPersistedRef.current;
          lastPersistedRef.current = rollbackAppearance;
          latestAppearanceRef.current = rollbackAppearance;
          skipNextPersistRef.current = true;
          syncUiAppearanceToDocument(document.documentElement, rollbackAppearance);
          window.dispatchEvent(
            new CustomEvent("qc-branding-preview", {
              detail: appearanceToBranding(rollbackAppearance)
            })
          );
          setAppearance(rollbackAppearance);
          setSaveState("error");
        })
        .finally(() => {
          isSavingRef.current = false;

          if (isMountedRef.current && hasQueuedSaveRef.current) {
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
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      const confirmedAppearance = serverConfirmedRef.current;
      syncUiAppearanceToDocument(document.documentElement, confirmedAppearance);
      window.dispatchEvent(
        new CustomEvent("qc-branding-preview", {
          detail: appearanceToBranding(confirmedAppearance)
        })
      );
    };
  }, []);

  useEffect(() => {
    latestAppearanceRef.current = appearance;

    syncUiAppearanceToDocument(document.documentElement, appearance);
    window.dispatchEvent(new CustomEvent("qc-branding-preview", { detail: appearanceToBranding(appearance) }));

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    latestRevisionRef.current += 1;
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

  const handleThemeChange = (themeId: UiThemeId) => {
    patchAppearance({
      uiTheme: themeId,
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

  const undoTarget = resolveUndoTarget(appearance, lastPersistedRef.current, previousPersistedRef.current, appearancesEqual);

  const handleUndo = () => {
    if (!undoTarget) {
      return;
    }

    // Возврат к последнему сохраненному состоянию; если правки уже
    // зафиксированы — к предыдущему сохраненному шагу. Повторное сохранение
    // выполняет обычный автосейв через эффект на appearance.
    setAppearance(undoTarget);
  };

  const logoIsUploaded = appearance.brandLogoUrl.startsWith("data:image/");
  const logoUrlValue = logoIsUploaded ? "" : appearance.brandLogoUrl;
  const brandLogoHint = appearance.brandLogoUrl ? null : getSettingCoachmark("brandLogo");
  const paletteHint = hasAppearancePaletteOverrides(appearance.uiPaletteOverridesJson) ? null : getSettingCoachmark("componentPalette");

  return (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue="branding" className="gap-4">
        <TabsList variant="line" className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="branding" className="gap-1.5">
            <Type aria-hidden="true" />
            Брендинг
          </TabsTrigger>
          <TabsTrigger value="theme" className="gap-1.5">
            <Palette aria-hidden="true" />
            Тема
          </TabsTrigger>
          <TabsTrigger value="palette" className="gap-1.5">
            <Palette aria-hidden="true" />
            Палитра
          </TabsTrigger>
          <TabsTrigger value="ui" className="gap-1.5">
            <Layers3 aria-hidden="true" />
            Интерфейс
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="flex flex-col gap-4" id="appearance-branding">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-medium text-foreground">Брендинг</h3>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Название, знак, логотип и фирменные акценты для навигации, превью и рабочих состояний интерфейса.
            </p>
          </div>

          <div className={cn("grid gap-4", brandLogoHint ? "xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]" : null)}>
            <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.3fr)]">
              <div
                className="grid min-h-[284px] min-w-0 overflow-hidden rounded-xl ring-1 ring-foreground/10"
                style={{
                  ...brandPreviewStyle(appearance),
                  gridTemplateColumns: "minmax(124px,0.42fr) minmax(0,1fr)"
                }}
                aria-label="Предпросмотр бренда"
              >
                <div
                  className="flex flex-col gap-2.5 p-4 text-slate-200"
                  style={{
                    background: `linear-gradient(180deg, color-mix(in srgb, var(--preview-sidebar-accent) 28%, transparent), transparent 48%), var(--preview-sidebar)`
                  }}
                >
                  <span
                    className={cn(
                      "inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg text-base font-black text-white",
                      appearance.brandLogoUrl ? "bg-white/10" : null
                    )}
                    style={
                      appearance.brandLogoUrl
                        ? undefined
                        : {
                            background:
                              "radial-gradient(circle at 26% 12%, color-mix(in srgb, var(--preview-brand-accent) 58%, #ffffff) 0%, transparent 38%), linear-gradient(135deg, color-mix(in srgb, var(--preview-brand-primary) 78%, #020617), color-mix(in srgb, var(--preview-brand-accent) 58%, #0f172a))"
                          }
                    }
                  >
                    {appearance.brandLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={appearance.brandLogoUrl} alt="" className="size-full object-contain p-1" />
                    ) : (
                      appearance.brandMark
                    )}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <strong className="truncate text-sm font-semibold text-white">{appearance.brandName}</strong>
                    <span className="truncate text-xs text-slate-400">{appearance.brandTagline}</span>
                  </div>
                  <span
                    className="rounded-md border border-white/10 px-2 py-1.5 text-xs font-semibold text-white"
                    style={{
                      background: "color-mix(in srgb, var(--preview-sidebar-accent) 20%, rgba(255, 255, 255, 0.08))"
                    }}
                  >
                    Проверки
                  </span>
                  <span className="rounded-md px-2 py-1.5 text-xs font-semibold text-slate-300">Аналитика</span>
                </div>
                <div
                  className="flex flex-col gap-3 p-4"
                  style={{
                    background: `linear-gradient(135deg, color-mix(in srgb, var(--preview-brand-primary) 8%, transparent), transparent 56%), var(--panel, hsl(var(--card)))`
                  }}
                >
                  <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Рабочее пространство
                  </span>
                  <strong className="text-xl font-semibold text-foreground">{appearance.brandName}</strong>
                  <span
                    className="block h-2.5 w-[86%] rounded-full"
                    style={{ background: "color-mix(in srgb, var(--preview-brand-primary) 16%, var(--border))" }}
                  />
                  <span
                    className="block h-2.5 w-[64%] rounded-full"
                    style={{ background: "color-mix(in srgb, var(--preview-brand-primary) 16%, var(--border))" }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="w-fit border-0 text-white hover:opacity-90"
                    style={{ background: "var(--preview-button)" }}
                  >
                    Основное действие
                  </Button>
                </div>
              </div>

              <Card size="sm" className="bg-muted/40">
                <CardContent className="flex flex-col gap-4 pt-0">
                  <FieldGroup className="gap-3 sm:grid sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="brand-name">Название</FieldLabel>
                      <Input
                        id="brand-name"
                        type="text"
                        value={appearance.brandName}
                        maxLength={64}
                        placeholder="КК поддержки"
                        onChange={handleChange("brandName")}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="brand-tagline">Подпись</FieldLabel>
                      <Input
                        id="brand-tagline"
                        type="text"
                        value={appearance.brandTagline}
                        maxLength={96}
                        placeholder="Ручная проверка"
                        onChange={handleChange("brandTagline")}
                      />
                    </Field>
                    <Field className="max-w-[140px]">
                      <FieldLabel htmlFor="brand-mark">Знак</FieldLabel>
                      <Input
                        id="brand-mark"
                        type="text"
                        value={appearance.brandMark}
                        maxLength={3}
                        onChange={handleChange("brandMark")}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="brand-logo-alt">Alt логотипа</FieldLabel>
                      <Input
                        id="brand-logo-alt"
                        type="text"
                        value={appearance.brandLogoAlt}
                        maxLength={96}
                        placeholder={appearance.brandName}
                        onChange={handleChange("brandLogoAlt")}
                      />
                    </Field>
                  </FieldGroup>

                  <div className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[68px_minmax(0,1fr)]">
                    <span
                      className={cn(
                        "inline-flex size-[58px] items-center justify-center overflow-hidden rounded-lg text-base font-black text-white",
                        appearance.brandLogoUrl ? "bg-muted text-foreground" : null
                      )}
                      style={
                        appearance.brandLogoUrl
                          ? undefined
                          : {
                              background:
                                "radial-gradient(circle at 26% 12%, color-mix(in srgb, var(--preview-brand-accent, var(--brand-accent)) 58%, #ffffff) 0%, transparent 38%), linear-gradient(135deg, color-mix(in srgb, var(--preview-brand-primary, var(--brand-primary)) 78%, #020617), color-mix(in srgb, var(--preview-brand-accent, var(--brand-accent)) 58%, #0f172a))"
                            }
                      }
                    >
                      {appearance.brandLogoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={appearance.brandLogoUrl} alt="" className="size-full object-contain p-1" />
                      ) : (
                        appearance.brandMark
                      )}
                    </span>
                    <div className="flex min-w-0 flex-col gap-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={logoInputRef}
                          className="sr-only"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleLogoUpload}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                          <ImageUp data-icon="inline-start" aria-hidden="true" />
                          Загрузить
                        </Button>
                        {appearance.brandLogoUrl ? (
                          <Button type="button" variant="ghost" size="sm" onClick={() => patchAppearance({ brandLogoUrl: "" })}>
                            <X data-icon="inline-start" aria-hidden="true" />
                            Убрать
                          </Button>
                        ) : null}
                      </div>
                      <Field>
                        <FieldLabel htmlFor="brand-logo-url">URL логотипа</FieldLabel>
                        <Input
                          id="brand-logo-url"
                          type="url"
                          value={logoUrlValue}
                          placeholder={logoIsUploaded ? "Загруженный файл сохранен" : "https://cdn.example.com/logo.png"}
                          onChange={handleChange("brandLogoUrl")}
                        />
                      </Field>
                      <p className={cn("text-xs leading-snug text-muted-foreground", logoError ? "font-medium text-destructive" : null)}>
                        {logoError || "PNG, JPG или WebP до 240 КБ; HTTPS-ссылку можно оставить вместо файла."}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2" aria-label="Цвета бренда">
                    <Field>
                      <FieldLabel htmlFor="brand-primary">Основной</FieldLabel>
                      <div className="flex items-center gap-2">
                        <input
                          id="brand-primary-color"
                          type="color"
                          value={appearance.brandPrimaryColor}
                          onChange={handleChange("brandPrimaryColor")}
                          className="size-9 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1"
                          aria-label="Основной цвет"
                        />
                        <Input
                          id="brand-primary"
                          type="text"
                          value={appearance.brandPrimaryColor}
                          onChange={handleChange("brandPrimaryColor")}
                        />
                      </div>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="brand-accent">Акцент</FieldLabel>
                      <div className="flex items-center gap-2">
                        <input
                          id="brand-accent-color"
                          type="color"
                          value={appearance.brandAccentColor}
                          onChange={handleChange("brandAccentColor")}
                          className="size-9 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1"
                          aria-label="Акцентный цвет"
                        />
                        <Input
                          id="brand-accent"
                          type="text"
                          value={appearance.brandAccentColor}
                          onChange={handleChange("brandAccentColor")}
                        />
                      </div>
                    </Field>
                  </div>

                  <div className="flex flex-wrap gap-2" aria-label="Быстрые палитры">
                    {brandColorPresets.map((preset) => (
                      <Button
                        key={preset.name}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
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
                        <span
                          className="size-3.5 rounded-full ring-1 ring-foreground/15"
                          style={{
                            background: `linear-gradient(135deg, ${preset.primary}, ${preset.accent})`
                          }}
                          aria-hidden="true"
                        />
                        {preset.name}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        patchAppearance({ brandLogoUrl: "", brandPrimaryColor: "#3157d5", brandAccentColor: "#7c97ff" });
                        resetPaletteOverrides();
                      }}
                    >
                      <RotateCcw data-icon="inline-start" aria-hidden="true" />
                      Сброс
                    </Button>
                  </div>
                </CardContent>
              </Card>
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
          </div>
        </TabsContent>

        <TabsContent value="theme" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-medium text-foreground">Цветовая тема</h3>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Тема меняет фон приложения, сайдбар, шапки панелей, primary-кнопки, выбранные состояния, hover и акцентные
              панели. Палитры светлые; тёмное оформление — тема Night Ops.
            </p>
          </div>

          <RadioGroup
            value={appearance.uiTheme}
            onValueChange={(value) => handleThemeChange(value as UiThemeId)}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Цветовая тема"
          >
            {uiThemeOptions.map((theme) => {
              const isSelected = theme.id === appearance.uiTheme;

              return (
                <FieldLabel
                  key={theme.id}
                  className={cn(
                    "flex w-full cursor-pointer flex-col gap-3 rounded-xl border bg-card p-3 text-left font-normal transition-colors outline-none has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    isSelected ? "border-primary ring-2 ring-primary/20" : "border-border hover:bg-muted/40"
                  )}
                  style={themePreviewStyle(theme)}
                >
                  <RadioGroupItem value={theme.id} className="sr-only" />
                  <span
                    className="grid h-20 overflow-hidden rounded-lg ring-1 ring-foreground/10"
                    style={{ gridTemplateColumns: "0.32fr 1fr" }}
                    aria-hidden="true"
                  >
                    <span style={{ background: "var(--theme-sidebar)" }} />
                    <span className="flex flex-col gap-1.5 p-2" style={{ background: "var(--theme-surface)" }}>
                      <span className="h-2 rounded-sm" style={{ background: "var(--theme-panel-header)" }} />
                      <span className="h-2 w-4/5 rounded-sm" style={{ background: "var(--theme-panel)" }} />
                      <span
                        className="mt-auto h-4 w-12 rounded-sm"
                        style={{ background: "var(--theme-primary)" }}
                      />
                    </span>
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Palette className="size-4 text-muted-foreground" aria-hidden="true" />
                      {theme.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{theme.description}</span>
                  </span>
                </FieldLabel>
              );
            })}
          </RadioGroup>
        </TabsContent>

        <TabsContent value="palette" className="flex flex-col gap-4" id="appearance-palette">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-medium text-foreground">Палитра компонентов</h3>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Ручные цвета переопределяют выбранную тему для кнопок, сайдбара, рабочих поверхностей и статусов. Смена темы
              сбрасывает эти переопределения.
            </p>
          </div>

          <div className={cn("grid gap-4", paletteHint ? "xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]" : null)}>
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 lg:grid-cols-2">
                {paletteGroups.map((group) => (
                  <Card key={group.id} size="sm">
                    <CardHeader className="pb-0">
                      <CardTitle id={`palette-token-${group.id}`}>{group.title}</CardTitle>
                      <CardDescription>{group.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 pt-2">
                      {group.tokens.map((token) => {
                        const isCustom = Boolean(appearance.uiPaletteOverrides[token]);
                        const value = paletteValue(appearance, token);

                        return (
                          <div
                            key={token}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-lg border border-border px-2.5 py-2",
                              isCustom ? "border-primary/30 bg-primary/5" : "bg-muted/30"
                            )}
                          >
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium text-foreground">{paletteTokenLabel(token)}</span>
                                {isCustom ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => resetPaletteOverride(token)}
                                    aria-label={`Сбросить ${paletteTokenLabel(token)}`}
                                  >
                                    <RotateCcw aria-hidden="true" />
                                  </Button>
                                ) : null}
                              </div>
                              <code className="text-xs text-muted-foreground uppercase">{value}</code>
                            </div>
                            <input
                              type="color"
                              value={value}
                              onChange={(event) => updatePaletteOverride(token, event.target.value)}
                              className="size-9 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1"
                              aria-label={paletteTokenLabel(token)}
                            />
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={resetPaletteOverrides}>
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                Сбросить ручную палитру
              </Button>
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
          </div>
        </TabsContent>

        <TabsContent value="ui" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-medium text-foreground">Интерфейс</h3>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Эти параметры помогают выбрать между более плотной рабочей средой и мягким презентационным видом.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <FieldSet className="gap-2 rounded-xl border border-border p-3">
              <FieldLegend className="flex items-center gap-1.5 px-1 text-sm font-medium">
                <Rows3 className="size-4" aria-hidden="true" />
                Плотность
              </FieldLegend>
              <RadioGroup
                value={appearance.uiDensity}
                onValueChange={(value) => patchAppearance({ uiDensity: value as AppearanceState["uiDensity"] })}
                className="flex flex-col gap-2"
                aria-label="Плотность"
              >
                {uiDensityOptions.map((option) => {
                  const isSelected = option.id === appearance.uiDensity;

                  return (
                    <FieldLabel
                      key={option.id}
                      className={cn(
                        "flex w-full cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2 font-normal transition-colors",
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <RadioGroupItem value={option.id} />
                        <span className="text-sm font-medium text-foreground">{option.label}</span>
                      </span>
                      <FieldDescription className="text-xs pl-6">{option.description}</FieldDescription>
                    </FieldLabel>
                  );
                })}
              </RadioGroup>
            </FieldSet>

            <FieldSet className="gap-2 rounded-xl border border-border p-3">
              <FieldLegend className="flex items-center gap-1.5 px-1 text-sm font-medium">
                <Gauge className="size-4" aria-hidden="true" />
                Радиусы
              </FieldLegend>
              <RadioGroup
                value={appearance.uiCorners}
                onValueChange={(value) => patchAppearance({ uiCorners: value as AppearanceState["uiCorners"] })}
                className="flex flex-col gap-2"
                aria-label="Радиусы"
              >
                {uiCornersOptions.map((option) => {
                  const isSelected = option.id === appearance.uiCorners;

                  return (
                    <FieldLabel
                      key={option.id}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 font-normal transition-colors",
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      )}
                      style={cornersPreviewStyle(option.previewRadius)}
                    >
                      <RadioGroupItem value={option.id} className="mt-1" />
                      <span
                        className="mt-0.5 size-8 shrink-0 border-2 border-primary/40 bg-primary/10"
                        style={{ borderRadius: "var(--corner-preview-radius)" }}
                        aria-hidden="true"
                      />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm font-medium text-foreground">{option.label}</span>
                        <FieldDescription className="text-xs">{option.description}</FieldDescription>
                      </span>
                    </FieldLabel>
                  );
                })}
              </RadioGroup>
            </FieldSet>

            <FieldSet className="gap-2 rounded-xl border border-border p-3">
              <FieldLegend className="flex items-center gap-1.5 px-1 text-sm font-medium">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Контраст
              </FieldLegend>
              <RadioGroup
                value={appearance.uiContrast}
                onValueChange={(value) => patchAppearance({ uiContrast: value as AppearanceState["uiContrast"] })}
                className="flex flex-col gap-2"
                aria-label="Контраст"
              >
                {uiContrastOptions.map((option) => {
                  const isSelected = option.id === appearance.uiContrast;

                  return (
                    <FieldLabel
                      key={option.id}
                      className={cn(
                        "flex w-full cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2 font-normal transition-colors",
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <RadioGroupItem value={option.id} />
                        <span className="text-sm font-medium text-foreground">{option.label}</span>
                      </span>
                      <FieldDescription className="text-xs pl-6">{option.description}</FieldDescription>
                    </FieldLabel>
                  );
                })}
              </RadioGroup>
            </FieldSet>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" size="sm" disabled={!undoTarget} onClick={handleUndo}>
          <Undo2 data-icon="inline-start" aria-hidden="true" />
          Отменить последнее изменение
        </Button>
        {/* Постоянно отрендеренный статус автосейва: меняется только текст,
            aria-live="polite" озвучивает смену состояния. */}
        <Badge
          variant={saveStatusVariant(saveState)}
          className={cn(
            saveState === "saved" || saveState === "idle"
              ? "border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
              : null
          )}
          role="status"
          aria-live="polite"
        >
          {saveStatusLabel(saveState)}
        </Badge>
      </div>
    </div>
  );
}
