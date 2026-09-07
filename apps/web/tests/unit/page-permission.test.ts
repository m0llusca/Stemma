import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedMessage } from "@/lib/api/user-facing-errors";
import { PermissionDeniedError } from "@/lib/auth/permissions";

const mocks = vi.hoisted(() => ({
  forbidden: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;403");
  }),
  requireCurrentUserPermission: vi.fn()
}));

vi.mock("next/navigation", () => ({
  forbidden: mocks.forbidden
}));

vi.mock("@/lib/current-user", () => ({
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

describe("requirePagePermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the user when the permission is granted", async () => {
    const user = { id: "admin-1", role: "ADMIN" };
    mocks.requireCurrentUserPermission.mockResolvedValue(user);
    const { requirePagePermission } = await import("@/lib/page-permission");

    await expect(requirePagePermission("users:manage")).resolves.toEqual(user);
    expect(mocks.forbidden).not.toHaveBeenCalled();
  });

  it("maps PermissionDeniedError to the Next.js forbidden interrupt", async () => {
    mocks.requireCurrentUserPermission.mockRejectedValue(new PermissionDeniedError());
    const { requirePagePermission } = await import("@/lib/page-permission");

    await expect(requirePagePermission("users:manage")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;403");
    expect(mocks.forbidden).toHaveBeenCalledOnce();
  });

  it("maps the Russian permission-denied message to forbidden", async () => {
    mocks.requireCurrentUserPermission.mockRejectedValue(new Error(permissionDeniedMessage));
    const { requirePagePermission } = await import("@/lib/page-permission");

    await expect(requirePagePermission("scorecards:manage")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;403");
    expect(mocks.forbidden).toHaveBeenCalledOnce();
  });

  it("does not treat unrelated failures as forbidden", async () => {
    mocks.requireCurrentUserPermission.mockRejectedValue(new Error("database password leaked"));
    const { requirePagePermission } = await import("@/lib/page-permission");

    await expect(requirePagePermission("users:manage")).rejects.toThrow("database password leaked");
    expect(mocks.forbidden).not.toHaveBeenCalled();
  });
});

describe("denyPageAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes the Next.js forbidden interrupt", async () => {
    const { denyPageAccess } = await import("@/lib/page-permission");

    expect(() => denyPageAccess()).toThrow("NEXT_HTTP_ERROR_FALLBACK;403");
    expect(mocks.forbidden).toHaveBeenCalledOnce();
  });
});
