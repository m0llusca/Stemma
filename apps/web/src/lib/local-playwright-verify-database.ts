const localVerifyDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);

/** Playwright `next start` sets NODE_ENV=production while targeting the dedicated local verify DB. */
export function isLocalPlaywrightVerifyDatabase(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const configuredUrl = env.TEST_DATABASE_URL;
  if (!configuredUrl) {
    return false;
  }

  try {
    const parsed = new URL(configuredUrl);
    if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
      return false;
    }

    const host = parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]")
      ? parsed.hostname.slice(1, -1)
      : parsed.hostname;
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    return (
      localVerifyDatabaseHosts.has(host) &&
      databaseName === "qc_app_demo_verify" &&
      parsed.searchParams.get("schema") === "public"
    );
  } catch {
    return false;
  }
}
