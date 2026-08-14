import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  localeFindFirst: vi.fn(),
  localeFindMany: vi.fn(),
  translationValueFindMany: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    locale: {
      findFirst: mocks.localeFindFirst,
      findMany: mocks.localeFindMany
    },
    translationValue: {
      findMany: mocks.translationValueFindMany
    }
  }
}));

describe("i18n runtime", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("normalizes supported locale codes and rejects unsafe values", async () => {
    const { baseLocaleCode, normalizeLocaleCode } = await import("@/lib/i18n/locale-codes");

    expect(normalizeLocaleCode("EN-us")).toBe("en-US");
    expect(normalizeLocaleCode("ru")).toBe("ru");
    expect(normalizeLocaleCode("zh-hans-cn")).toBe("zh-Hans-CN");
    expect(normalizeLocaleCode("sr-cyrl")).toBe("sr-Cyrl");
    expect(baseLocaleCode("zh-Hans-CN")).toBe("zh");
    expect(baseLocaleCode("EN-us")).toBe("en");
    expect(() => normalizeLocaleCode("../ru")).toThrow("Некорректный код языка.");
  });

  it("loads published workspace values over built-in fallback", async () => {
    mocks.localeFindMany.mockResolvedValue([{ id: "locale-en", code: "en" }]);
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
    expect(dict.t("shell.nav.dashboard")).toBe("Today");
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

  it("preserves empty published workspace translations", async () => {
    mocks.localeFindMany.mockResolvedValue([{ id: "locale-en", code: "en" }]);
    mocks.translationValueFindMany.mockResolvedValue([
      {
        publishedText: "",
        key: { namespace: "dashboard", key: "title" }
      }
    ]);

    const { getDictionary } = await import("@/lib/i18n/dictionary");
    const dict = await getDictionary("workspace-1", "en");

    expect(dict.locale).toBe("en");
    expect(dict.t("dashboard.title")).toBe("");
  });

  it("falls back to default enabled workspace locale and built-in ru", async () => {
    mocks.localeFindMany.mockResolvedValue([]);
    mocks.localeFindFirst.mockResolvedValue({ id: "locale-ru", code: "ru" });
    mocks.translationValueFindMany.mockResolvedValue([]);

    const { getDictionary } = await import("@/lib/i18n/dictionary");
    const dict = await getDictionary("workspace-1", "en-US");

    expect(dict.locale).toBe("ru");
    expect(dict.t("dashboard.title")).toBe("Дашборд качества");
    expect(mocks.localeFindFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        isDefault: true,
        isEnabled: true
      },
      select: {
        id: true,
        code: true
      },
      orderBy: [{ code: "asc" }, { id: "asc" }]
    });
  });

  it("falls back to base built-in language for enabled regional locales", async () => {
    mocks.localeFindMany.mockResolvedValue([{ id: "locale-en-us", code: "en-US" }]);
    mocks.translationValueFindMany.mockResolvedValue([]);

    const { getDictionary } = await import("@/lib/i18n/dictionary");
    const dict = await getDictionary("workspace-1", "en-US");

    expect(dict.locale).toBe("en-US");
    expect(dict.t("dashboard.title")).toBe("Quality dashboard");
    expect(dict.t("shell.nav.dashboard")).toBe("Today");
    expect(mocks.localeFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        code: {
          in: ["en-US", "en"]
        },
        isEnabled: true
      },
      select: {
        id: true,
        code: true
      }
    });
  });

  it("uses base workspace locale before the default locale", async () => {
    mocks.localeFindMany.mockResolvedValue([{ id: "locale-en", code: "en" }]);
    mocks.translationValueFindMany.mockResolvedValue([]);

    const { getDictionary } = await import("@/lib/i18n/dictionary");
    const dict = await getDictionary("workspace-1", "en-US");

    expect(dict.locale).toBe("en");
    expect(dict.t("dashboard.title")).toBe("Quality dashboard");
    expect(mocks.localeFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        code: {
          in: ["en-US", "en"]
        },
        isEnabled: true
      },
      select: {
        id: true,
        code: true
      }
    });
    expect(mocks.localeFindFirst).not.toHaveBeenCalled();
    expect(mocks.translationValueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace-1",
          localeId: "locale-en"
        })
      })
    );
  });
});
