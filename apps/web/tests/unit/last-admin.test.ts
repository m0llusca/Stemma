import { describe, expect, it, vi } from "vitest";
import {
  LAST_ADMIN_DEMOTION_ERROR,
  assertCanDemoteAdminRole,
  isLastWorkspaceAdmin,
  roleAfterLastAdminGuard
} from "@/lib/auth/last-admin";

function clientWithAdminCount(count: number) {
  return {
    user: {
      count: vi.fn().mockResolvedValue(count)
    }
  };
}

describe("last-admin guard", () => {
  it("detects the sole remaining workspace admin", async () => {
    const client = clientWithAdminCount(1);
    await expect(isLastWorkspaceAdmin(client, "workspace-1")).resolves.toBe(true);
    expect(client.user.count).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1", role: "ADMIN" }
    });
  });

  it("allows demotion when another admin remains", async () => {
    const client = clientWithAdminCount(2);
    await expect(assertCanDemoteAdminRole(client, "workspace-1", "ADMIN", "QA_ANALYST")).resolves.toBeUndefined();
    await expect(roleAfterLastAdminGuard(client, "workspace-1", "ADMIN", "QA_ANALYST")).resolves.toBe("QA_ANALYST");
  });

  it("throws for explicit demotion of the last admin", async () => {
    const client = clientWithAdminCount(1);
    await expect(assertCanDemoteAdminRole(client, "workspace-1", "ADMIN", "VIEWER")).rejects.toThrow(
      LAST_ADMIN_DEMOTION_ERROR
    );
  });

  it("preserves ADMIN during IdP sync when demotion would remove the last admin", async () => {
    const client = clientWithAdminCount(1);
    await expect(roleAfterLastAdminGuard(client, "workspace-1", "ADMIN", "SUPPORT_AGENT")).resolves.toBe("ADMIN");
  });

  it("does not count when the role is not an admin demotion", async () => {
    const client = clientWithAdminCount(1);
    await expect(assertCanDemoteAdminRole(client, "workspace-1", "ADMIN", "ADMIN")).resolves.toBeUndefined();
    await expect(roleAfterLastAdminGuard(client, "workspace-1", "QA_ANALYST", "VIEWER")).resolves.toBe("VIEWER");
    expect(client.user.count).not.toHaveBeenCalled();
  });
});
