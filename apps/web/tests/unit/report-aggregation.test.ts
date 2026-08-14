import { describe, expect, it } from "vitest";
import {
  addCountGroup,
  addScoreGroup,
  average,
  averageScoreFor,
  blockRows,
  computeAgentLeaderboard,
  computeReasonTrends,
  computeSentimentCorrelation,
  countGroupRows,
  criterionEarnedPercent,
  rankedScoreRows,
  riskSegments,
  scoreDistributionRows,
  scoreGroupRows,
  withScoreDeltas,
  type AgentLeaderboardReview,
  type BreakdownRow,
  type ReasonFinding,
  type ReviewForReport,
  type SentimentReview
} from "@/lib/reports/report-aggregation";
import type { ReportPeriod } from "@/lib/report-period";

type Score = ReviewForReport["scores"][number];

function score(partial: {
  value?: number | null;
  passed?: boolean;
  isNotApplicable?: boolean;
  block?: string;
  kind?: "PASS_FAIL" | "SCALE";
  weight?: number;
}): Score {
  return {
    value: partial.value ?? null,
    passed: partial.passed ?? false,
    isNotApplicable: partial.isNotApplicable ?? false,
    criterion: {
      block: partial.block ?? "Блок",
      kind: partial.kind ?? "SCALE",
      weight: partial.weight ?? 1
    }
  } as Score;
}

function review(partial: { totalScore: number; scores?: Score[] }): ReviewForReport {
  return {
    totalScore: partial.totalScore,
    scores: partial.scores ?? []
  } as ReviewForReport;
}

describe("average", () => {
  it("returns null for an empty list", () => {
    expect(average([])).toBeNull();
  });

  it("computes the arithmetic mean", () => {
    expect(average([80, 90, 100])).toBe(90);
    expect(average([50])).toBe(50);
  });
});

describe("group accumulators", () => {
  it("accumulates scores per label", () => {
    const groups = new Map<string, number[]>();
    addScoreGroup(groups, "A", 80);
    addScoreGroup(groups, "A", 90);
    addScoreGroup(groups, "B", 70);

    expect(groups.get("A")).toEqual([80, 90]);
    expect(groups.get("B")).toEqual([70]);
  });

  it("accumulates counts per label", () => {
    const groups = new Map<string, number>();
    addCountGroup(groups, "X");
    addCountGroup(groups, "X");
    addCountGroup(groups, "Y");

    expect(groups.get("X")).toBe(2);
    expect(groups.get("Y")).toBe(1);
  });
});

describe("scoreGroupRows", () => {
  it("sorts by count desc, then label ascending (ru locale)", () => {
    const groups = new Map<string, number[]>([
      ["Бета", [100]],
      ["Альфа", [80, 90]],
      ["Гамма", [70, 60]]
    ]);

    const rows = scoreGroupRows(groups);

    // Альфа and Гамма both have count 2 -> tie broken by ru collation (Альфа first).
    expect(rows.map((row) => row.label)).toEqual(["Альфа", "Гамма", "Бета"]);
    expect(rows[0]).toEqual({ label: "Альфа", count: 2, averageScore: 85 });
    expect(rows[2]).toEqual({ label: "Бета", count: 1, averageScore: 100 });
  });
});

describe("countGroupRows", () => {
  it("sorts by count desc, then label ascending", () => {
    const groups = new Map<string, number>([
      ["Низкий", 1],
      ["Высокий", 3],
      ["Средний", 1]
    ]);

    const rows = countGroupRows(groups);

    expect(rows).toEqual([
      { label: "Высокий", count: 3 },
      { label: "Низкий", count: 1 },
      { label: "Средний", count: 1 }
    ]);
  });
});

describe("withScoreDeltas", () => {
  it("attaches the score delta against the matching previous-period label", () => {
    const rows: BreakdownRow[] = [
      { label: "A", count: 2, averageScore: 90 },
      { label: "B", count: 1, averageScore: 70 },
      { label: "C", count: 1, averageScore: 80 }
    ];
    const previous: BreakdownRow[] = [
      { label: "A", count: 2, averageScore: 85 },
      { label: "B", count: 1, averageScore: null }
    ];

    const result = withScoreDeltas(rows, previous);

    expect(result[0].delta).toBe(5); // 90 - 85
    expect(result[1].delta).toBeNull(); // previous null
    expect(result[2].delta).toBeNull(); // no previous label C
  });
});

