import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/reviews/queue/route";

const nav = readFileSync(join(process.cwd(), "src/components/app-nav.tsx"), "utf8");

describe("/reviews/queue alias", () => {
  it("redirects the legacy path with a relative Location", () => {
    const response = GET(new Request("http://0.0.0.0:3000/reviews/queue"));
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toBe("/reviews?qaStatus=QUEUED");
    expect(location?.startsWith("/")).toBe(true);
    expect(location).not.toContain("0.0.0.0");
    expect(location).not.toMatch(/^https?:\/\//);
  });

  it("keeps the pulse menu on the query filter", () => {
    expect(nav).toContain('{ href: "/reviews?qaStatus=QUEUED", label: "Очередь", value: queuedCount }');
    expect(nav).not.toContain('"/reviews/queue"');
  });
});
