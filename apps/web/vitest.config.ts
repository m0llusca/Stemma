import { configDefaults, defineConfig } from "vitest/config";

const includeLiveTests = process.env.VITEST_INCLUDE_LIVE === "1";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: includeLiveTests ? configDefaults.exclude : [...configDefaults.exclude, "tests/live/**"]
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
