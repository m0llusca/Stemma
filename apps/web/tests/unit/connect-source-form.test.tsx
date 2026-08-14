import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectSourceForm } from "@/components/integrations/connect-source-form";

vi.mock("@/lib/connect-actions", () => ({ connectSourceAction: vi.fn(async () => null) }));

describe("ConnectSourceForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("shows token-only install state and first limitation", () => {
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
            ],
            installState: "token-only",
            authModes: ["basic_api_token"],
            limitations: [
              "Доступ настраивается через существующий token/basic credential flow.",
              "OAuth install redirect flow пока не реализован для этого источника."
            ]
          }
        ]}
      />
    );

    expect(screen.getAllByText("токен").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/API-токен/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Доступ: вручную через токен или basic-учётные данные/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/подключение пройдёт автоматически/i)).not.toBeInTheDocument();
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

  it("keeps Base UI controls controlled consistently while switching sources", () => {
    const consoleMessages: string[] = [];
    const captureConsoleMessage = (...args: unknown[]) => {
      consoleMessages.push(args.map(String).join(" "));
    };
    vi.spyOn(console, "warn").mockImplementation(captureConsoleMessage);
    vi.spyOn(console, "error").mockImplementation(captureConsoleMessage);

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
          },
          {
            source: "otrs",
            label: "OTRS Community Edition 6",
            type: "otrs_family",
            urlPolicy: "required",
            fields: [
              { key: "userLogin", label: "Логин агента", secret: false },
              { key: "password", label: "Пароль", secret: true }
            ]
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: /Zendesk/i }));
    expect(screen.getByRole("radio", { name: /Zendesk/i })).toBeChecked();
    expect(document.querySelector<HTMLInputElement>('input[name="source"]')).toHaveValue("zendesk");

    fireEvent.click(screen.getByRole("radio", { name: /OTRS Community Edition 6/i }));
    expect(screen.getByRole("radio", { name: /OTRS Community Edition 6/i })).toBeChecked();
    expect(document.querySelector<HTMLInputElement>('input[name="source"]')).toHaveValue("otrs");
    expect(document.querySelector<HTMLInputElement>('input[name="baseUrl"]')).toBeInTheDocument();

    expect(
      consoleMessages.filter((message) => /uncontrolled|controlled|FieldControl/i.test(message))
    ).toEqual([]);
  });
});
