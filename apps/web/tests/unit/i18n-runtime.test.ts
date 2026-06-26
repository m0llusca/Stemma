import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  localeFindFirst: vi.fn(),
  translationValueFindMany: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    locale: {
      findFirst: mocks.localeFindFirst
    },
    translationValue: {
      findMany: mocks.translationValueFindMany
    }
  }
}));

describe("i18n runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes supported locale codes and rejects unsafe values", async () => {
    const { normalizeLocaleCode } = await import("@/lib/i18n/locale-codes");

    expect(normalizeLocaleCode("EN-us")).toBe("en-US");
    expect(normalizeLocaleCode("ru")).toBe("ru");
    expect(() => normalizeLocaleCode("../ru")).toThrow("Некорректный код языка.");
  });

  it("loads published workspace values over built-in fallback", async () => {
    mocks.localeFindFirst.mockResolvedValue({ id: "locale-en", code: "en" });
    mocks.translationValueFindMany.mockResolvedValue([
      {
        publishedText: "Workspace dashboard override",
        key: { namespace: "dashboard", key: "title" }
      }
    ]);

    const { getDictionary } = await import("@/lib/i18n/dictionary");
    const dict = await getDictionary("workspace-1", "en");

    expect(dict.locale).toBe("en");
    expect(dict.t("dashboard.title")).toBe("Workspace dashboard override");
    expect(dict.t("shell.nav.dashboard")).toBe("Dashboard");
    expect(dict.t("missing.key")).toBe("missing.key");
    expect(mocks.translationValueFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        localeId: "locale-en",
        publishedAt: { not: null },
        publishedText: { not: null }
      },
      select: {
        publishedText: true,
        key: {
          select: {
            namespace: true,
            key: true
          }
        }
      }
    });
  });

  it("falls back to default enabled workspace locale and built-in ru", async () => {
    mocks.localeFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "locale-ru", code: "ru" });
    mocks.translationValueFindMany.mockResolvedValue([]);

    const { getDictionary } = await import("@/lib/i18n/dictionary");
    const dict = await getDictionary("workspace-1", "en-US");

    expect(dict.locale).toBe("ru");
    expect(dict.t("dashboard.title")).toBe("Дашборд качества");
  });
});
