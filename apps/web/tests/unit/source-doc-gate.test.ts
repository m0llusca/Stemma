import { describe, expect, it } from "vitest";
import { assertContractDocsFresh, requiredOfficialDocTargets } from "@/lib/integrations/source-doc-gate";

describe("source documentation gate", () => {
  it("lists first-wave docs that must be checked before adapter changes", () => {
    expect(requiredOfficialDocTargets().map((target) => target.source)).toEqual(
      expect.arrayContaining(["zendesk", "intercom", "hubspot", "jira", "otrs", "znuny", "otobo"])
    );
    expect(requiredOfficialDocTargets().every((target) => target.requiredBeforeCodeChange)).toBe(true);
  });

  it("flags stale source docs after 120 days", () => {
    expect(assertContractDocsFresh("2026-06-28", new Date("2026-08-01T00:00:00.000Z"))).toEqual({
      ok: true,
      ageDays: 34
    });
    expect(assertContractDocsFresh("2026-01-01", new Date("2026-06-28T00:00:00.000Z"))).toEqual({
      ok: false,
      ageDays: 178
    });
  });
});
