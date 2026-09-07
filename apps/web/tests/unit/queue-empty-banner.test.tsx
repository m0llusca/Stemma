import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueueEmptyBanner } from "@/components/review/queue-empty-banner";
import {
  QUEUE_EMPTY_BANNER_FILTERED,
  QUEUE_EMPTY_BANNER_GLOBAL,
  QUEUE_EMPTY_RESET_FILTERS_LABEL,
  QUEUE_EMPTY_TAKE_UNFILTERED_LABEL
} from "@/lib/review/queue-empty-copy";

vi.mock("@/lib/queue-view-actions", () => ({
  takeNextReview: vi.fn()
}));

describe("QueueEmptyBanner", () => {
  beforeEach(() => {
    window.history.replaceState(window.history.state, "", "/reviews?empty=1");
  });

  it("uses global empty copy without recovery CTAs when the queue has no chips", () => {
    render(<QueueEmptyBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(QUEUE_EMPTY_BANNER_GLOBAL);
    expect(screen.queryByRole("button", { name: QUEUE_EMPTY_RESET_FILTERS_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: QUEUE_EMPTY_TAKE_UNFILTERED_LABEL })).not.toBeInTheDocument();
  });

  it("scopes copy and offers reset / unfiltered take-next when filters emptied the view", () => {
    window.history.replaceState(window.history.state, "", "/reviews?due=overdue&empty=1");
    render(
      <QueueEmptyBanner
        hasActiveFilters
        resetHref="/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue"
        canWriteReviews
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(QUEUE_EMPTY_BANNER_FILTERED);
    expect(screen.getByRole("button", { name: QUEUE_EMPTY_RESET_FILTERS_LABEL }).closest("a")).toHaveAttribute(
      "href",
      "/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue"
    );
    expect(screen.getByRole("button", { name: QUEUE_EMPTY_TAKE_UNFILTERED_LABEL })).toBeInTheDocument();
    expect(screen.queryByText(QUEUE_EMPTY_BANNER_GLOBAL)).not.toBeInTheDocument();
  });

  it("hides unfiltered take-next when the viewer cannot write reviews", () => {
    render(<QueueEmptyBanner hasActiveFilters canWriteReviews={false} />);

    expect(screen.getByRole("button", { name: QUEUE_EMPTY_RESET_FILTERS_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: QUEUE_EMPTY_TAKE_UNFILTERED_LABEL })).not.toBeInTheDocument();
  });

  it("dismisses and strips empty from the URL", () => {
    render(<QueueEmptyBanner hasActiveFilters />);

    fireEvent.click(screen.getByRole("button", { name: "Скрыть уведомление" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.has("empty")).toBe(false);
  });

  it("gives the dismiss control a 44px hit target instead of icon-xs", () => {
    render(<QueueEmptyBanner />);

    const dismiss = screen.getByRole("button", { name: "Скрыть уведомление" });
    expect(dismiss.className).toContain("size-11");
    expect(dismiss.className).not.toMatch(/size-\[var\(--control-height-xs\)\]/);
  });
});
