import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectSourceForm } from "@/components/integrations/connect-source-form";

vi.mock("@/lib/connect-actions", () => ({ connectSourceAction: vi.fn(async () => null) }));

describe("ConnectSourceForm", () => {
  it("renders a source tile and a connect button", () => {
    render(
      <ConnectSourceForm
        sources={[
          {
            source: "zendesk",
            label: "Zendesk",
            type: "native_helpdesk",
            urlPolicy: "required",
            fields: [
              { key: "email", label: "Email", secret: false },
              { key: "apiToken", label: "Токен", secret: true }
            ]
          }
        ]}
      />
    );

    // The single source is auto-selected, so its label shows both in the
    // picker card and in the form's current-source chip.
    expect(screen.getAllByText("Zendesk").length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: /Zendesk/i })).toBeChecked();
    expect(screen.getByRole("button", { name: /Подключить/i })).toBeInTheDocument();
  });

  it("renders the step checklist from a journal state", () => {
    render(
      <ConnectSourceForm
        sources={[]}
        initialState={{
          connected: true,
          steps: [
            { step: "verify_auth", status: "ok", detail: "вход выполнен" },
            { step: "persist", status: "ok", detail: "сохранено" }
          ]
        }}
      />
    );

    expect(screen.getByText(/вход выполнен/)).toBeInTheDocument();
  });
});
