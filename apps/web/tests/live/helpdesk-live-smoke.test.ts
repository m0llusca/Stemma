import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { recordCertificationEvidence } from "@/lib/certification/readiness-report";
import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters";
import { phaseBHelpdeskSources } from "@/lib/integrations/helpdesk-adapters/source-contracts";
import type { PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";

const liveSmokeAck = process.env.HELPDESK_LIVE_SMOKE === "1";
const liveSource = process.env.HELPDESK_LIVE_SOURCE;
const liveBaseUrl = process.env.HELPDESK_LIVE_BASE_URL;
const liveToken = process.env.HELPDESK_LIVE_TOKEN;
const liveExternalId = process.env.HELPDESK_LIVE_EXTERNAL_ID;
const evidenceWorkspaceId = process.env.CERTIFICATION_EVIDENCE_WORKSPACE_ID;
const evidenceRunId = process.env.CERTIFICATION_EVIDENCE_RUN_ID || `helpdesk-live-${randomUUID()}`;
const evidenceActorId = process.env.CERTIFICATION_EVIDENCE_ACTOR_ID || null;

function isPhaseBHelpdeskSource(source: string | undefined): source is PhaseBHelpdeskSource {
  return phaseBHelpdeskSources.some((candidate) => candidate === source);
}

const liveHelpdeskSource = isPhaseBHelpdeskSource(liveSource) ? liveSource : undefined;
const invalidLiveSourceConfigured = Boolean(liveSource && !liveHelpdeskSource && liveBaseUrl && liveToken && liveExternalId);
const hasLiveInputs = Boolean(liveSource || liveBaseUrl || liveToken || liveExternalId);
const missingHardGate = hasLiveInputs && !liveSmokeAck;
const missingRequiredLiveConfig = liveSmokeAck && !invalidLiveSourceConfigured && !Boolean(liveHelpdeskSource && liveBaseUrl && liveToken && liveExternalId);
const runLive = Boolean(liveSmokeAck && liveHelpdeskSource && liveBaseUrl && liveToken && liveExternalId);

describe.skipIf(!runLive && !invalidLiveSourceConfigured && !missingHardGate && !missingRequiredLiveConfig)("live helpdesk adapter smoke", () => {
  it("loads one live conversation through the selected adapter", async () => {
    if (missingHardGate) {
      throw new Error("Refusing to run live helpdesk smoke: set HELPDESK_LIVE_SMOKE=1 in a protected environment.");
    }

    if (invalidLiveSourceConfigured) {
      throw new Error(`Unsupported HELPDESK_LIVE_SOURCE "${liveSource}". Expected one of: ${phaseBHelpdeskSources.join(", ")}.`);
    }

    if (missingRequiredLiveConfig || !liveHelpdeskSource || !liveBaseUrl || !liveToken || !liveExternalId) {
      throw new Error("Live helpdesk smoke test requires HELPDESK_LIVE_SOURCE, HELPDESK_LIVE_BASE_URL, HELPDESK_LIVE_TOKEN, and HELPDESK_LIVE_EXTERNAL_ID.");
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

    if (evidenceWorkspaceId) {
      await recordCertificationEvidence({
        workspaceId: evidenceWorkspaceId,
        targetType: "integration",
        source: liveHelpdeskSource,
        runId: evidenceRunId,
        actorId: evidenceActorId,
        envGate: "HELPDESK_LIVE_SMOKE=1;protected:live-smoke",
        result: "passed",
        redactedDiagnostics: {
          source: liveHelpdeskSource,
          baseUrl: liveBaseUrl,
          externalId: liveExternalId,
          conversationCount: result.conversations.length,
          messageCount: result.conversations[0]?.messages.length ?? 0
        }
      });
    }
  });
});
