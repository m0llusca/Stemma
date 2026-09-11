import { isDemoAuthEnabled } from "@/lib/auth/demo";

/** Hardcoded docs/demo token — never a live credential when demo auth is off. */
export const demoApiToken = "qa_demo_dev_token";
export const apiTokenPlaceholder = "<API_TOKEN>";

/**
 * Value shown in admin API docs copy/paste examples.
 * Returns null when demo auth is disabled so the known token is not advertised.
 */
export function demoApiTokenForDocs() {
  return isDemoAuthEnabled() ? demoApiToken : null;
}

export function isHardcodedDemoApiToken(token: string) {
  return token === demoApiToken;
}
