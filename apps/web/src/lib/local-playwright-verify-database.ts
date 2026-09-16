const localVerifyDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);
const loopbackVerifyHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCAL_VERIFY_DATABASE_NAME = "qc_app_demo_verify";
const LOCAL_VERIFY_SCHEMA = "public";
const DEFAULT_POSTGRES_PORT = "5432";
const NORMALIZED_LOOPBACK_HOST = "loopback";

type LocalVerifyDatabaseIdentity = {
  host: string;
  port: string;
  databaseName: string;
  schema: string;
};

function expectedLocalVerifyDatabaseName(env: Record<string, string | undefined>): string {
  const override = env.QC_PLAYWRIGHT_DATABASE_NAME?.trim();
  return override || LOCAL_VERIFY_DATABASE_NAME;
}

function unwrapHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function normalizeLocalVerifyHost(host: string): string {
  return loopbackVerifyHosts.has(host) ? NORMALIZED_LOOPBACK_HOST : host;
}

function parseLocalPlaywrightVerifyDatabaseUrl(
  configuredUrl: string | undefined,
  expectedDatabaseName: string
): LocalVerifyDatabaseIdentity | null {
  if (!configuredUrl) {
    return null;
  }

  try {
    const parsed = new URL(configuredUrl);
    if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
      return null;
    }

    const host = unwrapHostname(parsed.hostname);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    const schema = parsed.searchParams.get("schema");
    if (
      !localVerifyDatabaseHosts.has(host) ||
      databaseName !== expectedDatabaseName ||
      schema !== LOCAL_VERIFY_SCHEMA
    ) {
      return null;
    }

    return {
      host: normalizeLocalVerifyHost(host),
      port: parsed.port || DEFAULT_POSTGRES_PORT,
      databaseName,
      schema
    };
  } catch {
    return null;
  }
}

function sameLocalVerifyIdentity(
  left: LocalVerifyDatabaseIdentity,
  right: LocalVerifyDatabaseIdentity
): boolean {
  return (
    left.host === right.host &&
    left.port === right.port &&
    left.databaseName === right.databaseName &&
    left.schema === right.schema
  );
}

/**
 * Playwright `next start` sets NODE_ENV=production while targeting the dedicated
 * local verify DB. Bypass production demo-auth / live-cert gates only when both
 * TEST_DATABASE_URL and DATABASE_URL (the URL Prisma actually uses) match the
 * local verify-DB allowlist and share one identity: normalized host + port +
 * database name + schema=public. Loopback hosts (`localhost`, `127.0.0.1`,
 * `::1`) are the same host. `postgres` / `db` stay allowlisted but are distinct
 * from loopback and from each other. A TEST/DATABASE mismatch is fail-closed.
 * `QC_PLAYWRIGHT_DATABASE_NAME` may whitelist a dedicated local shard name; both
 * URLs must still use that name on an allowlisted host with schema=public.
 */
export function isLocalPlaywrightVerifyDatabase(
  env: Record<string, string | undefined> = process.env
): boolean {
  const expectedDatabaseName = expectedLocalVerifyDatabaseName(env);
  const testIdentity = parseLocalPlaywrightVerifyDatabaseUrl(
    env.TEST_DATABASE_URL,
    expectedDatabaseName
  );
  const databaseIdentity = parseLocalPlaywrightVerifyDatabaseUrl(
    env.DATABASE_URL,
    expectedDatabaseName
  );

  return Boolean(
    testIdentity &&
      databaseIdentity &&
      sameLocalVerifyIdentity(testIdentity, databaseIdentity)
  );
}
