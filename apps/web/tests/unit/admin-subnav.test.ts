import { describe, expect, it } from "vitest";
import { adminSubnavGroups } from "@/components/admin/admin-subnav";

const allItems = adminSubnavGroups.flatMap((group) => group.items);

describe("admin subnav configuration", () => {
  it("exposes a dedicated AI scoring section", () => {
    const item = allItems.find((entry) => entry.href === "/admin/ai-scoring");
    expect(item?.label).toBe("AI-оценка");
  });

  it("exposes a dedicated messaging channels section", () => {
    const item = allItems.find((entry) => entry.href === "/admin/channels");
    expect(item?.label).toBe("Каналы");
  });

  it("keeps every section href unique", () => {
    const hrefs = allItems.map((entry) => entry.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
