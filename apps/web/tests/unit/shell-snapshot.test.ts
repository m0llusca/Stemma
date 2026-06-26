import { describe, expect, it } from "vitest";
import { buildShellNavItems } from "@/lib/shell/snapshot";

describe("shell snapshot navigation", () => {
  it("shows support agents self review without admin navigation", () => {
    const hrefs = buildShellNavItems({ role: "SUPPORT_AGENT" }).map((item) => item.href);

    expect(hrefs).toContain("/self-review");
    expect(hrefs).not.toContain("/admin");
  });
});
