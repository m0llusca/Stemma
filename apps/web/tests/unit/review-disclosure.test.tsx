import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  resetReviewDisclosureMemory,
  ReviewDisclosure
} from "@/components/review/review-disclosure";
import { CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function Disclosure({ memoryKey, defaultOpen }: { memoryKey: string; defaultOpen: boolean }) {
  return (
    <ReviewDisclosure memoryKey={memoryKey} defaultOpen={defaultOpen}>
      <CollapsibleTrigger>Точность ответа</CollapsibleTrigger>
      <CollapsibleContent>панель</CollapsibleContent>
    </ReviewDisclosure>
  );
}

describe("ReviewDisclosure remount memory", () => {
  beforeEach(() => {
    resetReviewDisclosureMemory();
  });

  it("keeps a collapsed module collapsed after remount with defaultOpen true", () => {
    const { unmount } = render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    const trigger = screen.getByRole("button", { name: "Точность ответа" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    unmount();
    render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    expect(screen.getByRole("button", { name: "Точность ответа" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("keeps an expanded module expanded after remount with defaultOpen false", () => {
    const { unmount } = render(<Disclosure memoryKey="ticket:step:1" defaultOpen={false} />);

    const trigger = screen.getByRole("button", { name: "Точность ответа" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    unmount();
    render(<Disclosure memoryKey="ticket:step:1" defaultOpen={false} />);

    expect(screen.getByRole("button", { name: "Точность ответа" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
});
