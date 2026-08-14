const LOCAL_TEST_DATABASE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres",
  "db"
]);

const DEFAULT_PLAYWRIGHT_DATABASE_NAME = "qc_app_demo_verify";
const PLAYWRIGHT_SCHEMA = "public";

export function resolvePlaywrightTestDatabaseUrl(
  env: Record<string, string | undefined>
): string {
  const configuredUrl = env.TEST_DATABASE_URL;

  if (!configuredUrl) {
    throw new Error(
      "Playwright requires an explicit TEST_DATABASE_URL; DATABASE_URL fallback is forbidden."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
    throw new Error(
      "TEST_DATABASE_URL must use the PostgreSQL protocol (postgresql: or postgres:)."
    );
  }

  const host =
    parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]")
      ? parsed.hostname.slice(1, -1)
      : parsed.hostname;
  if (!LOCAL_TEST_DATABASE_HOSTS.has(host)) {
    throw new Error("TEST_DATABASE_URL должен указывать на локальную тестовую базу.");
  }

  const expectedDatabaseName =
    env.QC_PLAYWRIGHT_DATABASE_NAME || DEFAULT_PLAYWRIGHT_DATABASE_NAME;
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (databaseName !== expectedDatabaseName) {
    throw new Error(
      `Playwright разрешён только для dedicated database ${expectedDatabaseName}.`
    );
  }

  if (parsed.searchParams.get("schema") !== PLAYWRIGHT_SCHEMA) {
    throw new Error("TEST_DATABASE_URL должен явно содержать schema=public.");
  }

  return configuredUrl;
}
