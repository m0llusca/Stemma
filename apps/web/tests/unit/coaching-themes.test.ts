import { describe, expect, it } from "vitest";
import {
  aggregateCoachingThemes,
  coachingThemeCasesHref,
  coachingThemeSourceLabel,
  groupCoachingThemesByAgent
} from "@/lib/coaching-themes";

describe("aggregateCoachingThemes", () => {
  it("ranks finding categories and failed criteria by frequency", () => {
    const themes = aggregateCoachingThemes([
      {
        assigneeName: "Иван",
        findings: [
          { category: "Эмпатия", rootCause: "Не извинился", riskLevel: "HIGH" },
          { category: "Эмпатия", rootCause: "None", riskLevel: "MEDIUM" }
        ],
        scores: [
          {
            passed: false,
            value: null,
            isNotApplicable: false,
            criterion: { label: "Приветствие", kind: "PASS_FAIL" }
          },
          {
            passed: true,
            value: null,
            isNotApplicable: false,
            criterion: { label: "Закрытие", kind: "PASS_FAIL" }
          },
          {
            passed: null,
            value: 1,
            isNotApplicable: false,
            criterion: { label: "Точность", kind: "SCALE_0_3" }
          }
        ]
      },
      {
        assigneeName: "Иван",
        findings: [{ category: "Маршрутизация", rootCause: "Неверный отдел", riskLevel: "CRITICAL" }],
        scores: [
          {
            passed: false,
            value: null,
            isNotApplicable: false,
            criterion: { label: "Приветствие", kind: "PASS_FAIL" }
          }
        ]
      }
    ]);

    expect(themes[0]).toMatchObject({
      label: "Эмпатия",
      count: 2,
      source: "finding_category",
      riskLevel: "HIGH_OR_CRITICAL"
    });
    expect(themes.some((theme) => theme.label === "Приветствие" && theme.source === "failed_criterion" && theme.count === 2)).toBe(
      true
    );
    expect(themes.some((theme) => theme.label === "Точность" && theme.source === "failed_criterion")).toBe(true);
    expect(themes.some((theme) => theme.label === "Закрытие")).toBe(false);
    expect(themes.some((theme) => theme.label === "None")).toBe(false);
  });

  it("skips N/A scores and empty labels", () => {
    const themes = aggregateCoachingThemes([
      {
        assigneeName: "Анна",
        findings: [{ category: "  ", rootCause: "-", riskLevel: "LOW" }],
        scores: [
          {
            passed: false,
            value: null,
            isNotApplicable: true,
            criterion: { label: "Скрипт", kind: "PASS_FAIL" }
          }
        ]
      }
    ]);

    expect(themes).toEqual([]);
  });
});

describe("groupCoachingThemesByAgent", () => {
  it("keeps only the newest N reviews per agent when grouping", () => {
    const reviews = Array.from({ length: 5 }, (_, index) => ({
      assigneeName: "Иван",
      findings: [{ category: `Тема-${index}`, rootCause: "None", riskLevel: "LOW" }],
      scores: [] as never[]
    }));

    const grouped = groupCoachingThemesByAgent(reviews, { perAgentLimit: 2, themeLimit: 5 });
    expect(grouped["Иван"]).toHaveLength(2);
    expect(grouped["Иван"].map((theme) => theme.label)).toEqual(["Тема-0", "Тема-1"]);
  });
});

describe("coachingThemeCasesHref", () => {
  it("links agent cases with findingCategory and risk when mappable", () => {
    expect(
      coachingThemeCasesHref({
        agentName: "Иван",
        theme: { label: "Эмпатия", source: "finding_category", riskLevel: "HIGH_OR_CRITICAL" }
      })
    ).toBe("/reviews?assignee=%D0%98%D0%B2%D0%B0%D0%BD&findingCategory=%D0%AD%D0%BC%D0%BF%D0%B0%D1%82%D0%B8%D1%8F&riskLevel=HIGH_OR_CRITICAL");

    expect(
      coachingThemeCasesHref({
        agentName: "Иван",
        theme: { label: "Приветствие", source: "failed_criterion" }
      })
    ).toBe("/reviews?assignee=%D0%98%D0%B2%D0%B0%D0%BD");
  });

  it("labels theme sources in Russian", () => {
    expect(coachingThemeSourceLabel("finding_category")).toBe("категория");
    expect(coachingThemeSourceLabel("failed_criterion")).toBe("критерий");
    expect(coachingThemeSourceLabel("root_cause")).toBe("причина");
  });
});