describe("rankedScoreRows", () => {
  it("keeps only rows with a score, sorts lowest first, and caps to the limit", () => {
    const rows: BreakdownRow[] = [
      { label: "Хорошо", count: 5, averageScore: 95 },
      { label: "Слабо", count: 3, averageScore: 60 },
      { label: "Без оценки", count: 1, averageScore: null },
      { label: "Средне", count: 2, averageScore: 78 }
    ];
    const previous: BreakdownRow[] = [{ label: "Слабо", count: 3, averageScore: 65 }];

    const ranked = rankedScoreRows(rows, previous, 2);

    expect(ranked.map((row) => row.label)).toEqual(["Слабо", "Средне"]);
    expect(ranked[0].delta).toBe(-5); // 60 - 65
    expect(ranked[0].meta).toBe("-5 баллов к среднему баллу прошлого периода");
    expect(ranked[1].delta).toBeNull();
    expect(ranked[1].meta).toBe("нет базы сравнения");
  });

  it("breaks equal average scores deterministically by label (ru locale)", () => {
    // Same defect class as P9: a ranking without a total-order tiebreaker.
    const rows: BreakdownRow[] = [
      { label: "Бета", count: 3, averageScore: 70 },
      { label: "Альфа", count: 1, averageScore: 70 }
    ];

    expect(rankedScoreRows(rows, []).map((row) => row.label)).toEqual(["Альфа", "Бета"]);
    expect(rankedScoreRows([...rows].reverse(), []).map((row) => row.label)).toEqual(["Альфа", "Бета"]);
  });
});

describe("criterionEarnedPercent", () => {
  it("returns null for not-applicable criteria", () => {
    expect(criterionEarnedPercent(score({ isNotApplicable: true, kind: "PASS_FAIL", passed: true }))).toBeNull();
  });

  it("maps PASS_FAIL to 0 or 100", () => {
    expect(criterionEarnedPercent(score({ kind: "PASS_FAIL", passed: true }))).toBe(100);
    expect(criterionEarnedPercent(score({ kind: "PASS_FAIL", passed: false }))).toBe(0);
  });

  it("returns null when a scaled value is missing", () => {
    expect(criterionEarnedPercent(score({ kind: "SCALE", value: null }))).toBeNull();
  });

  it("maps a 0-3 scale onto a percentage", () => {
    expect(criterionEarnedPercent(score({ kind: "SCALE", value: 3 }))).toBe(100);
    expect(criterionEarnedPercent(score({ kind: "SCALE", value: 0 }))).toBe(0);
    expect(criterionEarnedPercent(score({ kind: "SCALE", value: 1.5 }))).toBe(50);
  });
});

describe("blockRows", () => {
  it("groups earned-percent per criterion block, skipping N/A and empty values", () => {
    const reviews = [
      review({
        totalScore: 90,
        scores: [
          score({ block: "Решение", kind: "SCALE", value: 3 }),
          score({ block: "Решение", kind: "SCALE", value: 0 }),
          score({ block: "Тон", kind: "PASS_FAIL", passed: true }),
          score({ block: "Тон", kind: "SCALE", value: null }),
          score({ block: "Пропуск", isNotApplicable: true, kind: "PASS_FAIL", passed: true })
        ]
      })
    ];

    const rows = blockRows(reviews);

    // "Решение": [100, 0] -> avg 50 (count 2). "Тон": [100] (count 1).
    // "Пропуск" skipped entirely (N/A) so it never appears.
    const byLabel = new Map(rows.map((row) => [row.label, row]));
    expect(byLabel.get("Решение")).toEqual({ label: "Решение", count: 2, averageScore: 50 });
    expect(byLabel.get("Тон")).toEqual({ label: "Тон", count: 1, averageScore: 100 });
    expect(byLabel.has("Пропуск")).toBe(false);
  });
});

