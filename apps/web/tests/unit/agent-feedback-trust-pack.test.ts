import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("agent feedback trust pack locks", () => {
  const selfReview = read("src/app/self-review/page.tsx");
  const list = read("src/components/feedback/agent-criterion-feedback-list.tsx");
  const mapper = read("src/lib/feedback/agent-criterion-feedback.ts");
  const appeal = read("src/lib/feedback/agent-appeal.ts");

  it("keeps the locked deduction order and honest quote copy", () => {
    expect(list).toContain("Цитата");
    expect(list).toContain("Снятие");
    expect(list).toContain("Как исправить");
    expect(list).toContain("Апелляция");
    expect(list.indexOf("Цитата")).toBeLessThan(list.indexOf("Снятие"));
    expect(list.indexOf("Снятие")).toBeLessThan(list.indexOf("Как исправить"));
    expect(list.indexOf("Как исправить")).toBeLessThan(list.indexOf(">Апелляция<") >= 0 ? list.indexOf(">Апелляция<") : list.indexOf("Апелляция"));
    expect(mapper).toContain('export const AGENT_QUOTE_UNAVAILABLE = "цитата недоступна"');
    expect(list).toContain("AGENT_QUOTE_UNAVAILABLE");
    expect(list).not.toContain("Цитата в проверке не привязана");
  });

  it("wires appeal on each deduction and keeps the footer CTA", () => {
    expect(selfReview).toContain("AgentCriterionFeedbackList");
    expect(selfReview).toContain("appeal={{");
    expect(selfReview).toContain("Оспорить оценку");
    expect(selfReview).toContain("AgentAppealForm");
    expect(selfReview).toContain("canAgentOpenAppeal");
  });

  it("kills ranks, FAIL spectacle and shame copy on agent surfaces", () => {
    for (const source of [selfReview, list]) {
      expect(source).not.toContain("вы провалили");
      expect(source).not.toContain("ниже команды");
      expect(source).not.toContain("выше команды");
      expect(source).not.toContain("leaderboard");
      expect(source).not.toContain("лидерборд");
      expect(source).not.toMatch(/["']FAIL["']/);
    }

    expect(selfReview).not.toContain("teamScoreAggregate");
    expect(selfReview).not.toContain("Все разборы закрыты");
    expect(mapper).toContain("не зачтено");
    expect(mapper).not.toContain("Незачет");
  });

  it("keeps appeal phases in Russian", () => {
    expect(appeal).toContain("Не подана");
    expect(appeal).toContain("Подана");
    expect(appeal).toContain("На рассмотрении");
    expect(appeal).toContain("Решена");
    expect(appeal).toContain("Статус сотрудника не меняется");
  });
});
