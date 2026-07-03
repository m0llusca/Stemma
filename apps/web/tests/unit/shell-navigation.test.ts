import { describe, expect, it } from "vitest";
import {
  activeAreaForPath,
  buildShellNavigation,
  topNavAreas,
  visibleTopNavAreas,
  type ShellCommandItem
} from "@/lib/shell/navigation";

// Mirrors the palette filter in app-nav-shell.tsx (label/description/modeLabel/aliases).
function commandMatches(command: ShellCommandItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [command.label, command.description, command.modeLabel, ...command.aliases].some((value) =>
    value.toLowerCase().includes(normalized)
  );
}

describe("topNavAreas", () => {
  it("exposes the primary product areas in order", () => {
    expect(topNavAreas.map((area) => area.id)).toEqual([
      "today",
      "feedback",
      "review",
      "calibration",
      "coaching",
      "analytics",
      "settings"
    ]);
  });

  it("derives labels and hrefs from the shell mode model", () => {
    const byId = Object.fromEntries(topNavAreas.map((area) => [area.id, area]));

    expect(byId.today.href).toBe("/dashboard");
    expect(byId.feedback.href).toBe("/self-review");
    expect(byId.review.href).toBe("/reviews");
    expect(byId.calibration.href).toBe("/calibration");
    expect(byId.coaching.href).toBe("/coaching");
    expect(byId.analytics.href).toBe("/reports");
    expect(byId.settings.href).toBe("/admin");
  });
});

describe("visibleTopNavAreas", () => {
  it("gives a support agent only the areas its permissions can open", () => {
    // Калибровка (calibration:manage), Аналитика (reports:read) и Настройки
    // недоступны роли SUPPORT_AGENT — их страницы бросают "Недостаточно прав".
    expect(visibleTopNavAreas("SUPPORT_AGENT").map((area) => area.id)).toEqual([
      "today",
      "feedback",
      "review",
      "coaching"
    ]);
  });

  it("keeps the manager areas for admins and hides the agent feedback area", () => {
    expect(visibleTopNavAreas("ADMIN").map((area) => area.id)).toEqual([
      "today",
      "review",
      "calibration",
      "coaching",
      "analytics",
      "settings"
    ]);
    expect(visibleTopNavAreas("TEAM_LEAD").map((area) => area.id)).toEqual([
      "today",
      "review",
      "calibration",
      "coaching",
      "analytics",
      "settings"
    ]);
  });

  it("hides settings from QA analysts because /admin requires audit:read", () => {
    expect(visibleTopNavAreas("QA_ANALYST").map((area) => area.id)).toEqual([
      "today",
      "review",
      "calibration",
      "coaching",
      "analytics"
    ]);
  });

  it("gives a viewer no areas because it holds no permissions", () => {
    // VIEWER не имеет ни одного права → ни одна область топ-навигации не должна
    // вести на страницу, чей собственный гвард бросит «Недостаточно прав».
    expect(visibleTopNavAreas("VIEWER").map((area) => area.id)).toEqual([]);
  });
});

describe("activeAreaForPath", () => {
  it("matches a nested review path to the review area", () => {
    expect(activeAreaForPath("/reviews/abc")).toBe("review");
  });

  it("matches the reports root to the analytics area", () => {
    expect(activeAreaForPath("/reports")).toBe("analytics");
  });

  it("matches the calibration root to the calibration area", () => {
    expect(activeAreaForPath("/calibration")).toBe("calibration");
  });

  it("matches the dashboard root to the today area", () => {
    expect(activeAreaForPath("/dashboard")).toBe("today");
  });

  it("matches a nested coaching path to the coaching area", () => {
    expect(activeAreaForPath("/coaching/task-1")).toBe("coaching");
  });

  it("uses the longest matching prefix", () => {
    // /reviews and /self-review must not collide; /self-review highlights the
    // agent feedback area, not the review queue.
    expect(activeAreaForPath("/self-review")).toBe("feedback");
  });

  it("maps admin paths to the settings area", () => {
    expect(activeAreaForPath("/admin")).toBe("settings");
    expect(activeAreaForPath("/admin/integrations")).toBe("settings");
  });

  it("returns null for unknown paths", () => {
    expect(activeAreaForPath("/totally-unknown")).toBeNull();
  });
});

