import { describe, expect, it } from "vitest";
import { demoLoginUserOrderBy, demoLoginUserWhere, demoUserByIdWhere } from "@/lib/auth/demo-users";

describe("demo login users", () => {
  it("lists only users explicitly linked to an active demo provider", () => {
    expect(demoLoginUserWhere).toEqual({
      role: {
        not: "VIEWER"
      },
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
      role: {
        not: "VIEWER"
      },
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
});
