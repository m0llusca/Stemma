// Client-side bridge for server-action results. On some page loads the
// Next.js 16.2.x client router accepts the action POST (the mutation lands
// and the response arrives) but never commits the result or the redirect.
// The bridge observes action POST responses through a light fetch wrapper and
// hands the decoded result — or the redirect target — to the form that
// submitted, so the flow can finish without depending on the router commit.

export type ActionResultBridgeEvent =
  | { kind: "result"; value: unknown }
  | { kind: "redirect"; href: string };

type ActionResultListener = (event: ActionResultBridgeEvent) => void;

// Mockable navigation indirection (same pattern as reportLocationNavigation).
export const actionFlowNavigation = {
  assign(href: string) {
    window.location.assign(href);
  },
  reload() {
    window.location.reload();
  }
};

let wrappedFetch: typeof window.fetch | null = null;
let pendingListener: ActionResultListener | null = null;
let latestNavigationFallbackToken = 0;

/**
 * Arms a fallback for an SPA navigation started elsewhere (e.g. a Link
 * click). When the address bar has not reached `href` shortly after, the
 * transition is forced with a full document navigation — the Next 16.2.x
 * client router can silently drop the commit on some page loads. Only the
 * most recently armed fallback may fire, so rapid consecutive clicks do not
 * race each other.
 */
export function scheduleNavigationCommitFallback(href: string) {
  const token = ++latestNavigationFallbackToken;
  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    if (token !== latestNavigationFallbackToken) {
      window.clearInterval(timer);
      return;
    }

    let reached = false;
    try {
      const target = new URL(href, window.location.href);
      reached =
        `${target.pathname}${target.search}` ===
        `${window.location.pathname}${window.location.search}`;
    } catch {
      reached = false;
    }

    if (reached) {
      window.clearInterval(timer);
      return;
    }

    if (Date.now() - startedAt >= 2000) {
      window.clearInterval(timer);
      actionFlowNavigation.assign(href);
    }
  }, 150);
}

/**
 * Extracts the action return value from a server-action flight response. The
 * root row carries the result in `a`, either inlined or as a `$@<row>`
 * reference. Anything unrecognized yields undefined — callers fall back to
 * the router's own (healthy) delivery.
 */
export function parseActionResultFromFlight(flightText: string): unknown {
  const rows = new Map<string, string>();
  for (const line of flightText.split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    rows.set(line.slice(0, separator), line.slice(separator + 1));
  }

  const root = rows.get("0");
  if (!root) return undefined;

  try {
    const parsed: unknown = JSON.parse(root);
    if (!parsed || typeof parsed !== "object" || !("a" in parsed)) {
      return undefined;
    }
    const value = (parsed as { a: unknown }).a;
    if (typeof value === "string" && value.startsWith("$")) {
      const referencedRow = rows.get(value.replace(/^\$@?/, ""));
      return referencedRow === undefined ? undefined : JSON.parse(referencedRow);
    }
    return value;
  } catch {
    return undefined;
  }
}

/** Reads the intended navigation target of a redirect-style action response. */
export function actionRedirectFromResponse(response: {
  status: number;
  redirected: boolean;
  url: string;
  headers: Headers;
}): string | null {
  const actionRedirect = response.headers.get("x-action-redirect");
  if (actionRedirect) {
    const [target] = actionRedirect.split(";");
    if (target) return target;
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) return location;
  }
  if (response.redirected && response.url) {
    return response.url;
  }
  return null;
}

function emit(event: ActionResultBridgeEvent) {
  const listener = pendingListener;
  pendingListener = null;
  listener?.(event);
}

async function inspectActionResponse(response: Response) {
  const redirectHref = actionRedirectFromResponse(response);
  if (redirectHref) {
    emit({ kind: "redirect", href: redirectHref });
    return;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/x-component")) return;
  const text = await response.text();
  const value = parseActionResultFromFlight(text);
  if (value !== undefined) {
    emit({ kind: "result", value });
  }
}

function installBridge() {
  // Re-wrap whenever the global fetch changed (e.g. a test re-stubbed it);
  // in production this wraps exactly once.
  if (wrappedFetch !== null && window.fetch === wrappedFetch) {
    return;
  }
  const original = window.fetch;
  const wrapper = ((input: RequestInfo | URL, init?: RequestInit) => {
    const request = original(input, init);
    try {
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      );
      if (method === "POST" && headers.has("next-action")) {
        void request
          .then((response) => inspectActionResponse(response.clone()))
          .catch(() => undefined);
      }
    } catch {
      // The bridge must never disturb the underlying request.
    }
    return request;
  }) as typeof window.fetch;
  wrappedFetch = wrapper;
  window.fetch = wrapper;
}

/**
 * Registers the listener for the next server-action response. At most one
 * capture is pending at a time — forms arm it from their submit event, so the
 * response always goes to the form the user actually submitted.
 */
export function captureNextActionResult(
  listener: ActionResultListener
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  installBridge();
  pendingListener = listener;
  return () => {
    if (pendingListener === listener) {
      pendingListener = null;
    }
  };
}
