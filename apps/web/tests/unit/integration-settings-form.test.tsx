import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntegrationSettingsForm } from "@/components/integrations/integration-settings-form";

vi.mock("@/lib/integration-actions", () => ({
  saveIntegrationConfigurationState: vi.fn()
}));

const configJson = JSON.stringify({
  setupVersion: 1,
  ticketId: "42",
  userLogin: "agent@example.com",
  filters: { queue: "support", status: "open" },
  dryRun: false,
  deduplicate: true
});

const baseIntegration = {
  source: "zendesk",
  displayName: "Zendesk Support",
  type: "native_helpdesk",
  baseUrl: "https://example.zendesk.com",
  importLimit: 200,
  batchSize: 40,
  dateRangeDays: 45,
  configJson
};

function renderForm(overrides: Partial<typeof baseIntegration> = {}) {
  return render(<IntegrationSettingsForm integration={{ ...baseIntegration, ...overrides }} />);
}

function input(container: HTMLElement, selector: string) {
  return container.querySelector(selector) as HTMLInputElement | null;
}

describe("integration settings form", () => {
  it("prefills name, base URL and import limits from the integration", () => {
    const { container } = renderForm();

    const sourceLabel = input(container, 'input[name="sourceLabel"]');
    expect(sourceLabel?.value).toBe("Zendesk Support");
    expect(sourceLabel?.required).toBe(true);

    const baseUrl = input(container, 'input[name="baseUrl"]');
    expect(baseUrl?.value).toBe("https://example.zendesk.com");
    expect(baseUrl?.type).toBe("url");

    expect(input(container, 'input[name="maxTickets"]')?.value).toBe("200");
    expect(input(container, 'input[name="batchSize"]')?.value).toBe("40");
    expect(input(container, 'input[name="dateRangeDays"]')?.value).toBe("45");
  });

  it("carries source and mode through hidden fields", () => {
    const { container } = renderForm();

    const source = input(container, 'input[type="hidden"][name="source"]');
    expect(source?.value).toBe("zendesk");

    const mode = input(container, 'input[type="hidden"][name="mode"]');
    expect(mode?.value).toBe("native_helpdesk");
  });

  it("preserves wizard config fields (userLogin, ticketId, filters, dryRun, deduplicate, configJson) as hidden inputs", () => {
    const { container } = renderForm();

    expect(input(container, 'input[type="hidden"][name="userLogin"]')?.value).toBe("agent@example.com");
    expect(input(container, 'input[type="hidden"][name="ticketId"]')?.value).toBe("42");
    expect(input(container, 'input[type="hidden"][name="queueFilter"]')?.value).toBe("support");
    expect(input(container, 'input[type="hidden"][name="statusFilter"]')?.value).toBe("open");
    expect(input(container, 'input[type="hidden"][name="dryRun"]')?.value).toBe("false");
    expect(input(container, 'input[type="hidden"][name="deduplicate"]')?.value).toBe("true");
    expect(input(container, 'input[type="hidden"][name="configJson"]')?.value).toBe(configJson);
  });

  it("renders an empty password field for the secret with a keep-existing hint", () => {
    const { container } = renderForm();

    const secret = input(container, 'input[name="nativeToken"]');
    expect(secret).not.toBeNull();
    expect(secret?.type).toBe("password");
    expect(secret?.value).toBe("");
    expect(secret?.required).toBe(false);
    expect(container.textContent).toContain("Оставьте пустым, чтобы не менять сохранённый ключ");
  });

  it("maps the secret field name to the source mode", () => {
    const otrs = renderForm({ type: "otrs_family" });
    expect(input(otrs.container, 'input[name="password"][type="password"]')).not.toBeNull();
    otrs.unmount();

    const dataSource = renderForm({ type: "data_source", source: "ytsaurus" });
    expect(input(dataSource.container, 'input[name="dataSourceSecret"][type="password"]')).not.toBeNull();
    dataSource.unmount();

    const customApi = renderForm({ type: "custom_api" });
    expect(customApi.container.querySelector('input[type="password"]')).toBeNull();
  });

  it("keeps the submit button enabled (pending-only disable pattern)", () => {
    const { container } = renderForm();
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement | null;

    expect(submit?.textContent).toContain("Сохранить настройки");
    expect(submit?.disabled).toBe(false);
  });
});
