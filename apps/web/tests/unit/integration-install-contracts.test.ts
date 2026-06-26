import { describe, expect, it } from "vitest";
import {
  getIntegrationInstallContract,
  integrationInstallContracts,
  integrationInstallSources,
  listIntegrationInstallContracts
} from "@/lib/integrations/install-contracts/registry";

describe("integration install contract registry", () => {
  it("lists every registry source in a stable order", () => {
    expect(integrationInstallSources).toEqual([
      "zendesk",
      "freshdesk",
      "intercom",
      "hubspot",
      "jira",
      "salesforce",
      "servicenow",
      "dynamics",
      "ydb",
      "ytsaurus",
      "otrs",
      "znuny",
      "otobo"
    ]);
    expect(listIntegrationInstallContracts().map((contract) => contract.source)).toEqual(integrationInstallSources);
  });

  it("keeps native helpdesk and data sources honest as token-only installs", () => {
    for (const source of ["zendesk", "freshdesk", "intercom", "hubspot", "jira", "ydb", "ytsaurus"] as const) {
      const contract = integrationInstallContracts[source];

      expect(contract.installState).toBe("token-only");
      expect(contract.certificationState.productionReady).toBe(false);
      expect(contract.certificationState.status).toBe("ready_for_live_certification");
      expect(contract.limitations.join(" ")).toContain("Живая сертификация не запускалась");
    }
  });

  it("records Intercom conversation scope and version limitation", () => {
    expect(integrationInstallContracts.intercom.requiredScopes).toContain("conversations.read");
    expect(integrationInstallContracts.intercom.limitations.join(" ")).toContain("Intercom-Version: 2.15");
  });

  it("marks enterprise CRM contracts as limited instead of live-ready", () => {
    for (const source of ["salesforce", "servicenow", "dynamics"] as const) {
      const contract = integrationInstallContracts[source];

      expect(contract.installState).toBe("limited");
      expect(contract.certificationState.status).toBe("limited");
      expect(contract.certificationState.productionReady).toBe(false);
      expect(contract.testImport.supported).toBe(false);
      expect(contract.limitations.join(" ")).toContain("Ограниченная поддержка");
    }
  });

  it("includes OTRS-family install contracts", () => {
    expect(integrationInstallContracts.otrs).toMatchObject({
      family: "otrs_family",
      installState: "token-only",
      authModes: ["user_password", "session_id"]
    });
    expect(integrationInstallContracts.znuny.displayName).toBe("Znuny LTS");
    expect(integrationInstallContracts.otobo.requiredScopes).toContain("ticket:read");
  });

  it("exposes webhook callback metadata without claiming webhook-ready installs", () => {
    expect(integrationInstallContracts.zendesk.supportsWebhooks).toBe(true);
    expect(integrationInstallContracts.zendesk.callbackPath).toBe("/api/v1/webhooks/{endpointId}");
    expect(integrationInstallContracts.zendesk.installState).not.toBe("webhook-ready");
  });

  it("returns undefined for unknown sources", () => {
    expect(getIntegrationInstallContract("zendesk")?.displayName).toBe("Zendesk Support");
    expect(getIntegrationInstallContract("nope")).toBeUndefined();
  });
});
