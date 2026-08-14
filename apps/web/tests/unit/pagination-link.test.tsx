import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaginationLink, PaginationNext } from "@/components/ui/pagination";

describe("PaginationLink", () => {
  it("renders a real anchor with a stable data-slot (no Button data-slot mismatch)", () => {
    const { container } = render(
      <PaginationLink href="/reviews?page=2" isActive={false}>
        2
      </PaginationLink>
    );

    const link = container.querySelector("a[href='/reviews?page=2']");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("data-slot")).toBe("pagination-link");
    // Must not emit data-slot=button (that caused SSR/client hydration mismatch).
    expect(link?.getAttribute("data-slot")).not.toBe("button");
    expect(container.querySelector("[data-slot='button']")).toBeNull();
  });

  it("marks the active page for a11y", () => {
    const { container } = render(
      <PaginationLink href="/reviews?page=1" isActive>
        1
      </PaginationLink>
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("aria-current")).toBe("page");
    expect(link?.hasAttribute("data-active")).toBe(true);
  });

  it("PaginationNext stays an anchor for full page navigation", () => {
    const { container } = render(<PaginationNext href="/reviews?page=2" text="Дальше" />);
    const link = container.querySelector("a[rel], a[href='/reviews?page=2'], a");
    expect(link?.tagName).toBe("A");
    expect(link?.getAttribute("data-slot")).toBe("pagination-link");
  });
});
