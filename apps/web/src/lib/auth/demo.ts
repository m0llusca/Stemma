// ВАЖНО: модуль без зависимостей (никаких prisma/next-импортов),
// потому что он используется в middleware (src/proxy.ts, edge runtime).
export function isDemoAuthEnabled() {
  return process.env.QC_DEMO_AUTH === "enabled";
}
