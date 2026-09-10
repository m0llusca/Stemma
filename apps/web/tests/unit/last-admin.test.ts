import { describe, expect, it, vi } from "vitest";
import {
  LAST_ADMIN_DEACTIVATION_ERROR,
  LAST_ADMIN_DEMOTION_ERROR,
  assertCanDeactivateLastAdmin,
  assertCanDemoteAdminRole,
  isLastWorkspaceAdmin,
  lifecycleStatusAfterLastAdminGuard,
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
  it("detects the sole remaining ACTIVE workspace admin", async () => {
    const client = clientWithAdminCount(1);
    await expect(isLastWorkspaceAdmin(client, "workspace-1")).resolves.toBe(true);
    expect(client.user.count).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1", role: "ADMIN", lifecycleStatus: "ACTIVE" }
    });
  });

  it("allows demotion when another active admin remains", async () => {
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

  it("throws for explicit deactivation of the last admin", async () => {
    const client = clientWithAdminCount(1);
    await expect(
      assertCanDeactivateLastAdmin(client, "workspace-1", "ADMIN", "DEPROVISIONED")
    ).rejects.toThrow(LAST_ADMIN_DEACTIVATION_ERROR);
    await expect(assertCanDeactivateLastAdmin(client, "workspace-1", "ADMIN", "SUSPENDED")).rejects.toThrow(
      LAST_ADMIN_DEACTIVATION_ERROR
    );
  });

  it("preserves ACTIVE during IdP sync when deactivation would remove the last admin", async () => {
    const client = clientWithAdminCount(1);
    await expect(
      lifecycleStatusAfterLastAdminGuard(client, "workspace-1", "ADMIN", "DEPROVISIONED")
    ).resolves.toBe("ACTIVE");
    await expect(
      lifecycleStatusAfterLastAdminGuard(client, "workspace-1", "ADMIN", "SUSPENDED")
    ).resolves.toBe("ACTIVE");
  });

  it("allows deactivation when another active admin remains", async () => {
    const client = clientWithAdminCount(2);
    await expect(
      assertCanDeactivateLastAdmin(client, "workspace-1", "ADMIN", "SUSPENDED")
    ).resolves.toBeUndefined();
    await expect(
      lifecycleStatusAfterLastAdminGuard(client, "workspace-1", "ADMIN", "DEPROVISIONED")
    ).resolves.toBe("DEPROVISIONED");
  });

  it("does not count when the role is not an admin demotion or deactivation", async () => {
    const client = clientWithAdminCount(1);
    await expect(assertCanDemoteAdminRole(client, "workspace-1", "ADMIN", "ADMIN")).resolves.toBeUndefined();
    await expect(roleAfterLastAdminGuard(client, "workspace-1", "QA_ANALYST", "VIEWER")).resolves.toBe("VIEWER");
    await expect(
      assertCanDeactivateLastAdmin(client, "workspace-1", "ADMIN", "ACTIVE")
    ).resolves.toBeUndefined();
    await expect(
      lifecycleStatusAfterLastAdminGuard(client, "workspace-1", "SUPPORT_AGENT", "SUSPENDED")
    ).resolves.toBe("SUSPENDED");
    expect(client.user.count).not.toHaveBeenCalled();
  });
});
