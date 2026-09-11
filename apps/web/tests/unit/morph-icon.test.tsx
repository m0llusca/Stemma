import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Check, Copy } from "lucide-react";
import { MorphIcon } from "@/components/ui/morph-icon";

describe("MorphIcon", () => {
  it("renders an svg and honors the reduced-motion user policy", () => {
    const { container, rerender } = render(<MorphIcon icon={Copy} data-icon="inline-start" />);
    const svg = container.querySelector('[data-slot="morph-icon"]');
    expect(svg).not.toBeNull();
    expect(svg?.tagName.toLowerCase()).toBe("svg");
    expect(svg).toHaveAttribute("data-icon", "inline-start");
    expect(svg).toHaveAttribute("aria-hidden", "true");

    rerender(<MorphIcon icon={Check} data-icon="inline-start" />);
    expect(container.querySelector('[data-slot="morph-icon"]')).not.toBeNull();
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
