import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntegrationSetupWorkspace } from "@/components/integrations/integration-setup-workspace";
import { recordIntegrationDryRunState } from "@/lib/integration-actions";

const trpcMocks = vi.hoisted(() => ({
  queueImportMutate: vi.fn()
}));

vi.mock("@/lib/integration-actions", () => ({
  recordIntegrationDryRunState: vi.fn(),
  saveIntegrationConfigurationState: vi.fn()
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    integrations: {
      queueImport: {
        useMutation: () => ({
          mutate: trpcMocks.queueImportMutate,
          isPending: false,
          data: null,
          error: null
        })
      }
    }
  }
}));

describe("IntegrationSetupWorkspace", () => {
  it("offers Jira and tabular data sources in setup", () => {
    const { container } = render(
      <IntegrationSetupWorkspace apiTokenCount={1} apiHealth={{ label: "OK", className: "text-green-700" }} />
    );

    expect(screen.getByText("Jira Service Management")).toBeTruthy();
    expect(container.querySelector('optgroup[label="Табличные источники"]')).toBeTruthy();
    expect(screen.getByText("YDB")).toBeTruthy();
    expect(screen.getByText("YTsaurus/YT")).toBeTruthy();
  });

  it("does not mirror wizard secrets into hidden form fields", () => {
    const { container } = render(
      <IntegrationSetupWorkspace apiTokenCount={1} apiHealth={{ label: "OK", className: "text-green-700" }} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret-password-must-not-be-hidden" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    const secretHiddenInputs = container.querySelectorAll(
      'input[type="hidden"][name="password"], input[type="hidden"][name="nativeToken"], input[type="hidden"][name*="token" i], input[type="hidden"][name*="secret" i]'
    );
    expect(secretHiddenInputs).toHaveLength(0);
    expect(container.querySelector('input[type="hidden"][value="secret-password-must-not-be-hidden"]')).toBeNull();
  });

  it("does not mirror data source secrets into hidden form fields", () => {
    const { container } = render(
      <IntegrationSetupWorkspace apiTokenCount={1} apiHealth={{ label: "OK", className: "text-green-700" }} />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Система-источник" }), {
      target: { value: "data:ytsaurus" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.change(screen.getByLabelText("OAuth token"), {
      target: { value: "yt-secret-token" }
    });

    const secretHiddenInputs = container.querySelectorAll(
      'input[type="hidden"][name*="token" i], input[type="hidden"][name*="secret" i], input[type="hidden"][value="yt-secret-token"]'
    );
    expect(secretHiddenInputs).toHaveLength(0);
  });

  it("submits the connection check as a dry-run even when later imports are enabled", async () => {
    render(<IntegrationSetupWorkspace apiTokenCount={1} apiHealth={{ label: "OK", className: "text-green-700" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret-password" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.click(screen.getByLabelText(/Сначала пробный запуск/));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.click(screen.getByRole("button", { name: "Проверить подключение" }));

    await waitFor(() => expect(recordIntegrationDryRunState).toHaveBeenCalled());
    const submitted = vi.mocked(recordIntegrationDryRunState).mock.calls[0]?.[1] as FormData;

    expect(submitted.get("dryRun")).toBe("true");
  });
});
