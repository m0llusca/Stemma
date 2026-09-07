const localVerifyDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);
const LOCAL_VERIFY_DATABASE_NAME = "qc_app_demo_verify";
const LOCAL_VERIFY_SCHEMA = "public";

function expectedLocalVerifyDatabaseName(env: Record<string, string | undefined>): string {
  const override = env.QC_PLAYWRIGHT_DATABASE_NAME?.trim();
  return override || LOCAL_VERIFY_DATABASE_NAME;
}

function isLocalPlaywrightVerifyDatabaseUrl(
  configuredUrl: string | undefined,
  expectedDatabaseName: string
): boolean {
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
      databaseName === expectedDatabaseName &&
      parsed.searchParams.get("schema") === LOCAL_VERIFY_SCHEMA
    );
  } catch {
    return false;
  }
}

/**
 * Playwright `next start` sets NODE_ENV=production while targeting the dedicated
 * local verify DB. Bypass production demo-auth / live-cert gates only when both
 * TEST_DATABASE_URL and DATABASE_URL (the URL Prisma actually uses) independently
 * match the local verify-DB allowlist. A TEST/DATABASE mismatch is fail-closed.
 * `QC_PLAYWRIGHT_DATABASE_NAME` may whitelist a dedicated local shard name; both
 * URLs must still use that name on an allowlisted host with schema=public.
 */
export function isLocalPlaywrightVerifyDatabase(
  env: Record<string, string | undefined> = process.env
): boolean {
  const expectedDatabaseName = expectedLocalVerifyDatabaseName(env);
  return (
    isLocalPlaywrightVerifyDatabaseUrl(env.TEST_DATABASE_URL, expectedDatabaseName) &&
    isLocalPlaywrightVerifyDatabaseUrl(env.DATABASE_URL, expectedDatabaseName)
  );
}
