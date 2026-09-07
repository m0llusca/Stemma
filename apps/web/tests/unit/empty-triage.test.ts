import { describe, expect, it } from "vitest";
import { analystMineOverdueHref } from "@/lib/auth/role-home";
import { EMPTY_TRIAGE_IMPOSTOR_HREF, emptyTriagePrimary } from "@/lib/dashboard/empty-triage";
import { TAKE_NEXT_LABEL } from "@/lib/review/take-next-copy";

describe("emptyTriagePrimary", () => {
  it("uses Take next for lead/admin — never the unreviewed list filter", () => {
    for (const role of ["ADMIN", "TEAM_LEAD", "EXEC"] as const) {
      const action = emptyTriagePrimary(role);
      expect(action).toEqual({
        kind: "take-next",
        label: TAKE_NEXT_LABEL,
        description: "Держите ритм очереди — возьмите следующий разговор в проверку."
      });
    }
  });

  it("sends the analyst to role home with an honest list label", () => {
    const action = emptyTriagePrimary("QA_ANALYST", { name: "Анна QA" });
    expect(action).toEqual({
      kind: "href",
      href: analystMineOverdueHref("Анна QA"),
      label: "Открыть сегодня",
      description: "Критичных отклонений нет — откройте очередь дня."
    });
    expect(action.kind === "href" ? action.href : "").not.toBe(EMPTY_TRIAGE_IMPOSTOR_HREF);
  });

  it("does not imply Take next while pointing at a generic unreviewed filter", () => {
    expect(EMPTY_TRIAGE_IMPOSTOR_HREF).toBe("/reviews?status=unreviewed");
    expect(emptyTriagePrimary("QA_ANALYST", { name: "Анна QA" })).not.toMatchObject({
      href: EMPTY_TRIAGE_IMPOSTOR_HREF
    });
    expect(emptyTriagePrimary("ADMIN")).not.toMatchObject({ href: EMPTY_TRIAGE_IMPOSTOR_HREF });
  });
});
