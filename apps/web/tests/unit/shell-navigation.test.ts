import { describe, expect, it } from "vitest";
import {
  activeAreaForPath,
  buildShellNavigation,
  topNavAreas,
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
  it("exposes the five primary product areas in order", () => {
    expect(topNavAreas.map((area) => area.id)).toEqual(["today", "review", "calibration", "coaching", "analytics"]);
  });

  it("derives labels and hrefs from the shell mode model", () => {
    const byId = Object.fromEntries(topNavAreas.map((area) => [area.id, area]));

    expect(byId.today.href).toBe("/dashboard");
    expect(byId.review.href).toBe("/reviews");
    expect(byId.calibration.href).toBe("/calibration");
    expect(byId.coaching.href).toBe("/coaching");
    expect(byId.analytics.href).toBe("/reports");
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
    // /reviews and /self-review must not collide; /self-review has no area.
    expect(activeAreaForPath("/self-review")).toBeNull();
  });

  it("returns null for admin paths that do not map to a primary area", () => {
    expect(activeAreaForPath("/admin/integrations")).toBeNull();
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
