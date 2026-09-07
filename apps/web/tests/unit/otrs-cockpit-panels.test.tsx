import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OtrsDiagnosticsPanel } from "@/components/integrations/otrs-diagnostics-panel";
import { OtrsPreviewPanel } from "@/components/integrations/otrs-preview-panel";

vi.mock("@/lib/integration-actions", () => ({
  createOtrsPreviewActionState: vi.fn(),
  queueSelectedOtrsImportActionState: vi.fn(),
  runOtrsDiagnosticsActionState: vi.fn()
}));

describe("OTRS cockpit panels", () => {
  it("exposes diagnostics as a named region", () => {
    render(
      <OtrsDiagnosticsPanel
        integrationId="integration-1"
        latestDiagnostic={null}
      />
    );

    const region = screen.getByRole("region", { name: "Диагностика" });
    expect(region).toBeInTheDocument();
    expect(
      screen.getByLabelText("Manual TicketID для TicketGet")
    ).toBeInTheDocument();
    expect(region).toHaveTextContent("Диагностика ≠ живая сертификация");
  });

  it("renders step pass as Russian info, not emerald English succeeded", () => {
    render(
      <OtrsDiagnosticsPanel
        integrationId="integration-1"
        latestDiagnostic={{
          id: "diag-1",
          status: "succeeded",
          mode: "safe",
          startedAt: "2026-04-01T12:00:00.000Z",
          finishedAt: "2026-04-01T12:00:01.000Z",
          redactedEndpoint: "https://otrs.example/***",
          errorCode: null,
          errorMessage: null,
          steps: [
            {
              id: "step-1",
              key: "config",
              position: 1,
              status: "succeeded",
              durationMs: 12,
              remediationHint: null
            }
          ]
        }}
      />
    );

    const region = screen.getByRole("region", { name: "Диагностика" });
    expect(region).toHaveTextContent("Пройден");
    expect(region).toHaveTextContent("Конфигурация");
    expect(region).toHaveTextContent("Диагностика ≠ живая сертификация");
    expect(region).not.toHaveTextContent("succeeded");
    expect(region.innerHTML).not.toMatch(/bg-emerald-500/);
  });

  it("exposes preview and import as a named region", () => {
    render(
      <OtrsPreviewPanel
        integrationId="integration-1"
        latestPreviewRun={null}
      />
    );

    const region = screen.getByRole("region", { name: "Предпросмотр / импорт" });
    expect(region).toBeInTheDocument();
    expect(screen.getByLabelText("TicketID вручную")).toBeInTheDocument();
  });
});
