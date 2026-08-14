import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUserPermission: vi.fn(),
  prisma: {
    savedReportView: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn()
    }
  },
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn()
  ,
  loadReportFilterCatalog: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/current-user", () => ({
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/reports/report-filter-catalog", () => ({
  loadReportFilterCatalog: mocks.loadReportFilterCatalog
}));

const reportCatalog = {
  teams: [{ slug: "declining-team-0123456789", value: "2ЛП — снижение" }],
  sources: ["freshdesk"],
  blocks: [{ slug: "processes-aabbccddee", value: "Процессы" }]
};

function asAnalyst() {
  // QA_ANALYST has reports:read AND reports:manage in the real permission map.
  mocks.requireCurrentUserPermission.mockResolvedValue({
    id: "user-1",
    name: "Аналитик",
    workspaceId: "workspace-1",
    role: "QA_ANALYST"
  });
}

function asSupportAgent() {
  // SUPPORT_AGENT has neither reports:read nor reports:manage.
  mocks.requireCurrentUserPermission.mockResolvedValue({
    id: "agent-1",
    name: "Оператор",
    workspaceId: "workspace-1",
    role: "SUPPORT_AGENT"
  });
}

describe("saved report view actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asAnalyst();
    mocks.prisma.savedReportView.create.mockResolvedValue({ id: "view-1" });
    mocks.prisma.savedReportView.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.savedReportView.findMany.mockResolvedValue([]);
    mocks.loadReportFilterCatalog.mockResolvedValue(reportCatalog);
  });

  it("gates create behind the reports:read permission", async () => {
    const { createSavedReportView } = await import("@/lib/saved-report-view-actions");
    const formData = new FormData();
    formData.set("name", "Мой отчёт");
    formData.set(
      "href",
      "/reports?view=overview&period=vk-current&trend=week&risk=high_plus&evidenceType=kpi&evidenceKey=ev1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    );

    await expect(createSavedReportView(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/reports?view=overview&period=vk-current&compare=previous&grain=week&risk=high_plus&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
    );

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("reports:read");
    expect(mocks.loadReportFilterCatalog).toHaveBeenCalledWith("workspace-1");
    expect(mocks.prisma.savedReportView.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        href:
          "/reports?view=overview&period=vk-current&compare=previous&grain=week&risk=high_plus&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
      })
    });
  });

  it("normalizes saved view hrefs to internal /reports URLs before redirecting", async () => {
    const { createSavedReportView } = await import("@/lib/saved-report-view-actions");
    const formData = new FormData();
    formData.set("name", "Опасный редирект");
    formData.set("href", "https://evil.example/phish");

    await expect(createSavedReportView(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
    );

    expect(mocks.prisma.savedReportView.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        href:
          "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget",
        scope: "private",
        userId: "user-1",
        workspaceId: "workspace-1"
      })
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
    );
  });

  it("rejects an empty name without writing", async () => {
    const { createSavedReportView } = await import("@/lib/saved-report-view-actions");
    const formData = new FormData();
    formData.set("name", "   ");
    formData.set("href", "/reports?period=7d");

    await expect(createSavedReportView(formData)).rejects.toThrow("Название представления обязательно.");
    expect(mocks.prisma.savedReportView.create).not.toHaveBeenCalled();
  });

  it("creates a shared view (userId null) for a manager", async () => {
    const { createSavedReportView } = await import("@/lib/saved-report-view-actions");
    const formData = new FormData();
    formData.set("name", "Командный отчёт");
    formData.set(
      "href",
      "/reports?view=overview&period=vk-current&grain=day&team=declining-team-0123456789"
    );
    formData.set("scope", "shared");

    await expect(createSavedReportView(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/reports?view=overview&period=vk-current&compare=previous&grain=day&team=declining-team-0123456789&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
    );

    expect(mocks.prisma.savedReportView.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: "shared",
        userId: null,
        href:
          "/reports?view=overview&period=vk-current&compare=previous&grain=day&team=declining-team-0123456789&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
      })
    });
  });

  it("does not let users without reports:manage create shared report views", async () => {
    // VIEWER would be blocked by the permission gate itself; here we model a role
    // that has reports:read but not reports:manage by stubbing requireCurrentUserPermission
    // to resolve, then asserting the manage-only shared scope is refused.
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "lead-1",
      name: "Тимлид",
      workspaceId: "workspace-1",
      role: "SUPPORT_AGENT" // no reports:manage in the real map
    });

    const { createSavedReportView } = await import("@/lib/saved-report-view-actions");
    const formData = new FormData();
    formData.set("name", "Командный отчёт");
    formData.set("href", "/reports?team=core");
    formData.set("scope", "shared");

    await expect(createSavedReportView(formData)).rejects.toThrow("Нет прав на общие представления отчётов.");
    expect(mocks.prisma.savedReportView.create).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("scopes delete to the user's own views when they cannot manage shared views", async () => {
    asSupportAgent();
    const { deleteSavedReportView } = await import("@/lib/saved-report-view-actions");
    const formData = new FormData();
    formData.set("id", "shared-view");

    await deleteSavedReportView(formData);

    expect(mocks.prisma.savedReportView.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "shared-view",
        workspaceId: "workspace-1",
        userId: "agent-1"
      }
    });
  });

  it("lets a manager delete shared views too", async () => {
    const { deleteSavedReportView } = await import("@/lib/saved-report-view-actions");
    const formData = new FormData();
    formData.set("id", "shared-view");

    await deleteSavedReportView(formData);

    expect(mocks.prisma.savedReportView.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "shared-view",
        workspaceId: "workspace-1",
        OR: [{ userId: "user-1" }, { scope: "shared" }]
      }
    });
  });

  it("requires an id to delete", async () => {
    const { deleteSavedReportView } = await import("@/lib/saved-report-view-actions");
    const formData = new FormData();

    await expect(deleteSavedReportView(formData)).rejects.toThrow("Представление не найдено.");
    expect(mocks.prisma.savedReportView.deleteMany).not.toHaveBeenCalled();
  });
});

describe("listSavedReportViews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.savedReportView.findMany.mockResolvedValue([
      {
        id: "v1",
        name: "Личный",
        href:
          "/reports?view=performance&period=vk-current&trend=month&source=freshdesk&block=processes-aabbccddee&section=ai-drift&evidenceType=trend&evidenceKey=ev1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        scope: "private"
      }
    ]);
    mocks.loadReportFilterCatalog.mockResolvedValue(reportCatalog);
  });

  it("returns the user's private views plus shared views in stable order", async () => {
    const { listSavedReportViews } = await import("@/lib/saved-report-view");

    const views = await listSavedReportViews("workspace-1", "user-1");

    expect(mocks.loadReportFilterCatalog).toHaveBeenCalledWith("workspace-1");
    expect(mocks.prisma.savedReportView.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        OR: [{ userId: "user-1" }, { scope: "shared" }]
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, href: true, scope: true }
    });
    expect(views).toEqual([
      {
        id: "v1",
        name: "Личный",
        href:
          "/reports?view=performance&period=vk-current&compare=previous&grain=week&source=freshdesk&block=processes-aabbccddee&section=ai-drift&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget",
        scope: "private"
      }
    ]);
  });
});
