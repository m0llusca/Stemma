import { describe, expect, it } from "vitest";
import {
  analystMineOverdueHref,
  canAccessDashboard,
  canSeeOpsQueuePulse,
  canSeeReviewsQueueNav,
  dashboardSkeletonVariantForRole,
  DASHBOARD_ROLES,
  isGenericPostLoginPath,
  resolvePostLoginPath,
  queueFilterResetHref,
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
    expect(roleHomePath("EXEC")).toBe("/dashboard");
    expect(roleHomePath("EXEC")).not.toBe(roleHomePath("QA_ANALYST", { name: "Наталья" }));
    expect(roleHomePath("SUPPORT_AGENT")).toBe("/self-review");
    expect(roleHomePath("VIEWER")).toBe("/auth/pending-access");
  });

  it("resets analyst inbox filters to mine+overdue home, not a bare /reviews", () => {
    expect(queueFilterResetHref("QA_ANALYST", { name: "Анна QA" })).toBe(
      "/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue"
    );
    expect(queueFilterResetHref("QA_ANALYST")).toBe("/reviews?due=overdue");
    expect(queueFilterResetHref("TEAM_LEAD")).toBe("/reviews");
    expect(queueFilterResetHref("ADMIN")).toBe("/reviews");
    expect(queueFilterResetHref("EXEC")).toBe("/reviews");
    expect(queueFilterResetHref("SUPPORT_AGENT")).toBe("/reviews");
    expect(queueFilterResetHref("VIEWER")).toBe("/reviews");
  });

  it("allows reviewer, lead and exec roles onto the dashboard", () => {
    expect(DASHBOARD_ROLES).toEqual(["ADMIN", "TEAM_LEAD", "QA_ANALYST", "EXEC"]);
    expect(canAccessDashboard("ADMIN")).toBe(true);
    expect(canAccessDashboard("TEAM_LEAD")).toBe(true);
    expect(canAccessDashboard("QA_ANALYST")).toBe(true);
    expect(canAccessDashboard("EXEC")).toBe(true);
    expect(canAccessDashboard("SUPPORT_AGENT")).toBe(false);
    expect(canAccessDashboard("VIEWER")).toBe(false);
    expect(dashboardSkeletonVariantForRole("EXEC")).toBe("exec");
    expect(dashboardSkeletonVariantForRole("TEAM_LEAD")).toBe("dashboard");
    expect(dashboardSkeletonVariantForRole("ADMIN")).toBe("dashboard");
  });

  it("restricts Проверки nav to writer/dashboard roles, not reviews:read", () => {
    expect(canSeeReviewsQueueNav("ADMIN")).toBe(true);
    expect(canSeeReviewsQueueNav("TEAM_LEAD")).toBe(true);
    expect(canSeeReviewsQueueNav("QA_ANALYST")).toBe(true);
    expect(canSeeReviewsQueueNav("EXEC")).toBe(true);
    expect(canSeeReviewsQueueNav("SUPPORT_AGENT")).toBe(false);
    expect(canSeeReviewsQueueNav("VIEWER")).toBe(false);
  });

  it("hides ops pulse Очередь/Риск from agent and exec despite reviews:read", () => {
    expect(canSeeOpsQueuePulse("ADMIN")).toBe(true);
    expect(canSeeOpsQueuePulse("TEAM_LEAD")).toBe(true);
    expect(canSeeOpsQueuePulse("QA_ANALYST")).toBe(true);
    expect(canSeeOpsQueuePulse("SUPPORT_AGENT")).toBe(false);
    expect(canSeeOpsQueuePulse("EXEC")).toBe(false);
    expect(canSeeOpsQueuePulse("VIEWER")).toBe(false);
  });

  it("treats bare product roots as generic and keeps filtered deep links", () => {
    expect(isGenericPostLoginPath("/")).toBe(true);
    expect(isGenericPostLoginPath("/reviews")).toBe(true);
    expect(isGenericPostLoginPath("/dashboard")).toBe(true);
    expect(isGenericPostLoginPath("/auth/pending-access")).toBe(true);
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
    expect(resolvePostLoginPath("/reviews", { role: "EXEC", name: "Наталья" })).toBe("/dashboard");
    expect(resolvePostLoginPath("/dashboard", { role: "EXEC", name: "Наталья" })).toBe("/dashboard");
    expect(resolvePostLoginPath("/reviews?due=overdue", { role: "EXEC", name: "Наталья" })).toBe(
      "/reviews?due=overdue"
    );
    expect(
      resolvePostLoginPath("/reviews?status=unreviewed", { role: "QA_ANALYST", name: "Анна QA" })
    ).toBe("/reviews?status=unreviewed");
    expect(resolvePostLoginPath("/reviews", { role: "VIEWER", name: "Гость" })).toBe(
      "/auth/pending-access"
    );
    expect(
      resolvePostLoginPath("/reviews?status=unreviewed", { role: "VIEWER", name: "Гость" })
    ).toBe("/auth/pending-access");
    expect(resolvePostLoginPath("/dashboard", { role: "VIEWER", name: "Гость" })).toBe(
      "/auth/pending-access"
    );
  });
});
