import { describe, expect, it } from "vitest";
import { dataSourceContracts, dataSourceSources } from "@/lib/integrations/data-source-adapters/source-contracts";

describe("data source adapter contracts", () => {
  it("records YDB and YTsaurus as tabular data sources", () => {
    expect(dataSourceSources).toEqual(["ydb", "ytsaurus"]);
    expect(dataSourceContracts.ydb).toMatchObject({
      source: "ydb",
      displayName: "YDB",
      type: "data_source",
      authModes: ["static_credentials"],
      requiredSecrets: ["data_source_credentials"]
    });
    expect(dataSourceContracts.ydb.authModes).not.toContain("token");
    expect(dataSourceContracts.ytsaurus).toMatchObject({
      source: "ytsaurus",
      displayName: "YTsaurus/YT",
      type: "data_source",
      requiredSecrets: ["data_source_token"]
    });
  });

  it("keeps live certification gated for tabular sources", () => {
    for (const source of dataSourceSources) {
      expect(dataSourceContracts[source].certification.summary.productionReady).toBe(false);
      expect(dataSourceContracts[source].certification.gates.live).toBe("waiting_for_access");
    }
  });
});
