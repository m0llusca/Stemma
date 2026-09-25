import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/reviews/queue/route";

const nav = readFileSync(join(process.cwd(), "src/components/app-nav.tsx"), "utf8");

describe("/reviews/queue alias", () => {
  it("redirects the legacy path to the queued status filter", () => {
    const response = GET(new Request("http://localhost/reviews/queue"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/reviews?qaStatus=QUEUED");
  });

  it("keeps the pulse menu on the query filter", () => {
    expect(nav).toContain('{ href: "/reviews?qaStatus=QUEUED", label: "Очередь", value: queuedCount }');
    expect(nav).not.toContain('"/reviews/queue"');
  });
});