describe("scoreDistributionRows", () => {
  it("buckets total scores with inclusive lower edge only on the first range", () => {
    const reviews = [
      review({ totalScore: 0 }),
      review({ totalScore: 50 }), // first range is inclusive of 50 (0..50)
      review({ totalScore: 51 }), // 51-70 bucket (>50)
      review({ totalScore: 70 }),
      review({ totalScore: 85 }),
      review({ totalScore: 86 }),
      review({ totalScore: 100 })
    ];

    const rows = scoreDistributionRows(reviews);

    expect(rows).toEqual([
      { label: "0-50", value: 2 }, // 0, 50
      { label: "51-70", value: 2 }, // 51, 70
      { label: "71-85", value: 1 }, // 85
      { label: "86-100", value: 2 } // 86, 100
    ]);
  });
});

describe("averageScoreFor", () => {
  it("averages the total score across reviews", () => {
    expect(averageScoreFor([review({ totalScore: 80 }), review({ totalScore: 100 })])).toBe(90);
    expect(averageScoreFor([])).toBeNull();
  });
});

// The exact inline reduction the dashboard used before extracting the helper.
// Kept here verbatim so the helper is proven byte-identical, not just plausible.
function legacyAgentLeaderboard(reviews: AgentLeaderboardReview[], limit = 5) {
  return Array.from(
    reviews
      .reduce((acc, review) => {
        const name = review.conversation.assigneeName ?? "Без оператора";
        const current = acc.get(name) ?? { name, total: 0, count: 0, riskCount: 0, appealCount: 0 };
        current.total += review.totalScore;
        current.count += 1;
        current.riskCount +=
          review.criticalError || review.findings.some((finding) => finding.riskLevel === "HIGH" || finding.riskLevel === "CRITICAL")
            ? 1
            : 0;
        current.appealCount += review.appealStatus === "open" ? 1 : 0;
        acc.set(name, current);
        return acc;
      }, new Map<string, { name: string; total: number; count: number; riskCount: number; appealCount: number }>())
      .values()
  )
    .map((row) => ({
      name: row.name,
      average: row.total / row.count,
      count: row.count,
      riskCount: row.riskCount,
      appealCount: row.appealCount
    }))
    .sort((left, right) => {
      const leftActionLoad = left.riskCount * 3 + left.appealCount * 2;
      const rightActionLoad = right.riskCount * 3 + right.appealCount * 2;

      return rightActionLoad - leftActionLoad || left.average - right.average || right.count - left.count;
    })
    .slice(0, limit);
}

function leaderboardReview(partial: Partial<AgentLeaderboardReview> & { totalScore: number; assigneeName: string | null }): AgentLeaderboardReview {
  return {
    totalScore: partial.totalScore,
    criticalError: partial.criticalError ?? false,
    appealStatus: partial.appealStatus ?? "none",
    conversation: { assigneeName: partial.assigneeName },
    findings: partial.findings ?? []
  };
}

describe("computeAgentLeaderboard", () => {
  const reviews: AgentLeaderboardReview[] = [
    leaderboardReview({ assigneeName: "Анна", totalScore: 90 }),
    leaderboardReview({ assigneeName: "Анна", totalScore: 80, criticalError: true }),
    leaderboardReview({ assigneeName: "Борис", totalScore: 70, findings: [{ riskLevel: "HIGH" }] }),
    leaderboardReview({ assigneeName: "Борис", totalScore: 60, appealStatus: "open" }),
    leaderboardReview({ assigneeName: "Виктор", totalScore: 95 }),
    leaderboardReview({ assigneeName: null, totalScore: 50, findings: [{ riskLevel: "CRITICAL" }] })
  ];

  it("aggregates average, count, risk and appeal per agent", () => {
    const rows = computeAgentLeaderboard(reviews);
    const byName = new Map(rows.map((row) => [row.name, row]));

    expect(byName.get("Анна")).toEqual({ name: "Анна", average: 85, count: 2, riskCount: 1, appealCount: 0 });
    expect(byName.get("Борис")).toEqual({ name: "Борис", average: 65, count: 2, riskCount: 1, appealCount: 1 });
    expect(byName.get("Виктор")).toEqual({ name: "Виктор", average: 95, count: 1, riskCount: 0, appealCount: 0 });
    expect(byName.get("Без оператора")).toEqual({ name: "Без оператора", average: 50, count: 1, riskCount: 1, appealCount: 0 });
  });

  it("orders by action load, then lowest average, then highest count", () => {
    const rows = computeAgentLeaderboard(reviews);

    // Борис: load 3+2=5; Без оператора and Анна: load 3 (tie -> lower avg first: 50 < 85);
    // Виктор: load 0 last.
    expect(rows.map((row) => row.name)).toEqual(["Борис", "Без оператора", "Анна", "Виктор"]);
  });

  it("caps the leaderboard to the requested limit", () => {
    expect(computeAgentLeaderboard(reviews, 2).map((row) => row.name)).toEqual(["Борис", "Без оператора"]);
  });

  it("breaks full ties deterministically by agent name (ru locale), regardless of input order", () => {
    // P9: operators with identical action load, average AND count previously
    // kept DB physical order, which flips across reseeds (Елена Морозова /
    // Тимофей Нестеров: load 3, average 75, count 2).
    const tied = (name: string): AgentLeaderboardReview[] => [
      leaderboardReview({ assigneeName: name, totalScore: 80, findings: [{ riskLevel: "HIGH" }] }),
      leaderboardReview({ assigneeName: name, totalScore: 70 })
    ];
    const expected = ["Елена Морозова", "Тимофей Нестеров"];

    const forward = computeAgentLeaderboard([...tied("Тимофей Нестеров"), ...tied("Елена Морозова")]);
    const reversed = computeAgentLeaderboard([...tied("Елена Морозова"), ...tied("Тимофей Нестеров")]);

    expect(forward.map((row) => row.name)).toEqual(expected);
    expect(reversed.map((row) => row.name)).toEqual(expected);
  });

  it("matches the legacy inline reduction exactly", () => {
    expect(computeAgentLeaderboard(reviews)).toEqual(legacyAgentLeaderboard(reviews));
    expect(computeAgentLeaderboard(reviews, 3)).toEqual(legacyAgentLeaderboard(reviews, 3));
    expect(computeAgentLeaderboard([])).toEqual(legacyAgentLeaderboard([]));
  });
});

