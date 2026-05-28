import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    auth: vi.fn(),
    handlers: {
      GET: vi.fn(),
      POST: vi.fn()
    },
    signIn: vi.fn(),
    signOut: vi.fn()
  }))
}));

describe("Auth.js runtime wiring", () => {
  it("exports Auth.js handlers and helpers from the root auth module", async () => {
    const runtime = await import("../../auth");

    expect(runtime.auth).toEqual(expect.any(Function));
    expect(runtime.signIn).toEqual(expect.any(Function));
    expect(runtime.signOut).toEqual(expect.any(Function));
    expect(runtime.handlers.GET).toEqual(expect.any(Function));
    expect(runtime.handlers.POST).toEqual(expect.any(Function));
  });

  it("exposes the App Router Auth.js route handlers", async () => {
    const route = await import("@/app/api/auth/[...nextauth]/route");

    expect(route.GET).toEqual(expect.any(Function));
    expect(route.POST).toEqual(expect.any(Function));
  });
});
