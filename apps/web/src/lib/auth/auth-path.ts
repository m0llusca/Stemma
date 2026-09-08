// Dependency-free: used by edge `proxy.ts` and by AppNav chrome gates.
export const AUTH_PATHNAME_HEADER = "x-stemma-pathname";

export function isAuthPath(pathname: string) {
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

export function normalizeRequestPathname(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }

  const [path = ""] = value.split("?");
  return path || null;
}
