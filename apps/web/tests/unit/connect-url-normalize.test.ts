import { describe, expect, it } from "vitest";
import { normalizeHelpdeskBaseUrl, extractTicketIdFromPath, detectSourceFromHost } from "@/lib/integrations/connect/url-normalize";

describe("normalizeHelpdeskBaseUrl", () => {
  it("strips OTRS index.pl path to the base", () => {
    expect(normalizeHelpdeskBaseUrl("https://otrs.fsa.gov.ru/otrs/index.pl?Action=AgentDashboard").baseUrl).toBe("https://otrs.fsa.gov.ru/otrs");
  });
  it("reduces a Zendesk agent ticket url to origin", () => {
    expect(normalizeHelpdeskBaseUrl("https://acme.zendesk.com/agent/tickets/123").baseUrl).toBe("https://acme.zendesk.com");
  });
  it("reduces a Jira browse url to origin", () => {
    expect(normalizeHelpdeskBaseUrl("https://acme.atlassian.net/browse/SUP-42").baseUrl).toBe("https://acme.atlassian.net");
  });
});

describe("extractTicketIdFromPath", () => {
  it("pulls a Zendesk ticket id", () => {
    expect(extractTicketIdFromPath("https://acme.zendesk.com/agent/tickets/123")).toBe("123");
  });
  it("pulls a Jira issue key", () => {
    expect(extractTicketIdFromPath("https://acme.atlassian.net/browse/SUP-42")).toBe("SUP-42");
  });
  it("returns undefined when no id present", () => {
    expect(extractTicketIdFromPath("https://acme.zendesk.com")).toBeUndefined();
  });
});

describe("detectSourceFromHost", () => {
  it.each([
    ["https://acme.zendesk.com", "zendesk"],
    ["https://acme.freshdesk.com", "freshdesk"],
    ["https://acme.atlassian.net", "jira"],
    ["https://acme.service-now.com", "servicenow"]
  ])("maps %s to %s", (url, source) => {
    expect(detectSourceFromHost(url)).toBe(source);
  });
  it("returns undefined for a self-hosted host", () => {
    expect(detectSourceFromHost("https://otrs.fsa.gov.ru/otrs")).toBeUndefined();
  });
});
