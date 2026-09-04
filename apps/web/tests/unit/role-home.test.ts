import { describe, expect, it } from "vitest";
import {
  analystMineOverdueHref,
  isGenericPostLoginPath,
  resolvePostLoginPath,
  roleHomePath,
  sanitizeReturnTo
} from "@/lib/auth/role-home";

describe("role-home", () => {
  it("builds the analyst mine+overdue inbox URL from the existing filter model", () => {
    expect(analystMineOverdueHref("Анна QA")).toBe(
      "/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue"
    );
  });

  it("maps each role to its product home", () => {
    expect(roleHomePath("QA_ANALYST", { name: "Анна QA" })).toBe(
      "/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue"
    );
    expect(roleHomePath("TEAM_LEAD")).toBe("/dashboard");
    expect(roleHomePath("ADMIN")).toBe("/dashboard");
    expect(roleHomePath("SUPPORT_AGENT")).toBe("/self-review");
    expect(roleHomePath("VIEWER")).toBe("/reviews");
  });

  it("treats bare product roots as generic and keeps filtered deep links", () => {
    expect(isGenericPostLoginPath("/")).toBe(true);
    expect(isGenericPostLoginPath("/reviews")).toBe(true);
    expect(isGenericPostLoginPath("/dashboard")).toBe(true);
    expect(isGenericPostLoginPath("/reviews?due=overdue")).toBe(false);
    expect(isGenericPostLoginPath("/self-review")).toBe(false);
  });

  it("sanitizes open redirects to a generic sentinel", () => {
    expect(sanitizeReturnTo("https://evil.example/reviews")).toBe("/");
    expect(sanitizeReturnTo("//evil.example")).toBe("/");
    expect(sanitizeReturnTo("/reviews/abc")).toBe("/reviews/abc");
  });

  it("resolves generic returnTo to role home and keeps intentional destinations", () => {
    expect(
      resolvePostLoginPath("/reviews", { role: "QA_ANALYST", name: "Анна QA" })
    ).toBe("/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue");
    expect(resolvePostLoginPath("/dashboard", { role: "SUPPORT_AGENT", name: "Мария" })).toBe(
      "/self-review"
    );
    expect(resolvePostLoginPath("/", { role: "TEAM_LEAD", name: "Игорь" })).toBe("/dashboard");
    expect(
      resolvePostLoginPath("/reviews?status=unreviewed", { role: "QA_ANALYST", name: "Анна QA" })
    ).toBe("/reviews?status=unreviewed");
    expect(resolvePostLoginPath("/reviews", { role: "VIEWER", name: "Гость" })).toBe("/reviews");
  });
});
