import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { demoLoginUserOrderBy, demoLoginUserWhere, demoUserByIdWhere } from "@/lib/auth/demo-users";

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

  it("loads login demo users in one findMany, batched with providers", () => {
    const loginPage = readFileSync(resolve(process.cwd(), "src/app/auth/login/page.tsx"), "utf8");

    expect(loginPage).toContain("const [providers, demoUsers] = await Promise.all([");
    expect(loginPage).toContain("demoAuthEnabled");
    expect(loginPage).toContain("prisma.user.findMany({");
    expect(loginPage).toContain("where: demoLoginUserWhere");
    expect(loginPage.match(/prisma\.user\.findMany/g)).toHaveLength(1);
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
