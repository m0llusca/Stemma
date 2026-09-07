import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSelfReviewTriage, trainingAssignmentEmptyCopy } from "@/lib/self-review/empty-honesty";

const inboxHref = "/reviews/conv-1";

describe("buildSelfReviewTriage", () => {
  it("UX-ACCEPT: inbox with appeals stays warning and answers now", () => {
    expect(
      buildSelfReviewTriage({
        pendingInboxCount: 2,
        appealCount: 1,
        openTrainingCount: 4,
        overdueTrainingCount: 0,
        inboxHref
      })
    ).toMatchObject({
      tone: "warning",
      title: "2 проверки ждут вашего ответа",
      action: { label: "Ответить сейчас", href: inboxHref }
    });
  });

  it("UX-ACCEPT: open training without inbox is warning/accent plus a coaching CTA", () => {
    const open = buildSelfReviewTriage({
      pendingInboxCount: 0,
      appealCount: 0,
      openTrainingCount: 3,
      overdueTrainingCount: 0,
      inboxHref: null
    });
    const overdue = buildSelfReviewTriage({
      pendingInboxCount: 0,
      appealCount: 0,
      openTrainingCount: 1,
      overdueTrainingCount: 1,
      inboxHref: null
    });

    expect(open.tone).toBe("accent");
    expect(overdue.tone).toBe("warning");
    expect(open.title).toBe("Есть открытые учебные задачи");
    expect(open.description).toBe("Осталось закрыть 3 учебные задачи после разбора.");
    expect(open.action).toEqual({ label: "К учебным задачам", href: "/coaching" });
    expect(open.tone).not.toBe("success");
    expect(overdue.tone).not.toBe("success");
  });

  it("UX-ACCEPT: success only when inbox and training are both clear", () => {
    expect(
      buildSelfReviewTriage({
        pendingInboxCount: 0,
        appealCount: 0,
        openTrainingCount: 0,
        overdueTrainingCount: 0,
        inboxHref: null
      })
    ).toMatchObject({
      tone: "success",
      title: "Срочных ответов нет",
      action: null
    });
  });
});

describe("trainingAssignmentEmptyCopy", () => {
  it("UX-ACCEPT: never-assigned is not a finished-work claim", () => {
    const neverAssigned = trainingAssignmentEmptyCopy(false);

    expect(neverAssigned.title).toBe("Задач пока нет");
    expect(neverAssigned.description).toContain("когда их назначит тимлид");
    expect(neverAssigned.title).not.toBe("Задач нет");
    expect(neverAssigned.description).not.toContain("закрыты");
  });

  it("UX-ACCEPT: all-done copy is reserved for agents who were assigned", () => {
    const allDone = trainingAssignmentEmptyCopy(true);

    expect(allDone.title).toBe("Открытых задач нет");
    expect(allDone.description).toBe("Все назначенные разборы закрыты.");
    expect(allDone.title).not.toBe("Задач пока нет");
  });
});

describe("self-review empty honesty adversarial", () => {
  const page = readFileSync(join(process.cwd(), "src/app/self-review/page.tsx"), "utf8");

  it("does not hardcode success when the inbox is empty", () => {
    expect(page).toContain("buildSelfReviewTriage");
    expect(page).toContain("trainingAssignmentEmptyCopy");
    expect(page).toContain("assignedTrainingCount");
    expect(page).not.toContain(': "success"');
    expect(page).not.toContain('title="Задач нет"');
    expect(page).not.toContain("Все разборы закрыты.");
  });

  it("does not treat an empty open-assignment query as all-done", () => {
    expect(page).toContain("trainingAssignmentEmptyCopy(assignedTrainingCount > 0)");
    expect(page).not.toMatch(/assignments\.length > 0[\s\S]*Все разборы закрыты/);
  });
});
