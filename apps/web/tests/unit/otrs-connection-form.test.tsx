import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OtrsConnectionForm } from "@/components/integrations/otrs-connection-form";
import { buildDefaultOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";

vi.mock("@/lib/integration-actions", () => ({
  saveOtrsIntegrationConfigurationState: vi.fn()
}));

vi.mock("@/lib/otrs-import-actions", () => ({
  detectOtrsRoutesAction: vi.fn()
}));

describe("OtrsConnectionForm", () => {
  const baseProps = {
    integration: {
      id: "i1",
      source: "otrs",
      displayName: "OTRS",
      baseUrl: "https://otrs.example.ru/otrs",
      importLimit: 25,
      batchSize: 10,
      dateRangeDays: 30
    },
    config: buildDefaultOtrsConnectorConfig(),
    userLogin: "agent",
    credentials: []
  };

  it("renders a timezone select with UTC default", () => {
    render(<OtrsConnectionForm {...baseProps} />);
    const select = screen.getByLabelText(/Таймзона/i) as HTMLSelectElement;
    expect(select.value).toBe("UTC");
  });

  it("renders the auto-detect routes button", () => {
    render(<OtrsConnectionForm {...baseProps} />);
    expect(screen.getByRole("button", { name: /Определить маршруты/i })).toBeInTheDocument();
  });
});