describe("riskSegments", () => {
  it("maps the four risk buckets onto severity-tagged segments with drilldown hrefs", () => {
    const period = {
      preset: "last-30-days",
      start: new Date("2026-05-01T00:00:00.000Z"),
      end: new Date("2026-05-31T23:59:59.999Z")
    } as unknown as ReportPeriod;
    const groups = new Map<string, number>([
      ["Низкий", 4],
      ["Высокий", 2]
    ]);

    const segments = riskSegments(groups, period);

    expect(segments.map((segment) => ({ label: segment.label, value: segment.value, severity: segment.severity }))).toEqual([
      { label: "Низкий", value: 4, severity: "t1" },
      { label: "Средний", value: 0, severity: "t2" },
      { label: "Высокий", value: 2, severity: "t3" },
      { label: "Критический", value: 0, severity: "t4" }
    ]);
    expect(segments[2].href).toContain("riskLevel=HIGH");
  });
});

function reasonFinding(partial: Partial<ReasonFinding>): ReasonFinding {
  return {
    ownerType: partial.ownerType ?? "AGENT",
    category: partial.category ?? "Категория",
    rootCause: partial.rootCause ?? "Причина",
    riskLevel: partial.riskLevel ?? "LOW"
  };
}

describe("computeReasonTrends", () => {
  const current: ReasonFinding[] = [
    reasonFinding({ category: "Тон общения", ownerType: "AGENT", riskLevel: "HIGH" }),
    reasonFinding({ category: "Тон общения", ownerType: "AGENT", riskLevel: "LOW" }),
    reasonFinding({ category: "Тон общения", ownerType: "PROCESS", riskLevel: "CRITICAL" }),
    reasonFinding({ category: "Решение вопроса", ownerType: "PROCESS", riskLevel: "MEDIUM" }),
    reasonFinding({ category: "Скрипт", ownerType: "POLICY", riskLevel: "LOW" })
  ];
  const previous: ReasonFinding[] = [
    reasonFinding({ category: "Тон общения" }),
    reasonFinding({ category: "Решение вопроса" }),
    reasonFinding({ category: "Решение вопроса" })
  ];

  it("aggregates per reason category with counts, high-risk and dominant owner type", () => {
    const rows = computeReasonTrends(current, previous);
    const byCategory = new Map(rows.map((row) => [row.category, row]));

    expect(byCategory.get("Тон общения")).toMatchObject({
      category: "Тон общения",
      count: 3,
      previousCount: 1,
      delta: 2,
      highRiskCount: 2, // HIGH + CRITICAL
      topOwnerType: "AGENT" // 2 AGENT vs 1 PROCESS
    });
    expect(byCategory.get("Решение вопроса")).toMatchObject({
      category: "Решение вопроса",
      count: 1,
      previousCount: 2,
      delta: -1,
      highRiskCount: 0,
      topOwnerType: "PROCESS"
    });
  });

  it("ranks by current count desc, then category asc (ru), and caps to the limit", () => {
    const rows = computeReasonTrends(current, previous, 2);

    expect(rows.map((row) => row.category)).toEqual(["Тон общения", "Решение вопроса"]);
  });

  it("treats categories absent from the previous period as a null delta base", () => {
    const rows = computeReasonTrends(current, previous);
    const script = rows.find((row) => row.category === "Скрипт");

    expect(script?.previousCount).toBe(0);
    expect(script?.delta).toBe(1);
  });

  it("returns an empty list when there are no findings", () => {
    expect(computeReasonTrends([], [])).toEqual([]);
  });
});

