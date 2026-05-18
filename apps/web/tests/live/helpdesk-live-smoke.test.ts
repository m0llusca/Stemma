import { describe, expect, it } from "vitest";
import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters";
import { phaseBHelpdeskSources } from "@/lib/integrations/helpdesk-adapters/source-contracts";
import type { PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";

const liveSource = process.env.HELPDESK_LIVE_SOURCE;
const liveBaseUrl = process.env.HELPDESK_LIVE_BASE_URL;
const liveToken = process.env.HELPDESK_LIVE_TOKEN;
const liveExternalId = process.env.HELPDESK_LIVE_EXTERNAL_ID;

function isPhaseBHelpdeskSource(source: string | undefined): source is PhaseBHelpdeskSource {
  return phaseBHelpdeskSources.some((candidate) => candidate === source);
}

const liveHelpdeskSource = isPhaseBHelpdeskSource(liveSource) ? liveSource : undefined;
const invalidLiveSourceConfigured = Boolean(liveSource && !liveHelpdeskSource && liveBaseUrl && liveToken && liveExternalId);
const runLive = Boolean(liveHelpdeskSource && liveBaseUrl && liveToken && liveExternalId);

describe.skipIf(!runLive && !invalidLiveSourceConfigured)("live helpdesk adapter smoke", () => {
  it("loads one live conversation through the selected adapter", async () => {
    if (invalidLiveSourceConfigured) {
      throw new Error(`Unsupported HELPDESK_LIVE_SOURCE "${liveSource}". Expected one of: ${phaseBHelpdeskSources.join(", ")}.`);
    }

    if (!liveHelpdeskSource || !liveBaseUrl || !liveToken || !liveExternalId) {
      throw new Error("Live helpdesk smoke test requires source, base URL, token, and external ID.");
    }

    const adapter = createHelpdeskAdapter(liveHelpdeskSource);
    const result = await adapter.loadConversation({
      source: liveHelpdeskSource,
      baseUrl: liveBaseUrl,
      externalId: liveExternalId,
      token: liveToken
    });

    expect(result.conversations.length).toBeGreaterThan(0);
    expect(result.conversations[0]?.messages.length).toBeGreaterThan(0);
  });
});
