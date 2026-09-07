import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { certificationDisplayTone } from "@/lib/certification/status";
import { integrationConnectionTone } from "@/lib/integrations/connection-tone";

const integrationsPage = readFileSync(join(process.cwd(), "src/app/admin/integrations/page.tsx"), "utf8");
const systemPage = readFileSync(join(process.cwd(), "src/app/admin/system/page.tsx"), "utf8");

describe("integration connection tone", () => {
  it("does not paint ready or active as success without live cert", () => {
    expect(integrationConnectionTone("ready")).not.toBe("positive");
    expect(integrationConnectionTone("active")).not.toBe("positive");
    expect(integrationConnectionTone("ready", "ready_for_live_certification")).toBe("warning");
    expect(integrationConnectionTone("active", "ready_for_live_certification")).toBe("warning");
    expect(integrationConnectionTone("active", "stub_certified")).not.toBe("positive");
    expect(integrationConnectionTone("ready", "docs_checked")).not.toBe("positive");
    expect(integrationConnectionTone("active", "contract_certified")).not.toBe("positive");
  });

  it("uses the same green bar as the cert chip", () => {
    expect(certificationDisplayTone("live_certified")).toBe("positive");
    expect(integrationConnectionTone("ready", "live_certified")).toBe("positive");
    expect(integrationConnectionTone("active", "live_certified")).toBe("positive");
    expect(integrationConnectionTone("ready", "live_certified")).toBe(certificationDisplayTone("live_certified"));
  });

  it("keeps operational error and queue tones even when live-certified", () => {
    expect(integrationConnectionTone("error", "live_certified")).toBe("negative");
    expect(integrationConnectionTone("disabled", "live_certified")).toBe("warning");
    expect(integrationConnectionTone("queued", "live_certified")).toBe("info");
    expect(integrationConnectionTone("paused", "live_certified")).toBe("neutral");
  });
});

describe("admin connection chip wiring", () => {
  it("does not green connection chips from ready|active alone", () => {
    expect(integrationsPage).not.toContain('if (status === "active" || status === "ready") return "positive"');
    expect(systemPage).not.toContain('if (status === "active" || status === "ready") return "positive"');
    expect(integrationsPage).toContain('import { integrationConnectionTone } from "@/lib/integrations/connection-tone"');
    expect(systemPage).toContain('import { integrationConnectionTone } from "@/lib/integrations/connection-tone"');
    expect(integrationsPage).toContain("integrationConnectionTone(");
    expect(systemPage).toContain("integrationConnectionTone(");
    expect(integrationsPage).toContain("capability.certification.summary.status");
    expect(systemPage).toContain("capability.certification.summary.status");
  });
});
