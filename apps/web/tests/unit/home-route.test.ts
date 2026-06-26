import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

describe("home route", () => {
  it("opens the login entry point by default", async () => {
    const { default: HomePage } = await import("@/app/page");

    expect(() => HomePage()).toThrow("NEXT_REDIRECT:/auth/login");
    expect(redirectMock).toHaveBeenCalledWith("/auth/login");
  });
});
