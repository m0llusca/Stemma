import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("dashboard page agent scope", () => {
  const source = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");

  it("scopes SUPPORT_AGENT review metrics by conversation.assigneeId", () => {
    expect(source).toContain(
      'user.role === "SUPPORT_AGENT" ? { conversation: { assigneeId: user.id } } : {}'
    );
  });

  it("scopes SUPPORT_AGENT conversation queues by assigneeId", () => {
    expect(source).toContain(
      'user.role === "SUPPORT_AGENT" ? { assigneeId: user.id } : {}'
    );
  });

  it("scopes SUPPORT_AGENT review events by conversation.assigneeId", () => {
    expect(source).toContain(
      'user.role === "SUPPORT_AGENT" ? { review: { conversation: { assigneeId: user.id } } } : {}'
    );
  });

  it("does not authorize SUPPORT_AGENT metrics by assigneeName: user.name", () => {
    expect(source).not.toMatch(/assigneeName:\s*user\.name/);
  });
});