describe("command palette action items", () => {
  const actionItems = buildShellNavigation({ role: "ADMIN" }).commandItems.filter(
    (item) => item.kind === "action"
  );

  it("exposes the fast-path actions with their real routes", () => {
    const byHref = Object.fromEntries(actionItems.map((item) => [item.href, item]));

    expect(byHref["/reviews?status=unreviewed"]?.label).toBe("Взять следующий кейс");
    expect(byHref["/reviews?due=overdue"]?.label).toBe("Открыть просроченные SLA");
    expect(byHref["/reports?period=quarter-current"]?.label).toBe("Открыть аналитику за квартал");
    expect(byHref["/coaching"]?.label).toBe("Перейти к обучению");
  });

  it("tags fast-path items with the action kind so the palette can badge them", () => {
    expect(actionItems.length).toBeGreaterThanOrEqual(4);
    expect(actionItems.every((item) => item.kind === "action")).toBe(true);
  });

  it("filters action items by alias, label and description", () => {
    const nextCase = actionItems.find((item) => item.href === "/reviews?status=unreviewed");
    expect(nextCase).toBeDefined();

    // alias "следующий кейс" / label "Взять следующий кейс" both contain "след".
    expect(commandMatches(nextCase!, "след")).toBe(true);
    // description-based match ("Текущий квартал" analytics action mentions риск).
    const quarter = actionItems.find((item) => item.href === "/reports?period=quarter-current");
    expect(commandMatches(quarter!, "квартал")).toBe(true);
    // non-matching query should be filtered out.
    expect(commandMatches(nextCase!, "интеграция")).toBe(false);
  });

  it("respects role gating for action items", () => {
    const agentActions = buildShellNavigation({ role: "SUPPORT_AGENT" }).commandItems.filter(
      (item) => item.kind === "action"
    );

    // The queue/SLA/analytics actions are role-gated to ADMIN/TEAM_LEAD/QA_ANALYST (or reports:read),
    // so a support agent never sees them even though it holds reviews:read.
    const agentHrefs = agentActions.map((item) => item.href);
    expect(agentHrefs).not.toContain("/reviews?status=unreviewed");
    expect(agentHrefs).not.toContain("/reviews?due=overdue");
    expect(agentHrefs).not.toContain("/reports?period=quarter-current");
  });
});

describe("buildShellNavigation gating gaps", () => {
  it("gives a viewer an empty palette because it holds no permissions", () => {
    // VIEWER не имеет прав, поэтому ни моды, ни действия не должны попадать в
    // ⌘K-палитру. В частности mode/destination «Пульс дня» → /dashboard требует
    // reviews:read, которого у VIEWER нет.
    const navigation = buildShellNavigation({ role: "VIEWER" });
    expect(navigation.commandItems).toEqual([]);
    expect(navigation.modes).toEqual([]);
  });

  it("surfaces the report-schedules destination for everyone holding reports:manage", () => {
    // /admin/report-schedules гейтится reports:read, но точка входа скрыта:
    // /admin индекс требует audit:read, а область «Настройки» ограничена
    // ADMIN/TEAM_LEAD. Добавляем destination по reports:manage, чтобы его
    // получили ADMIN, TEAM_LEAD и QA_ANALYST.
    for (const role of ["ADMIN", "TEAM_LEAD", "QA_ANALYST"] as const) {
      const hrefs = buildShellNavigation({ role }).commandItems.map((item) => item.href);
      expect(hrefs).toContain("/admin/report-schedules");
    }
  });

  it("hides the report-schedules destination from roles without reports:manage", () => {
    // У SUPPORT_AGENT нет reports:manage, поэтому расписания отчётов ему не видны.
    const agentHrefs = buildShellNavigation({ role: "SUPPORT_AGENT" }).commandItems.map(
      (item) => item.href
    );
    expect(agentHrefs).not.toContain("/admin/report-schedules");
    const viewerHrefs = buildShellNavigation({ role: "VIEWER" }).commandItems.map(
      (item) => item.href
    );
    expect(viewerHrefs).not.toContain("/admin/report-schedules");
  });

  it("labels the report-schedules destination inside the quality mode", () => {
    const reportSchedules = buildShellNavigation({ role: "QA_ANALYST" }).commandItems.find(
      (item) => item.href === "/admin/report-schedules"
    );
    expect(reportSchedules).toBeDefined();
    expect(reportSchedules!.label).toBe("Расписания отчетов");
    expect(reportSchedules!.modeId).toBe("quality");
    expect(reportSchedules!.aliases).toEqual(
      expect.arrayContaining(["расписания", "report schedules"])
    );
  });
});
