import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appearanceSaveStates,
  appearanceSaveStatusLabel,
  appearanceSaveStatusTone,
  appearanceSaveStatusVariant
} from "@/lib/appearance-save-status";

const appearancePage = readFileSync(join(process.cwd(), "src/app/admin/appearance/page.tsx"), "utf8");
const appearanceForm = readFileSync(join(process.cwd(), "src/components/admin/appearance-settings-form.tsx"), "utf8");

describe("appearance save status labels", () => {
  it("keeps idle empty and shows Применено only after a confirmed save", () => {
    expect(appearanceSaveStatusLabel("idle")).toBe("");
    expect(appearanceSaveStatusLabel("saving")).toBe("Сохранение…");
    expect(appearanceSaveStatusLabel("saved")).toBe("Применено");
    expect(appearanceSaveStatusLabel("error")).toBe("Ошибка сохранения — повторите");
  });

  it("never uses a positive Готово tone for the appearance chip", () => {
    for (const state of appearanceSaveStates) {
      expect(appearanceSaveStatusLabel(state)).not.toBe("Готово");
      expect(appearanceSaveStatusTone(state)).not.toBe("positive");
    }

    expect(appearanceSaveStatusTone("idle")).toBe("neutral");
    expect(appearanceSaveStatusTone("saved")).toBe("neutral");
    expect(appearanceSaveStatusTone("saving")).toBe("info");
    expect(appearanceSaveStatusTone("error")).toBe("negative");
    expect(appearanceSaveStatusVariant("error")).toBe("destructive");
    expect(appearanceSaveStatusVariant("saved")).toBe("outline");
  });

  it("removes the perpetual page-level Готово badge", () => {
    expect(appearancePage).not.toContain("Готово");
    expect(appearancePage).not.toContain("statusSurfaceClass(\"positive\")");
    expect(appearanceForm).toContain("appearanceSaveStatusLabel");
    expect(appearanceForm).not.toContain("Все изменения сохранены");
    expect(appearanceForm).not.toContain("Готово");
  });
});
