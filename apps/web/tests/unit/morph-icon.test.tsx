import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Check, Copy } from "lucide-react";
import { MorphIcon } from "@/components/ui/morph-icon";

describe("MorphIcon", () => {
  it("swaps the path when the lucide-react icon changes", () => {
    const { container, rerender } = render(
      <MorphIcon icon={Copy} data-icon="inline-start" reducedMotion="always" />
    );
    const svg = container.querySelector('[data-slot="morph-icon"]');
    expect(svg).not.toBeNull();
    expect(svg?.tagName.toLowerCase()).toBe("svg");
    expect(svg).toHaveAttribute("data-icon", "inline-start");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    const firstD = svg?.querySelector("path")?.getAttribute("d");

    rerender(<MorphIcon icon={Check} data-icon="inline-start" reducedMotion="always" />);
    const after = container.querySelector('[data-slot="morph-icon"]');
    const nextD = after?.querySelector("path")?.getAttribute("d");
    expect(firstD).toBeTruthy();
    expect(nextD).toBeTruthy();
    expect(nextD).not.toBe(firstD);
  });

  it("instant-swaps when the OS asks for reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })
    );
    const { container, rerender } = render(<MorphIcon icon={Copy} />);
    expect(container.querySelector('[data-slot="morph-icon"]')).not.toBeNull();
    rerender(<MorphIcon icon={Check} />);
    expect(container.querySelector('[data-slot="morph-icon"]')).not.toBeNull();
    vi.unstubAllGlobals();
  });
});
