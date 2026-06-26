import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocalizationEditor } from "@/components/i18n/localization-editor";

const noopAction = vi.fn(async () => undefined);

describe("localization editor", () => {
  it("shows empty published translations as published", () => {
    render(
      <LocalizationEditor
        locales={[{ id: "locale-en", code: "en", name: "English", isDefault: false, isEnabled: true }]}
        translationKeys={[
          {
            id: "key-empty",
            namespace: "dashboard",
            key: "empty",
            fullKey: "dashboard.empty",
            defaultText: "Fallback text",
            description: null,
            ownerArea: "Dashboard",
            values: [
              {
                id: "value-empty",
                localeId: "locale-en",
                draftText: null,
                publishedText: "",
                publishedAt: "2026-06-26T10:00:00.000Z",
                version: 2
              }
            ]
          }
        ]}
        createLocaleAction={noopAction}
        saveDraftAction={noopAction}
        publishAction={noopAction}
        rollbackAction={noopAction}
      />
    );

    expect(screen.getByText("Опубликовано")).not.toBeNull();
    expect(screen.queryByText("Не опубликовано")).toBeNull();
    expect((screen.getByLabelText("Черновик dashboard.empty") as HTMLTextAreaElement).value).toBe("");
  });
});
