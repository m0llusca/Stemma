import { describe, expect, it } from "vitest";
import { mapHelpdeskProbeToConnect } from "@/lib/integrations/connect/probe-capabilities";
import type { HelpdeskCapabilityProbeResult } from "@/lib/integrations/helpdesk-adapters/types";

describe("mapHelpdeskProbeToConnect", () => {
  it("maps adapter probe output to Connect diagnostics without live certification", () => {
    const adapterResult: HelpdeskCapabilityProbeResult = {
      status: "warning",
      operations: ["ticket_get"],
      detail: "zendesk: часть операций не подтверждена.",
      hint: "Не подтверждены операции: comments_get.",
      diagnostics: {
        requests: [{ operation: "ticket_get", method: "GET", url: "https://x", statusCode: 200 }]
      }
    };

    const mapped = mapHelpdeskProbeToConnect(adapterResult);

    expect(mapped).toEqual({
      status: "warning",
      detail: adapterResult.detail,
      hint: adapterResult.hint,
      diagnostics: {
        probeKind: "diagnostic",
        operations: ["ticket_get"],
        requestCount: 1
      }
    });
    expect(mapped.diagnostics).not.toHaveProperty("live_certified");
  });
});
