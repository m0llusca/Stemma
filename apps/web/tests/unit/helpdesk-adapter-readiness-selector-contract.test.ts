import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const helpdeskAdapterReadinessSource = readFileSync(
  join(process.cwd(), "tests/e2e/helpdesk-adapter-readiness.spec.ts"),
  "utf8"
);

describe("helpdesk adapter readiness selector contract", () => {
  it("does not target the removed CardTitle implementation slot", () => {
    expect(helpdeskAdapterReadinessSource).not.toContain('data-slot="card-title"');
  });

  it("asserts radio state independently of the underlying implementation", () => {
    expect(helpdeskAdapterReadinessSource).not.toContain(
      'toHaveAttribute("aria-checked"'
    );
  });

  it("keeps checked-state coverage for every selected adapter", () => {
    expect(helpdeskAdapterReadinessSource.match(/\.toBeChecked\(\)/g)).toHaveLength(3);
  });

  it("requires the semantic level-two setup heading selector", () => {
    expect(helpdeskAdapterReadinessSource).toContain(
      'page.getByRole("heading", { name: "Подключение источника", level: 2 })'
    );
  });

  it("checks the whole setup surface for live-certification overclaiming", () => {
    expect(
      helpdeskAdapterReadinessSource.match(
        /page\.getByRole\("main"\)\)\.not\.toContainText\("Живая сертификация пройдена"\)/g
      ) ?? []
    ).toHaveLength(2);
  });
});
