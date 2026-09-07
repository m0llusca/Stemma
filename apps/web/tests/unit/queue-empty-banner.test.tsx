import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueueEmptyBanner } from "@/components/review/queue-empty-banner";

describe("QueueEmptyBanner", () => {
  it("gives the dismiss control a 44px hit target instead of icon-xs", () => {
    window.history.replaceState(null, "", "/reviews?empty=1");
    render(<QueueEmptyBanner />);

    const dismiss = screen.getByRole("button", { name: "Скрыть уведомление" });
    expect(dismiss.className).toContain("size-11");
    expect(dismiss.className).not.toMatch(/size-\[var\(--control-height-xs\)\]/);
  });
});
