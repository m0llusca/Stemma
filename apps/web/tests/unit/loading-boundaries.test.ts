import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.join(process.cwd(), "src/app");

const heavyRoutes = [
  "dashboard",
  "reviews",
  "reviews/[conversationId]",
  "coaching",
  "reports",
  "admin",
  "admin/integrations",
  "admin/integrations/new",
  "admin/integrations/[integrationId]",
  "admin/system",
  "admin/users"
];

describe("route loading boundaries", () => {
  it.each(heavyRoutes)("keeps %s behind a loading boundary", (routePath) => {
    expect(existsSync(path.join(appRoot, routePath, "loading.tsx"))).toBe(true);
  });
});
