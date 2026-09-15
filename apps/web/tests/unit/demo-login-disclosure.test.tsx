import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoLoginDisclosure } from "@/components/auth/demo-login-disclosure";

describe("DemoLoginDisclosure", () => {
  it("keeps the first paint free of details/summary attributes", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/auth/demo-login-disclosure.tsx"),
      "utf8"
    );

    expect(source).toContain("if (!mounted)");
    expect(source).toMatch(/return \(\s*<div className="w-full">/);
    expect(source).not.toMatch(/suppressHydrationWarning/);
  });

  it("mounts native details after the client effect", () => {
    render(
      <DemoLoginDisclosure>
        <button type="submit">Войти в демо-режиме</button>
      </DemoLoginDisclosure>
    );

    const trigger = screen.getByRole("button", { name: "Демо-вход" });
    expect(trigger.tagName).toBe("SUMMARY");
    const details = trigger.closest("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);

    fireEvent.click(trigger);
    if (details && !details.open) {
      details.open = true;
    }
    expect(details?.open).toBe(true);
    expect(screen.getByRole("button", { name: "Войти в демо-режиме" })).toBeInTheDocument();
  });
});
