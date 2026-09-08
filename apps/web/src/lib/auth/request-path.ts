import { headers } from "next/headers";
import { AUTH_PATHNAME_HEADER, isAuthPath, normalizeRequestPathname } from "@/lib/auth/auth-path";

export async function getRequestPathname() {
  const headerStore = await headers();
  return normalizeRequestPathname(headerStore.get(AUTH_PATHNAME_HEADER));
}

export async function isAuthEntryRequest() {
  const pathname = await getRequestPathname();
  return pathname != null && isAuthPath(pathname);
}
