/**
 * Pure seed guard — no Prisma, no side-effects.
 * Extracted so it can be unit-tested without importing the full seed script
 * (which calls main() at module level and invokes process.exit on error).
 */

/** Known-safe local hostnames that the seed script is allowed to run against without an explicit override. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);

/**
 * Throws a Russian-language error when the seed script must not run.
 * Accepts an env-like object so callers can pass any mapping without touching process.env.
 *
 * `ALLOW_SEED=1` may bypass target-host checks for controlled non-production
 * environments. Production is always denied.
 */
export function assertSeedAllowed(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Сид-скрипт нельзя запускать в продакшн-окружении (NODE_ENV=production)."
    );
  }

  if (env.ALLOW_SEED === "1") return;

  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "DATABASE_URL не задан — невозможно определить целевую базу данных. " +
        "Для принудительного запуска установите ALLOW_SEED=1."
    );
  }

  let rawHost: string;
  try {
    rawHost = new URL(dbUrl).hostname;
  } catch {
    throw new Error(
      "DATABASE_URL не является корректным URL — невозможно проверить хост базы данных. " +
        "Для принудительного запуска установите ALLOW_SEED=1."
    );
  }

  // new URL() wraps IPv6 addresses in brackets: "[::1]" → strip them.
  const host = rawHost.startsWith("[") && rawHost.endsWith("]") ? rawHost.slice(1, -1) : rawHost;

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Сид-скрипт запрещён: хост базы данных «${host}» не является локальным. ` +
        "Допустимые хосты: localhost, 127.0.0.1, ::1, postgres, db. " +
        "Для принудительного запуска установите ALLOW_SEED=1."
    );
  }
}
