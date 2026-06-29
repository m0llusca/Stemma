import { isDemoAuthEnabled } from "@/lib/current-user";

export type RuntimeCheck = {
  key: string;
  status: "ok" | "warn" | "error";
  message: string;
};

function databaseProvider(databaseUrl: string | undefined) {
  if (!databaseUrl) return "missing";
  if (databaseUrl.startsWith("file:")) return "sqlite";
  if (databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://")) return "postgresql";
  return "unknown";
}

export function getRuntimeConfigDiagnostics() {
  const databaseUrl = process.env.DATABASE_URL;
  const provider = databaseProvider(databaseUrl);
  const isProduction = process.env.NODE_ENV === "production";
  const secretKey = process.env.QC_SECRET_KEY;
  const demoAuth = isDemoAuthEnabled();
  // Non-fatal: AI scoring always works (deterministic fallback). This only reports
  // whether the live YandexGPT adapter is wired up.
  const aiScoringReady = Boolean(process.env.YANDEX_GPT_API_KEY && process.env.YANDEX_GPT_CATALOG_ID);
  const checks: RuntimeCheck[] = [
    {
      key: "database_url",
      status: databaseUrl ? "ok" : "error",
      message: databaseUrl ? `DATABASE_URL задан (${provider}).` : "DATABASE_URL не задан."
    },
    {
      key: "production_database",
      status: provider === "postgresql" ? "ok" : "error",
      message:
        provider === "postgresql"
          ? "DATABASE_URL указывает на PostgreSQL."
          : "DATABASE_URL должен указывать на PostgreSQL."
    },
    {
      key: "secret_key",
      status: isProduction && !secretKey ? "error" : secretKey ? "ok" : "warn",
      message: secretKey ? "QC_SECRET_KEY задан." : "QC_SECRET_KEY не задан, используется локальный dev-ключ."
    },
    {
      key: "demo_auth",
      status: isProduction && demoAuth ? "error" : demoAuth ? "warn" : "ok",
      message: demoAuth ? "Демо-авторизация включена." : "Демо-авторизация отключена."
    },
    {
      key: "ai_scoring",
      status: aiScoringReady ? "ok" : "warn",
      message: aiScoringReady
        ? "AI-оценка использует YandexGPT (yandexgpt): ключ и каталог заданы."
        : "AI-оценка использует детерминированный fallback: задайте YANDEX_GPT_API_KEY и YANDEX_GPT_CATALOG_ID для YandexGPT."
    }
  ];

  const status = checks.some((check) => check.status === "error")
    ? "error"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "ok";

  return {
    status,
    environment: process.env.NODE_ENV ?? "development",
    databaseProvider: provider,
    checks
  };
}