function sentimentReview(partial: Partial<SentimentReview>): SentimentReview {
  return {
    sentiment: partial.sentiment ?? null,
    totalScore: partial.totalScore ?? 0
  };
}

describe("computeSentimentCorrelation", () => {
  it("buckets known sentiments in a fixed order with per-bucket average score", () => {
    const reviews: SentimentReview[] = [
      sentimentReview({ sentiment: "positive", totalScore: 90 }),
      sentimentReview({ sentiment: "positive", totalScore: 80 }),
      sentimentReview({ sentiment: "neutral", totalScore: 70 }),
      sentimentReview({ sentiment: "negative", totalScore: 50 }),
      sentimentReview({ sentiment: "negative", totalScore: 40 })
    ];

    const result = computeSentimentCorrelation(reviews);

    expect(result.rows.map((row) => row.key)).toEqual(["positive", "neutral", "negative"]);
    expect(result.rows).toEqual([
      { key: "positive", label: "Позитивная", count: 2, averageScore: 85 },
      { key: "neutral", label: "Нейтральная", count: 1, averageScore: 70 },
      { key: "negative", label: "Негативная", count: 2, averageScore: 45 }
    ]);
    expect(result.scoredCount).toBe(5);
    expect(result.unscoredCount).toBe(0);
    expect(result.totalCount).toBe(5);
  });

  it("counts null and unknown sentiment as unscored without dropping totals", () => {
    const reviews: SentimentReview[] = [
      sentimentReview({ sentiment: "positive", totalScore: 100 }),
      sentimentReview({ sentiment: null, totalScore: 60 }),
      sentimentReview({ sentiment: "UNKNOWN", totalScore: 30 })
    ];

    const result = computeSentimentCorrelation(reviews);
    const byKey = new Map(result.rows.map((row) => [row.key, row]));

    expect(byKey.get("positive")).toEqual({ key: "positive", label: "Позитивная", count: 1, averageScore: 100 });
    expect(byKey.get("neutral")).toEqual({ key: "neutral", label: "Нейтральная", count: 0, averageScore: null });
    expect(byKey.get("negative")).toEqual({ key: "negative", label: "Негативная", count: 0, averageScore: null });
    expect(result.scoredCount).toBe(1);
    expect(result.unscoredCount).toBe(2);
    expect(result.totalCount).toBe(3);
  });

  it("normalizes sentiment casing so POSITIVE and positive land in one bucket", () => {
    const result = computeSentimentCorrelation([
      sentimentReview({ sentiment: "POSITIVE", totalScore: 90 }),
      sentimentReview({ sentiment: "positive", totalScore: 70 })
    ]);

    expect(result.rows[0]).toEqual({ key: "positive", label: "Позитивная", count: 2, averageScore: 80 });
    expect(result.scoredCount).toBe(2);
    expect(result.unscoredCount).toBe(0);
  });

  it("reports all sentiment as unscored when nothing has been scored yet", () => {
    const result = computeSentimentCorrelation([
      sentimentReview({ sentiment: null, totalScore: 80 }),
      sentimentReview({ sentiment: null, totalScore: 60 })
    ]);

    expect(result.scoredCount).toBe(0);
    expect(result.unscoredCount).toBe(2);
    expect(result.totalCount).toBe(2);
    expect(result.rows.every((row) => row.count === 0 && row.averageScore === null)).toBe(true);
  });
});
