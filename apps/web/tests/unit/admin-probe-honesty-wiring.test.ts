import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const integrationDetailPage = readFileSync(
  join(process.cwd(), "src/app/admin/integrations/[integrationId]/page.tsx"),
  "utf8"
);
const integrationsPage = readFileSync(join(process.cwd(), "src/app/admin/integrations/page.tsx"), "utf8");
const diagnosticsPanel = readFileSync(
  join(process.cwd(), "src/components/integrations/otrs-diagnostics-panel.tsx"),
  "utf8"
);
const errorBoundary = readFileSync(join(process.cwd(), "src/app/error.tsx"), "utf8");
const pagePermission = readFileSync(join(process.cwd(), "src/lib/page-permission.ts"), "utf8");

describe("admin probe honesty wiring", () => {
  it("splits adapter cert and step badges and does not mark an empty profile as active", () => {
    expect(integrationDetailPage).toContain("certificationBadgeLabel");
    expect(integrationDetailPage).toContain("stepBadgeLabel");
    expect(integrationDetailPage).toContain("adapterOperationalProfileTitle");
    expect(integrationDetailPage).toContain("adapterOperationalStepsLabel");
    expect(integrationDetailPage).toContain("adapterProfileStep(hasBaseUrl)");
    expect(integrationDetailPage).not.toContain('state: hasBaseUrl ? "ready" : "active"');
    expect(integrationDetailPage).not.toContain('label="Готовность"');
    expect(integrationDetailPage).not.toContain("Готовность адаптера");
    expect(integrationDetailPage).not.toContain("Маршрут готовности");
  });

  it("titles the integrations evidence drawer as an operational slice", () => {
    expect(integrationsPage).toContain('title="Операционный срез"');
    expect(integrationsPage).not.toContain("Свидетельства готовности");
  });

  it("keeps OTRS diagnostics off emerald success theater", () => {
    expect(diagnosticsPanel).toContain("diagnosticStatusLabel");
    expect(diagnosticsPanel).toContain("diagnosticsNotLiveCertificationFooter");
    expect(diagnosticsPanel).not.toContain("bg-emerald-500");
    expect(diagnosticsPanel).not.toContain("CheckCircle2");
  });

  it("maps AuthRequiredError to unauthorized/login instead of generic error.tsx", () => {
    expect(pagePermission).toContain("isAuthRequiredError");
    expect(pagePermission).toContain("unauthorized()");
    expect(errorBoundary).toContain("UnauthorizedScreen");
    expect(errorBoundary).toContain("AuthRequiredError");
  });
});
