import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    locale: {
      create: vi.fn(),
      findFirst: vi.fn()
    },
    translationAudit: {
      create: vi.fn(),
      findFirst: vi.fn()
    },
    translationKey: {
      findUnique: vi.fn()
    },
    translationValue: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn()
    }
  };

  return {
    prisma,
    requireCurrentUserPermission: vi.fn(),
    revalidatePath: vi.fn()
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("@/lib/current-user", () => ({
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function adminUser() {
  return {
    id: "admin-1",
    workspaceId: "workspace-1",
    role: "ADMIN"
  };
}

function formData(entries: Record<string, string>) {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }

  return data;
}

describe("i18n admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue(adminUser());
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("creates an enabled non-default workspace locale with a normalized code", async () => {
    mocks.prisma.locale.create.mockResolvedValue({ id: "locale-en-us", code: "en-US" });

    const { createLocaleAction } = await import("@/lib/i18n/actions");

    await createLocaleAction(formData({ code: " EN-us ", name: "English (US)" }));

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("appearance:manage");
    expect(mocks.prisma.locale.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        code: "en-US",
        name: "English (US)",
        isDefault: false,
        isEnabled: true
      }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/localization");
  });

  it("upserts a draft translation and records draft audit before and after text", async () => {
    mocks.prisma.locale.findFirst.mockResolvedValue({ id: "locale-en" });
    mocks.prisma.translationKey.findUnique.mockResolvedValue({ id: "key-title" });
    mocks.prisma.translationValue.findUnique.mockResolvedValue({
      id: "value-1",
      draftText: "Old draft"
    });
    mocks.prisma.translationValue.upsert.mockResolvedValue({ id: "value-1" });

    const { saveTranslationDraftAction } = await import("@/lib/i18n/actions");

    await saveTranslationDraftAction(
      formData({
        localeId: "locale-en",
        keyId: "key-title",
        draftText: "New draft"
      })
    );

    expect(mocks.prisma.translationValue.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId_localeId_keyId: {
          workspaceId: "workspace-1",
          localeId: "locale-en",
          keyId: "key-title"
        }
      },
      update: {
        draftText: "New draft"
      },
      create: {
        workspaceId: "workspace-1",
        localeId: "locale-en",
        keyId: "key-title",
        draftText: "New draft"
      }
    });
    expect(mocks.prisma.translationAudit.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        localeId: "locale-en",
        keyId: "key-title",
        actorId: "admin-1",
        action: "draft_save",
        beforeText: "Old draft",
        afterText: "New draft"
      }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/localization");
  });

  it("publishes a draft, increments version and records publish audit", async () => {
    mocks.prisma.translationValue.findUnique.mockResolvedValue({
      id: "value-1",
      workspaceId: "workspace-1",
      localeId: "locale-en",
      keyId: "key-title",
      draftText: "Ready text",
      publishedText: "Old published",
      version: 2
    });
    mocks.prisma.translationValue.update.mockResolvedValue({ id: "value-1", version: 3 });

    const { publishTranslationAction } = await import("@/lib/i18n/actions");

    await publishTranslationAction(formData({ valueId: "value-1" }));

    expect(mocks.prisma.translationValue.update).toHaveBeenCalledWith({
      where: { id: "value-1" },
      data: {
        publishedText: "Ready text",
        publishedAt: expect.any(Date),
        publishedById: "admin-1",
        version: { increment: 1 }
      }
    });
    expect(mocks.prisma.translationAudit.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        localeId: "locale-en",
        keyId: "key-title",
        actorId: "admin-1",
        action: "publish",
        beforeText: "Old published",
        afterText: "Ready text"
      }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/localization");
  });

  it("rejects publishing a translation value from another workspace", async () => {
    mocks.prisma.translationValue.findUnique.mockResolvedValue({
      id: "value-foreign",
      workspaceId: "workspace-2",
      localeId: "locale-en",
      keyId: "key-title",
      draftText: "Foreign draft",
      publishedText: null,
      version: 0
    });

    const { publishTranslationAction } = await import("@/lib/i18n/actions");

    await expect(publishTranslationAction(formData({ valueId: "value-foreign" }))).rejects.toThrow(
      "Перевод не найден в текущем рабочем пространстве."
    );

    expect(mocks.prisma.translationValue.update).not.toHaveBeenCalled();
    expect(mocks.prisma.translationAudit.create).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rolls back to the previous published text from publish audit and records rollback audit", async () => {
    mocks.prisma.translationValue.findUnique.mockResolvedValue({
      id: "value-1",
      workspaceId: "workspace-1",
      localeId: "locale-en",
      keyId: "key-title",
      draftText: "Current published",
      publishedText: "Current published",
      version: 4
    });
    mocks.prisma.translationAudit.findFirst.mockResolvedValue({
      beforeText: "Previous published"
    });
    mocks.prisma.translationValue.update.mockResolvedValue({ id: "value-1", version: 5 });

    const { rollbackTranslationAction } = await import("@/lib/i18n/actions");

    await rollbackTranslationAction(formData({ valueId: "value-1" }));

    expect(mocks.prisma.translationAudit.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        localeId: "locale-en",
        keyId: "key-title",
        action: "publish"
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        beforeText: true
      }
    });
    expect(mocks.prisma.translationValue.update).toHaveBeenCalledWith({
      where: { id: "value-1" },
      data: {
        draftText: "Previous published",
        publishedText: "Previous published",
        publishedAt: expect.any(Date),
        publishedById: "admin-1",
        version: { increment: 1 }
      }
    });
    expect(mocks.prisma.translationAudit.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        localeId: "locale-en",
        keyId: "key-title",
        actorId: "admin-1",
        action: "rollback",
        beforeText: "Current published",
        afterText: "Previous published"
      }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/localization");
  });
});
