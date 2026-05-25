import { describe, expect, it } from "vitest";
import { phaseBHelpdeskSources, phaseBSourceContracts } from "@/lib/integrations/helpdesk-adapters/source-contracts";
import { getHelpdeskAdapterFixture, helpdeskAdapterFixtures } from "../fixtures/helpdesk-adapter-fixtures";
import { createHelpdeskAdapterServer } from "../fixtures/helpdesk-adapter-server";

type ZendeskTicketFixture = {
  ticket: {
    id: number;
    subject: string;
  };
};

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
      expect(contract.liveCertification.requiredEnvironment).toContain("HELPDESK_LIVE_SMOKE");
      expect(contract.liveCertification.smokeTestCommand).toContain("HELPDESK_LIVE_SMOKE=1");
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

  it("records HubSpot activity reads without live certification overclaim", () => {
    expect(phaseBSourceContracts.hubspot.operations).toContain("activities_get");
    expect(phaseBSourceContracts.hubspot.certification.gates.live).toBe("waiting_for_access");
    expect(phaseBSourceContracts.hubspot.certification.summary.productionReady).toBe(false);
  });

  it("provides local stub fixtures for every Phase B source", async () => {
    for (const source of phaseBHelpdeskSources) {
      expect(helpdeskAdapterFixtures[source].success).toBeDefined();
      expect(helpdeskAdapterFixtures[source].malformed).toBeDefined();
    }

    const server = await createHelpdeskAdapterServer({ source: "zendesk", mode: "success" });

    try {
      const response = await fetch(`${server.baseUrl}/api/v2/tickets/35436.json`);

      await expect(response.json()).resolves.toMatchObject({ ticket: { id: 35436 } });
      expect(server.requests[0]).toMatchObject({
        source: "zendesk",
        operation: "ticket_get"
      });
    } finally {
      await server.close();
    }
  });

  it("isolates fixture access and stub responses from mutation", async () => {
    const exportedFixture = helpdeskAdapterFixtures.zendesk.success as ZendeskTicketFixture;
    exportedFixture.ticket.subject = "Mutated through exported fixture";

    expect((helpdeskAdapterFixtures.zendesk.success as ZendeskTicketFixture).ticket.subject).toBe(
      "Refund request from Zendesk"
    );

    const helperFixture = getHelpdeskAdapterFixture("zendesk", "success") as ZendeskTicketFixture;
    helperFixture.ticket.subject = "Mutated through helper fixture";

    expect((getHelpdeskAdapterFixture("zendesk", "success") as ZendeskTicketFixture).ticket.subject).toBe(
      "Refund request from Zendesk"
    );

    const server = await createHelpdeskAdapterServer({ source: "zendesk", mode: "success" });

    try {
      const firstResponse = await fetch(`${server.baseUrl}/api/v2/tickets/35436.json`);
      const firstPayload = (await firstResponse.json()) as ZendeskTicketFixture;
      firstPayload.ticket.subject = "Mutated response";

      const secondResponse = await fetch(`${server.baseUrl}/api/v2/tickets/35436.json`);
      await expect(secondResponse.json()).resolves.toMatchObject({
        ticket: { subject: "Refund request from Zendesk" }
      });
    } finally {
      await server.close();
      await server.close();
    }
  });
});
