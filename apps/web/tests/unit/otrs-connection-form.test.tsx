import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("exposes the connection settings as a named region", () => {
    render(<OtrsConnectionForm {...baseProps} />);

    expect(
      screen.getByRole("region", { name: "Настройка подключения" })
    ).toBeInTheDocument();
  });

  it("exposes UserLogin through the Authorization tab", () => {
    render(<OtrsConnectionForm {...baseProps} />);

    expect(
      screen.queryByRole("textbox", { name: "UserLogin" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Авторизация" }));

    expect(
      screen.getByRole("textbox", { name: "UserLogin" })
    ).toHaveValue("agent");
  });

  it("keeps UserLogin controlled when the saved server value catches up", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { rerender } = render(
      <OtrsConnectionForm {...baseProps} userLogin="" />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Авторизация" }));
    fireEvent.change(screen.getByRole("textbox", { name: "UserLogin" }), {
      target: { value: "qa_api" }
    });

    rerender(<OtrsConnectionForm {...baseProps} userLogin="qa_api" />);

    await waitFor(() => {
      expect(
        consoleError.mock.calls
          .flatMap((call) => call.map(String))
          .filter((message) => /uncontrolled|controlled|FieldControl/i.test(message))
      ).toEqual([]);
    });
    expect(screen.getByRole("textbox", { name: "UserLogin" })).toHaveValue("qa_api");

    consoleError.mockRestore();
  });
});
