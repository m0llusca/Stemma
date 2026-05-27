import { describe, expect, it } from "vitest";
import { buildImprovementHighlights } from "@/lib/report-improvements";

describe("buildImprovementHighlights", () => {
  it("surfaces only segments that improved against the previous period", () => {
    const items = buildImprovementHighlights([
      {
        label: "Команды",
        rows: [
          { label: "ФГИС", count: 14, averageScore: 82, href: "/reviews?teamName=ФГИС" },
          { label: "Личный кабинет", count: 8, averageScore: 76, href: "/reviews?teamName=Личный+кабинет" }
        ],
        previousRows: [
          { label: "ФГИС", count: 10, averageScore: 74 },
          { label: "Личный кабинет", count: 7, averageScore: 80 }
        ]
      },
      {
        label: "Источники",
        rows: [{ label: "Zendesk", count: 9, averageScore: 91, href: "/reviews?source=zendesk" }],
        previousRows: [{ label: "Zendesk", count: 6, averageScore: 88 }]
      },
      {
        label: "Операторы",
        rows: [{ label: "Иван Петров", count: 4, averageScore: 93, href: "/reviews?assignee=Иван+Петров" }],
        previousRows: [{ label: "Иван Петров", count: 4, averageScore: null }]
      }
    ]);

    expect(items).toEqual([
      {
        scope: "Команды",
        label: "ФГИС",
        count: 14,
        currentScore: 82,
        previousScore: 74,
        delta: 8,
        href: "/reviews?teamName=ФГИС"
      },
      {
        scope: "Источники",
        label: "Zendesk",
        count: 9,
        currentScore: 91,
        previousScore: 88,
        delta: 3,
        href: "/reviews?source=zendesk"
      }
    ]);
  });
});
