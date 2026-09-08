import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headerGet: vi.fn(),
  headers: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers
}));

describe("request path auth gate", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.headerGet.mockReset();
    mocks.headers.mockResolvedValue({ get: mocks.headerGet });
  });

  it("recognizes /auth/login from the proxy pathname header", async () => {
    mocks.headerGet.mockReturnValue("/auth/login");
    const { isAuthEntryRequest, getRequestPathname } = await import("@/lib/auth/request-path");

    await expect(getRequestPathname()).resolves.toBe("/auth/login");
    await expect(isAuthEntryRequest()).resolves.toBe(true);
    expect(mocks.headerGet).toHaveBeenCalledWith("x-stemma-pathname");
  });

  it("keeps product routes outside the auth-entry gate", async () => {
    mocks.headerGet.mockReturnValue("/dashboard");
    const { isAuthEntryRequest } = await import("@/lib/auth/request-path");

    await expect(isAuthEntryRequest()).resolves.toBe(false);
  });

  it("fails closed when the pathname header is missing", async () => {
    mocks.headerGet.mockReturnValue(undefined);
    const { isAuthEntryRequest, getRequestPathname } = await import("@/lib/auth/request-path");

    await expect(getRequestPathname()).resolves.toBeNull();
    await expect(isAuthEntryRequest()).resolves.toBe(false);
  });
});
