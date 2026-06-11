import { describe, expect, it } from "vitest";
import { otrsConnectionProfile } from "@/lib/integrations/connect/profiles/otrs";

describe("otrs connection profile", () => {
  it("normalizeUrl keeps the /otrs base path and detects no host source", () => {
    const out = otrsConnectionProfile.normalizeUrl("https://otrs.fsa.gov.ru/otrs/index.pl?Action=AgentDashboard");
    expect(out.baseUrl).toBe("https://otrs.fsa.gov.ru/otrs");
    expect(out.hints?.basePath).toBe("/otrs");
  });
  it("collects user login and password fields", () => {
    expect(otrsConnectionProfile.credentialFields.map((f) => f.key)).toEqual(["userLogin", "password"]);
  });
});
