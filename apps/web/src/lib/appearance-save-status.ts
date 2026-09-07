import type { StatusTone } from "@/lib/ui/status-tone";

export const appearanceSaveStates = ["idle", "saving", "saved", "error"] as const;

export type AppearanceSaveState = (typeof appearanceSaveStates)[number];

/**
 * Autosave chip copy. Idle stays empty so the page never claims perpetual
 * «Готово»; «Применено» appears only after a confirmed save.
 */
export function appearanceSaveStatusLabel(state: AppearanceSaveState): string {
  switch (state) {
    case "saving":
      return "Сохранение…";
    case "error":
      return "Ошибка сохранения — повторите";
    case "saved":
      return "Применено";
    case "idle":
      return "";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function appearanceSaveStatusTone(state: AppearanceSaveState): StatusTone {
  switch (state) {
    case "error":
      return "negative";
    case "saving":
      return "info";
    case "saved":
    case "idle":
      return "neutral";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function appearanceSaveStatusVariant(
  state: AppearanceSaveState
): "secondary" | "outline" | "destructive" {
  if (state === "error") {
    return "destructive";
  }

  return "outline";
}
