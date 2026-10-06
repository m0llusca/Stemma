import { configDefaults, defineConfig } from "vitest/config";

const includeLiveTests = process.env.VITEST_INCLUDE_LIVE === "1";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: [...configDefaults.exclude, "tests/live/**"],
    projects: [
      { extends: true, test: { name: "app", setupFiles: ["./tests/setup-dom.ts"] } },
      ...(includeLiveTests ? [{ extends: true as const, test: { name: "live", environment: "node", include: ["tests/live/**/*.test.ts"], exclude: configDefaults.exclude } }] : [])
    ]
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
