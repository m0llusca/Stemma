import { describe, expect, it } from "vitest";
import { createZendeskAdapter } from "@/lib/integrations/helpdesk-adapters/zendesk";
import { createIntercomAdapter } from "@/lib/integrations/helpdesk-adapters/intercom";
import { createHubspotAdapter } from "@/lib/integrations/helpdesk-adapters/hubspot";
import { createJiraAdapter } from "@/lib/integrations/helpdesk-adapters/jira";
import { createHelpdeskAdapterServer } from "../fixtures/helpdesk-adapter-server";

describe("native helpdesk capability probes", () => {
  it("confirms Zendesk ticket and comments operations", async () => {
    const server = await createHelpdeskAdapterServer({ source: "zendesk", mode: "success" });

    try {
      const result = await createZendeskAdapter().probeCapabilities({
        source: "zendesk",
        baseUrl: server.baseUrl,
        token: "user/token:secret",
        externalId: "ZD-1001"
      });

      expect(result).toMatchObject({
        status: "ok",
        operations: expect.arrayContaining(["ticket_get", "comments_get"])
      });
    } finally {
      await server.close();
    }
  });

  it("confirms Intercom conversation retrieval with the pinned API version", async () => {
    const server = await createHelpdeskAdapterServer({ source: "intercom", mode: "success" });

    try {
      const result = await createIntercomAdapter().probeCapabilities({
        source: "intercom",
        baseUrl: server.baseUrl,
        token: "token",
        externalId: "conv-1001"
      });

      expect(result.status).toBe("ok");
      expect(result.operations).toContain("conversations_get");
      expect(result.diagnostics.requests[0].url).toContain("/conversations/");
    } finally {
      await server.close();
    }
  });

  it("confirms HubSpot and Jira read probes without live certification", async () => {
    const hubspotServer = await createHelpdeskAdapterServer({ source: "hubspot", mode: "success" });
    const jiraServer = await createHelpdeskAdapterServer({ source: "jira", mode: "success" });

    try {
      await expect(
        createHubspotAdapter().probeCapabilities({
          source: "hubspot",
          baseUrl: hubspotServer.baseUrl,
          token: "token",
          externalId: "4302"
        })
      ).resolves.toMatchObject({ status: "ok" });

      await expect(
        createJiraAdapter().probeCapabilities({
          source: "jira",
          baseUrl: jiraServer.baseUrl,
          token: "email:token",
          externalId: "JSM-184"
        })
      ).resolves.toMatchObject({ status: "ok" });
    } finally {
      await Promise.all([hubspotServer.close(), jiraServer.close()]);
    }
  });
});
