import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    prefetch,
    ...props
  }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a
      {...props}
      data-next-prefetch={
        prefetch === undefined ? undefined : String(prefetch)
      }
    />
  )
}));

import { PageShell } from "@/components/ui/page-shell";

describe("PageShell tab prefetch policy", () => {
  it("passes an explicit per-tab prefetch policy without changing other tabs", () => {
    render(
      <PageShell
        title="Аналитика"
        tabs={[
          {
            label: "Обзор",
            href: "/reports?view=overview",
            prefetch: false
          },
          {
            label: "Проверки",
            href: "/reviews"
          }
        ]}
      />
    );

    expect(screen.getByRole("link", { name: "Обзор" })).toHaveAttribute(
      "data-next-prefetch",
      "false"
    );
    expect(
      screen.getByRole("link", { name: "Проверки" })
    ).not.toHaveAttribute("data-next-prefetch");
  });
});
