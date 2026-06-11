/**
 * Next.js instrumentation hook (stable in Next 15+, auto-detected in src/).
 * Runs once per process on startup before any request is served.
 *
 * Validates critical env vars early so the app fails fast with a clear
 * message instead of silently starting and then crashing on the login page.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // DATABASE_URL is required — without it every DB call will throw.
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "Приложение не запущено: DATABASE_URL не задан. " +
        "Укажите DATABASE_URL в переменных окружения (например, в .env.local)."
    );
  }

  // In production the app must have a real secret; the codebase contains a
  // hardcoded non-production fallback in src/auth/config.ts that must NOT be
  // used in production.
  if (process.env.NODE_ENV === "production") {
    if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
      throw new Error(
        "Приложение не запущено: в продакшн-окружении обязательно задать AUTH_SECRET " +
          "(или NEXTAUTH_SECRET). Встроенный запасной секрет недопустим в продакшн."
      );
    }
  }
}
