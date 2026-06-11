import { describe, expect, it } from "vitest";
import { getConnectionProfile, listConnectionProfiles } from "@/lib/integrations/connect/profiles";

describe("connection profile registry", () => {
  it.each([
    "zendesk",
    "freshdesk",
    "intercom",
    "hubspot",
    "jira",
    "otrs",
    "ydb",
    "ytsaurus",
    "salesforce",
    "servicenow",
    "dynamics"
  ])("resolves a profile for %s", (source) => {
    expect(getConnectionProfile(source)?.source).toBe(source);
  });

  it("returns undefined for an unknown source", () => {
    expect(getConnectionProfile("nope")).toBeUndefined();
  });

  it("marks the salesforce profile as enterprise", () => {
    expect(getConnectionProfile("salesforce")?.type).toBe("enterprise");
  });

  it("lists every registered profile", () => {
    const sources = listConnectionProfiles().map((profile) => profile.source);
    expect(sources).toEqual(
      expect.arrayContaining([
        "zendesk",
        "freshdesk",
        "intercom",
        "hubspot",
        "jira",
        "otrs",
        "znuny",
        "otobo",
        "ydb",
        "ytsaurus",
        "salesforce",
        "servicenow",
        "dynamics"
      ])
    );
  });
});
