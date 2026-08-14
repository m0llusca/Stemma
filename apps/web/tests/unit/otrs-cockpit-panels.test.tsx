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
