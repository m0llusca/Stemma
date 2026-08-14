import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Message, Scorecard, ScorecardCriterion } from "@prisma/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ReviewPanel } from "@/components/review/review-panel";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light", setTheme: vi.fn() })
}));

vi.mock("@/lib/review-panel-actions", () => ({
  submitReviewState: vi.fn(async () => null)
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
});

const scorecard: Scorecard & { criteria: ScorecardCriterion[] } = {
  id: "scorecard-1",
  workspaceId: "workspace-1",
  name: "Основная форма",
  version: 1,
  isActive: true,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  criteria: [
    {
      id: "criterion-1",
      scorecardId: "scorecard-1",
      key: "resolution",
      label: "Решение",
      block: "Результат",
      kind: "PASS_FAIL",
      weight: 100,
      required: true,
      order: 1
    }
  ]
};

const scaleScorecard: Scorecard & { criteria: ScorecardCriterion[] } = {
  ...scorecard,
  criteria: [
    {
      ...scorecard.criteria[0],
      id: "criterion-scale",
      key: "tone",
      label: "Тон",
      kind: "SCALE_1_3"
    }
  ]
};

const messages: Message[] = [
  {
    id: "message-1",
    conversationId: "conversation-1",
    externalId: "external-message-1",
    participantType: "HUMAN_AGENT",
    authorName: "Оператор",
    body: "Предложил клиенту корректный вариант решения.",
    sentAt: new Date("2026-07-01T10:00:00.000Z"),
    isPrivate: false,
    createdAt: new Date("2026-07-01T10:00:00.000Z")
  }
];

const nativeFields = [
  { label: "Категория", name: "category", value: "" },
  { label: "Ответственность", name: "ownerType", value: "AGENT" },
  { label: "Риск", name: "riskLevel", value: "LOW" },
  { label: "Итог проверки", name: "summary", value: "" },
  {
    label: "Сообщение-доказательство",
    name: "criterion.criterion-1.evidenceMessageId",
    value: ""
  },
  { label: "Комментарий", name: "criterion.criterion-1.comment", value: "" },
  { label: "Тип критической ошибки", name: "criticalCategory", value: "" },
  { label: "Комментарий для обратной связи", name: "feedbackComment", value: "" },
  { label: "Положительные моменты", name: "positiveNotes", value: "" },
  { label: "Ссылки на инструкции и материалы", name: "instructionLinks", value: "" },
  { label: "Корневая причина", name: "rootCause", value: "" },
  { label: "Краткое доказательство", name: "evidenceSummary", value: "" },
  { label: "Действие для разбора", name: "coachingAction", value: "" },
  { label: "Ответственный за разбор", name: "coachingAssignee", value: "" },
  { label: "Срок", name: "coachingDueAt", value: "" },
  { label: "Заметки для калибровки", name: "calibrationNotes", value: "" }
] as const;

describe("ReviewPanel field labels", () => {
  it("names the pass/fail result group without changing its submitted default", () => {
    render(
      <ToastProvider>
        <ReviewPanel
          conversationId="conversation-1"
          messages={messages}
          scorecard={scorecard}
        />
      </ToastProvider>
    );

    const resultGroup = screen.getByRole("radiogroup", { name: "Результат" });
    const selectedResult = screen.getByRole("radio", { name: /Зачет/ });
    const form = resultGroup.closest("form");

    expect(selectedResult).toBeChecked();
    expect(form).not.toBeNull();
    expect(
      new FormData(form as HTMLFormElement).get("criterion.criterion-1.passed")
    ).toBe("true");
  });

  it("names the scale score group without changing its submitted default", () => {
    render(
      <ToastProvider>
        <ReviewPanel
          conversationId="conversation-1"
          messages={messages}
          scorecard={scaleScorecard}
        />
      </ToastProvider>
    );

    const scoreGroup = screen.getByRole("radiogroup", { name: "Оценка" });
    const selectedScore = screen.getByRole("radio", { name: /3 · стандарт/ });
    const form = scoreGroup.closest("form");

    expect(selectedScore).toBeChecked();
    expect(form).not.toBeNull();
    expect(
      new FormData(form as HTMLFormElement).get("criterion.criterion-scale.score")
    ).toBe("3");
  });

  it("associates every visible native field label without changing submitted values", () => {
    render(
      <ToastProvider>
        <ReviewPanel
          conversationId="conversation-1"
          messages={messages}
          scorecard={scorecard}
        />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /Дополнительно/ }));
    fireEvent.click(screen.getByRole("button", { name: /Критическая ошибка и переответ/ }));
    fireEvent.click(screen.getByRole("button", { name: /Обратная связь/ }));
    fireEvent.click(screen.getByRole("button", { name: /Разбор и калибровка/ }));

    for (const field of nativeFields) {
      const control = screen.getByLabelText(field.label);
      const label = screen.getByText(field.label, { selector: "label" });

      expect(control).toHaveAttribute("name", field.name);
      expect(control).toHaveValue(field.value);
      expect(control.id).not.toBe("");
      expect(label).toHaveAttribute("for", control.id);
    }
  });
});
