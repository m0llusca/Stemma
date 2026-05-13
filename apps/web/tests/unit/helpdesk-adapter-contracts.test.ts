import { describe, expect, it } from "vitest";
import { phaseBHelpdeskSources, phaseBSourceContracts } from "@/lib/integrations/helpdesk-adapters/source-contracts";

describe("Phase B helpdesk adapter source contracts", () => {
  it("exposes the Phase B source order", () => {
    expect(phaseBHelpdeskSources).toEqual([
      "zendesk",
      "freshdesk",
      "intercom",
      "hubspot",
      "salesforce",
      "servicenow",
      "dynamics"
    ]);
  });

  it("records conservative evidence and live certification gates for every source", () => {
    for (const source of phaseBHelpdeskSources) {
      const contract = phaseBSourceContracts[source];

      expect(contract.source).toBe(source);
      expect(contract.displayName).toEqual(expect.any(String));
      expect(contract.displayName.length).toBeGreaterThan(0);
      expect(contract.officialDocs.length).toBeGreaterThan(0);
      expect(contract.operations.length).toBeGreaterThan(0);
      expect(contract.requiredSecrets.length).toBeGreaterThan(0);
      expect(contract.liveCertification.requiredEnvironment.length).toBeGreaterThan(0);
      expect(contract.liveCertification.neverRunByDefault).toBe(true);
      expect(contract.certification.gates.live).toBe("waiting_for_access");
      expect(contract.certification.summary.productionReady).toBe(false);
      expect(contract.requiredSecrets).toEqual(
        contract.type === "enterprise" ? ["oauth_client_credentials"] : ["auth_password"]
      );

      for (const doc of contract.officialDocs) {
        const hasFirstPartyHttpsUrl = doc.href.startsWith("https://");
        const hasContext7Id = doc.context7Id?.startsWith("/") ?? false;

        expect(hasFirstPartyHttpsUrl || hasContext7Id).toBe(true);
        expect(Array.isArray(doc.notes)).toBe(true);
        expect(doc.notes.length).toBeGreaterThan(0);
      }
    }
  });

  it("clones shared collections for each contract", () => {
    expect(phaseBSourceContracts.zendesk.operations).toEqual(phaseBSourceContracts.freshdesk.operations);
    expect(phaseBSourceContracts.zendesk.operations).not.toBe(phaseBSourceContracts.freshdesk.operations);
    expect(phaseBSourceContracts.salesforce.operations).toEqual(phaseBSourceContracts.servicenow.operations);
    expect(phaseBSourceContracts.salesforce.operations).not.toBe(phaseBSourceContracts.servicenow.operations);
    expect(phaseBSourceContracts.zendesk.payloadLimits).not.toBe(phaseBSourceContracts.freshdesk.payloadLimits);
  });

  it("does not live certify enterprise CRM sources", () => {
    for (const source of ["salesforce", "servicenow", "dynamics"] as const) {
      expect(phaseBSourceContracts[source].type).toBe("enterprise");
      expect(phaseBSourceContracts[source].certification.gates.live).not.toBe("live_certified");
      expect(phaseBSourceContracts[source].certification.summary.status).not.toBe("live_certified");
      expect(phaseBSourceContracts[source].certification.summary.productionReady).toBe(false);
    }
  });
});
