import { describe, expect, it, vi } from "vitest";
import {
  LAST_ADMIN_DEACTIVATION_ERROR,
  LAST_ADMIN_DEMOTION_ERROR,
  assertCanDeactivateLastAdmin,
  assertCanDemoteAdminRole,
  isLastWorkspaceAdmin,
  lifecycleStatusAfterLastAdminGuard,
  lockActiveAdminsForUpdate,
  readUserRoleLifecycleForLastAdminGuard,
  roleAfterLastAdminGuard
} from "@/lib/auth/last-admin";
import type { RoleName, UserLifecycleStatus } from "@prisma/client";

function clientWithAdminCount(
  count: number,
  user?: { role: RoleName; lifecycleStatus: UserLifecycleStatus } | null
) {
  return {
    user: {
      count: vi.fn().mockResolvedValue(count),
      findFirst: vi
        .fn()
        .mockResolvedValue(
          user === undefined ? { role: "ADMIN" as const, lifecycleStatus: "ACTIVE" as const } : user
        )
    }
  };
}

function clientWithLockedAdmins(
  ids: string[],
  userRow?: { role: RoleName; lifecycleStatus: UserLifecycleStatus } | null
) {
  const queryRaw = vi.fn(async (query: { text?: string; sql?: string; strings?: string[] }) => {
    const sqlText = query?.text ?? query?.sql ?? (query?.strings ?? []).join("?");
    // User-row re-read selects role/lifecycleStatus; admin lock selects id + ORDER BY.
    if (/SELECT\s+role/i.test(sqlText)) {
      return userRow === undefined
        ? [{ role: "ADMIN" as const, lifecycleStatus: "ACTIVE" as const }]
        : userRow
          ? [userRow]
          : [];
    }
    return ids.map((id) => ({ id }));
  });

  return {
    user: {
      count: vi.fn(),
      findFirst: vi.fn()
    },
    $queryRaw: queryRaw
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

  it("locks ACTIVE ADMIN rows with FOR UPDATE when $queryRaw is available", async () => {
    const client = clientWithLockedAdmins(["admin-1", "admin-2"]);
    await expect(lockActiveAdminsForUpdate(client, "workspace-1")).resolves.toBe(2);
    await expect(isLastWorkspaceAdmin(client, "workspace-1")).resolves.toBe(false);
    expect(client.$queryRaw).toHaveBeenCalled();
    expect(client.user.count).not.toHaveBeenCalled();
    const raw = client.$queryRaw.mock.calls[0]?.[0] as { text?: string; sql?: string; strings?: string[] };
    const sqlText = raw?.text ?? raw?.sql ?? (raw?.strings ?? []).join("?");
    expect(sqlText).toContain("FOR UPDATE");
    expect(sqlText).toContain('"User"');
  });

  it("uses locked count for demotion guards inside a transaction client", async () => {
    const lastAdmin = clientWithLockedAdmins(["admin-1"]);
    await expect(assertCanDemoteAdminRole(lastAdmin, "workspace-1", "ADMIN", "VIEWER")).rejects.toThrow(
      LAST_ADMIN_DEMOTION_ERROR
    );
    await expect(roleAfterLastAdminGuard(lastAdmin, "workspace-1", "user-1", "SUPPORT_AGENT")).resolves.toBe("ADMIN");

    const twoAdmins = clientWithLockedAdmins(["admin-1", "admin-2"]);
    await expect(assertCanDemoteAdminRole(twoAdmins, "workspace-1", "ADMIN", "QA_ANALYST")).resolves.toBeUndefined();
    await expect(roleAfterLastAdminGuard(twoAdmins, "workspace-1", "user-1", "QA_ANALYST")).resolves.toBe("QA_ANALYST");
  });

  it("allows demotion when another active admin remains", async () => {
    const client = clientWithAdminCount(2);
    await expect(assertCanDemoteAdminRole(client, "workspace-1", "ADMIN", "QA_ANALYST")).resolves.toBeUndefined();
    await expect(roleAfterLastAdminGuard(client, "workspace-1", "user-1", "QA_ANALYST")).resolves.toBe("QA_ANALYST");
  });

  it("throws for explicit demotion of the last admin", async () => {
    const client = clientWithAdminCount(1);
    await expect(assertCanDemoteAdminRole(client, "workspace-1", "ADMIN", "VIEWER")).rejects.toThrow(
      LAST_ADMIN_DEMOTION_ERROR
    );
  });

  it("preserves ADMIN during IdP sync when demotion would remove the last admin", async () => {
    const client = clientWithAdminCount(1);
    await expect(roleAfterLastAdminGuard(client, "workspace-1", "user-1", "SUPPORT_AGENT")).resolves.toBe("ADMIN");
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
      lifecycleStatusAfterLastAdminGuard(client, "workspace-1", "user-1", "DEPROVISIONED")
    ).resolves.toBe("ACTIVE");
    await expect(
      lifecycleStatusAfterLastAdminGuard(client, "workspace-1", "user-1", "SUSPENDED")
    ).resolves.toBe("ACTIVE");
  });

  it("allows deactivation when another active admin remains", async () => {
    const client = clientWithAdminCount(2);
    await expect(
      assertCanDeactivateLastAdmin(client, "workspace-1", "ADMIN", "SUSPENDED")
    ).resolves.toBeUndefined();
    await expect(
      lifecycleStatusAfterLastAdminGuard(client, "workspace-1", "user-1", "DEPROVISIONED")
    ).resolves.toBe("DEPROVISIONED");
  });

  it("does not count when promotion or keep-active skips the soft guard", async () => {
    const client = clientWithAdminCount(1, { role: "QA_ANALYST", lifecycleStatus: "ACTIVE" });
    await expect(assertCanDemoteAdminRole(client, "workspace-1", "ADMIN", "ADMIN")).resolves.toBeUndefined();
    await expect(roleAfterLastAdminGuard(client, "workspace-1", "user-1", "ADMIN")).resolves.toBe("ADMIN");
    await expect(
      assertCanDeactivateLastAdmin(client, "workspace-1", "ADMIN", "ACTIVE")
    ).resolves.toBeUndefined();
    await expect(
      lifecycleStatusAfterLastAdminGuard(client, "workspace-1", "user-1", "ACTIVE")
    ).resolves.toBe("ACTIVE");
    expect(client.user.count).not.toHaveBeenCalled();
    expect(client.user.findFirst).not.toHaveBeenCalled();
  });

  it("does not re-promote when a stale ADMIN snapshot disagrees with the locked row", async () => {
    // Caller would have passed ADMIN from a pre-txn snapshot, but the row is already demoted
    // while another single ACTIVE ADMIN remains — soft guard must apply nextRole, not re-ADMIN.
    const client = clientWithLockedAdmins(["other-admin"], {
      role: "QA_ANALYST",
      lifecycleStatus: "ACTIVE"
    });

    await expect(roleAfterLastAdminGuard(client, "workspace-1", "user-1", "SUPPORT_AGENT")).resolves.toBe(
      "SUPPORT_AGENT"
    );
    await expect(
      lifecycleStatusAfterLastAdminGuard(client, "workspace-1", "user-1", "SUSPENDED")
    ).resolves.toBe("SUSPENDED");
  });

  it("concurrent-style re-read uses the locked row role, not a caller snapshot", async () => {
    const client = clientWithLockedAdmins(["admin-1"], {
      role: "SUPPORT_AGENT",
      lifecycleStatus: "ACTIVE"
    });

    const locked = await readUserRoleLifecycleForLastAdminGuard(client, "workspace-1", "user-1");
    expect(locked.activeAdminCount).toBe(1);
    expect(locked.row).toEqual({ role: "SUPPORT_AGENT", lifecycleStatus: "ACTIVE" });
    expect(client.$queryRaw).toHaveBeenCalledTimes(2);

    const adminLockSql = client.$queryRaw.mock.calls[0]?.[0] as {
      text?: string;
      sql?: string;
      strings?: string[];
    };
    const userLockSql = client.$queryRaw.mock.calls[1]?.[0] as {
      text?: string;
      sql?: string;
      strings?: string[];
    };
    const adminText = adminLockSql?.text ?? adminLockSql?.sql ?? (adminLockSql?.strings ?? []).join("?");
    const userText = userLockSql?.text ?? userLockSql?.sql ?? (userLockSql?.strings ?? []).join("?");
    expect(adminText).toContain("FOR UPDATE");
    expect(adminText).toContain("'ADMIN'");
    expect(userText).toContain("FOR UPDATE");
    expect(userText).toContain("lifecycleStatus");

    await expect(roleAfterLastAdminGuard(client, "workspace-1", "user-1", "VIEWER")).resolves.toBe("VIEWER");
  });

  it("wraps soft-guard mutate path in $transaction when available on the root client", async () => {
    const tx = clientWithLockedAdmins(["admin-1"], {
      role: "ADMIN",
      lifecycleStatus: "ACTIVE"
    });
    const root = {
      ...clientWithAdminCount(1),
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    };

    await expect(roleAfterLastAdminGuard(root, "workspace-1", "user-1", "VIEWER")).resolves.toBe("ADMIN");
    expect(root.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(root.user.findFirst).not.toHaveBeenCalled();
  });
});
