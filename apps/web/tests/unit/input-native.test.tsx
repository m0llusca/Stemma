import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "@/components/ui/input";

describe("Input", () => {
  it("is a native input, not Base UI Field.Control", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/ui/input.tsx"), "utf8");
    expect(source).not.toMatch(/from ["']@base-ui\/react\/input["']/);
    expect(source).toMatch(/<input/);
  });

  it("does not stamp field validity attributes on an empty control", () => {
    const { container } = render(<Input id="login" name="login" autoComplete="username" />);
    const input = container.querySelector("input");

    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("data-slot", "input");
    expect(input).toHaveAttribute("id", "login");
    expect(input?.getAttribute("aria-labelledby")).toBeNull();
    expect(input?.getAttribute("data-valid")).toBeNull();
    expect(input?.getAttribute("data-invalid")).toBeNull();
    expect(input?.getAttribute("data-filled")).toBeNull();
  });
});
