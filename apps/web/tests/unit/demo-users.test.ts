import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  demoLoginUserOrderBy,
  demoLoginUsersFindManyArgs,
  demoLoginUserWhere,
  demoUserByIdWhere,
  demoUserOptionLabel
} from "@/lib/auth/demo-users";

describe("demo login users", () => {
  it("lists only users explicitly linked to an active demo provider", () => {
    expect(demoLoginUserWhere).toEqual({
      externalIdentities: {
        some: {
          provider: {
            type: "DEMO",
            status: "active"
          }
        }
      }
    });
    expect(demoLoginUserOrderBy).toEqual([{ workspaceId: "asc" }, { role: "asc" }, { name: "asc" }]);
  });

  it("lists login and in-session switch from the same demo-identity query", () => {
    expect(demoLoginUsersFindManyArgs()).toEqual({
      where: demoLoginUserWhere,
      orderBy: demoLoginUserOrderBy,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        workspace: {
          select: {
            name: true
          }
        }
      }
    });
  });

  it("labels demo users the same way on login and role switch", () => {
    expect(
      demoUserOptionLabel({
        name: "Анна QA",
        role: "QA_ANALYST",
        workspace: { name: "Демо" }
      })
    ).toBe("Анна QA · Проверяющий · Демо");
    expect(
      demoUserOptionLabel({
        name: "Администратор",
        role: "ADMIN",
        workspace: { name: "Демо" }
      })
    ).toBe("Администратор · Демо");
  });

  it("keeps direct demo switch lookups constrained to demo identities", () => {
    expect(demoUserByIdWhere("user-1")).toEqual({
      id: "user-1",
      externalIdentities: {
        some: {
          provider: {
            type: "DEMO",
            status: "active"
          }
        }
      }
    });
  });

  it("seeds a switchable VIEWER identity for pending-access QA", () => {
    const mutation = readFileSync(resolve(process.cwd(), "prisma/demo-seed-mutation.ts"), "utf8");

    expect(mutation).toContain('email: "viewer@example.com"');
    expect(mutation).toContain('id: "demo-user-viewer"');
    expect(mutation).toContain('role: "VIEWER"');
    expect(mutation).toContain('providerSubject: "demo-viewer"');
    expect(mutation).toContain("userId: pendingViewer.id");
  });
});
