import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageSkeleton } from "@/components/loading-states";
import { dashboardSkeletonVariantForRole } from "@/lib/auth/role-home";

describe("dashboard skeleton variant", () => {
  it("maps EXEC to the 3-KPI risk layout and everyone else to ops dashboard", () => {
    expect(dashboardSkeletonVariantForRole("EXEC")).toBe("exec");
    expect(dashboardSkeletonVariantForRole("TEAM_LEAD")).toBe("dashboard");
    expect(dashboardSkeletonVariantForRole("ADMIN")).toBe("dashboard");
    expect(dashboardSkeletonVariantForRole("QA_ANALYST")).toBe("dashboard");
    expect(dashboardSkeletonVariantForRole("SUPPORT_AGENT")).toBe("dashboard");
    expect(dashboardSkeletonVariantForRole("VIEWER")).toBe("dashboard");
  });

  it("renders a 3-KPI exec skeleton without the ops dual-panel grid", () => {
    const exec = render(<PageSkeleton variant="exec" label="Загрузка дашборда" />);
    const execKpis = exec.container.querySelector("section");

    expect(execKpis?.className).toContain("sm:grid-cols-3");
    expect(exec.container.querySelectorAll('[data-slot="card"]')).toHaveLength(4);
    expect(exec.container.querySelectorAll("section")).toHaveLength(2);

    const ops = render(<PageSkeleton variant="dashboard" label="Загрузка дашборда" />);
    const opsKpis = ops.container.querySelector("section");

    expect(opsKpis?.className).toContain("xl:grid-cols-4");
    expect(ops.container.querySelectorAll('[data-slot="card"]').length).toBeGreaterThan(3);
    expect(ops.container.querySelectorAll("section").length).toBeGreaterThan(1);
  });
});
