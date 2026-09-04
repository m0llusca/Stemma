import { describe, expect, it } from "vitest";
import {
  capabilityMatrixFromConnectSteps,
  capabilityMatrixFromContract
} from "@/lib/integrations/connect/capability-probe-display";
import type { ConnectStep } from "@/lib/integrations/connect/types";
import { resolveLoginFlashMessage } from "@/lib/auth/login-flash";

describe("capability probe display", () => {
  it("surfaces probe operations without claiming live certification", () => {
    const steps: ConnectStep[] = [
      {
        step: "capability_probe",
        status: "ok",
        detail: "Zendesk: чтение источника подтверждено.",
        diagnostics: {
          probeKind: "diagnostic",
          operations: ["list_conversations", "get_conversation", "diagnostics"]
        }
      }
    ];

    const matrix = capabilityMatrixFromConnectSteps(steps);
    expect(matrix).not.toBeNull();
    expect(matrix?.rows.map((row) => row.key)).toEqual([
      "list_conversations",
      "get_conversation",
      "diagnostics"
    ]);
    expect(matrix?.honestyNote).toMatch(/живой сертификации/i);
    expect(matrix?.honestyNote).not.toMatch(/production-ready.*probe/i);
  });

  it("keeps contract matrix informational (info, not live-green claims)", () => {
    const rows = capabilityMatrixFromContract({
      operations: ["ticket_search", "diagnostics"],
      supportsDiagnostics: true,
      supportsInboundWebhooks: false,
      supportsPaging: true,
      supportsCursor: true
    });

    expect(rows.some((row) => row.key === "ticket_search" && row.status === "ok")).toBe(true);
    expect(rows.some((row) => row.key === "webhook_ingest" && row.status === "skipped")).toBe(true);
    expect(rows.every((row) => row.detail !== "live_certified")).toBe(true);
  });
});

describe("login flash SSO honesty", () => {
  it("keeps SSO failure copy fail-closed", () => {
    expect(resolveLoginFlashMessage("sso_unavailable")).toMatch(/fail-closed/i);
    expect(resolveLoginFlashMessage("sso_start_failed")).toMatch(/не подтверждена/i);
    expect(resolveLoginFlashMessage("sso_callback_failed")).toMatch(/не успешный вход/i);
  });
});
