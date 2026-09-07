import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AgentCriterionFeedbackList } from "@/components/feedback/agent-criterion-feedback-list";
import { ToastProvider } from "@/components/ui/toast";
import { AGENT_QUOTE_UNAVAILABLE, type AgentCriterionFeedbackItem } from "@/lib/feedback/agent-criterion-feedback";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light", setTheme: vi.fn() })
}));

vi.mock("@/lib/feedback-actions", () => ({
  updateReviewFeedbackState: vi.fn()
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

const item: AgentCriterionFeedbackItem = {
  id: "score-1",
  label: "Эмпатия",
  resultLabel: "не зачтено",
  isCriticalFail: true,
  impactPoints: -12,
  impactLabel: "-12 баллов",
  howToImprove: "Сначала подтвердите статус.",
  howToFixSteps: [
    { text: "Сначала подтвердите статус.", href: null },
    { text: "Откройте учебную задачу «Разбор эмпатии» и разберите этот критерий.", href: "/coaching" }
  ],
  evidenceQuote: "Клиент ждал ответа два дня без статуса.",
  evidenceMessageId: "msg-1",
  hasQuote: true,
  hasHowToFix: true
};

const missingQuote: AgentCriterionFeedbackItem = {
  ...item,
  id: "score-2",
  label: "Точность",
  evidenceQuote: null,
  evidenceMessageId: null,
  hasQuote: false,
  howToFixSteps: [{ text: "Сверьте ответ с критерием «Точность» и правилами команды.", href: null }]
};

function renderList(
  items: AgentCriterionFeedbackItem[],
  appeal?: Parameters<typeof AgentCriterionFeedbackList>[0]["appeal"],
  dense = false
) {
  return render(
    <ToastProvider>
      <AgentCriterionFeedbackList
        items={items}
        conversationId="conversation-1"
        dense={dense}
        appeal={appeal}
      />
    </ToastProvider>
  );
}

describe("AgentCriterionFeedbackList", () => {
  it("shows quote, impact, how-to-fix and appeal in that order", () => {
    renderList([item], {
      reviewId: "review-1",
      allowed: true,
      disabledReason: null,
      phase: "none"
    });

    const card = screen.getByRole("list", { name: "Снижения по критериям" });
    const headings = within(card)
      .getAllByRole("heading")
      .map((heading) => heading.textContent);

    expect(headings).toEqual(["Цитата", "Снятие", "Как исправить", "Апелляция"]);
    expect(card.textContent).toContain("Клиент ждал ответа два дня без статуса.");
    expect(card.textContent).toContain("-12 баллов");
    expect(card.textContent).toContain("Сначала подтвердите статус.");
    expect(screen.getByRole("link", { name: "Откройте учебную задачу «Разбор эмпатии» и разберите этот критерий." })).toHaveAttribute(
      "href",
      "/coaching"
    );
    expect(screen.getByText("Апелляция", { selector: "h3" })).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/FAIL|вы провалили|лидерборд/i);
  });

  it("says цитата недоступна instead of inventing evidence", () => {
    renderList([missingQuote], {
      reviewId: "review-1",
      allowed: true,
      disabledReason: null,
      phase: "none"
    });

    expect(screen.getByText(`«${AGENT_QUOTE_UNAVAILABLE}»`)).toBeInTheDocument();
    expect(screen.queryByText("Клиент ждал ответа два дня без статуса.")).not.toBeInTheDocument();
  });

  it("keeps criterion, impact and quote/fix existence on the collapsed header", () => {
    renderList([item], undefined, true);

    const trigger = screen.getByRole("button");
    expect(trigger).toHaveTextContent("Эмпатия");
    expect(trigger).toHaveTextContent("-12 баллов");
    expect(trigger).toHaveTextContent("есть цитата");
    expect(trigger).toHaveTextContent("есть как исправить");
    expect(trigger).toHaveTextContent("не зачтено");
    expect(screen.queryByRole("heading", { name: "Цитата" })).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole("heading", { name: "Цитата" })).toBeVisible();
  });

  it("shows a disabled appeal CTA with the reason when appeal is not allowed", () => {
    renderList([item], {
      reviewId: "review-1",
      allowed: false,
      disabledReason: "Оценка уже принята — апелляцию открыть нельзя.",
      phase: "none"
    });

    expect(screen.getByRole("button", { name: "Апелляция" })).toBeDisabled();
    expect(screen.getByText("Оценка уже принята — апелляцию открыть нельзя.")).toBeInTheDocument();
  });
});
