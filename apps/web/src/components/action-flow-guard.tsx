"use client";

import * as React from "react";
import {
  actionFlowNavigation,
  captureNextActionResult,
  type ActionResultBridgeEvent
} from "@/lib/action-result-bridge";

const REDIRECT_FALLBACK_DELAY_MS = 1500;
const REDIRECT_FALLBACK_POLL_MS = 100;

function sameUrl(href: string) {
  try {
    const url = new URL(href, window.location.href);
    return (
      `${url.pathname}${url.search}` ===
      `${window.location.pathname}${window.location.search}`
    );
  } catch {
    return false;
  }
}

/**
 * After a redirect-style action response, the healthy router commits the
 * navigation within a few hundred milliseconds (the address bar reaches the
 * target, or — for redirects back to the current URL — the committed history
 * state changes). When no commit lands, force the transition with a full
 * document navigation.
 */
export function scheduleRedirectFallback(href: string) {
  const stateSnapshot = JSON.stringify(window.history.state);
  const initiallyAtTarget = sameUrl(href);
  const deadline = Date.now() + REDIRECT_FALLBACK_DELAY_MS;
  const timer = window.setInterval(() => {
    // A healthy SPA commit either moves the address bar to the target or —
    // for redirects back to the current URL — replaces the history state.
    const committed =
      JSON.stringify(window.history.state) !== stateSnapshot ||
      (!initiallyAtTarget && sameUrl(href));
    if (committed) {
      window.clearInterval(timer);
      return;
    }
    if (Date.now() >= deadline) {
      window.clearInterval(timer);
      if (initiallyAtTarget) {
        actionFlowNavigation.reload();
      } else {
        actionFlowNavigation.assign(href);
      }
    }
  }, REDIRECT_FALLBACK_POLL_MS);
}

/**
 * Drop into an action form to keep its result flow working when the client
 * router drops the action commit: `onResult` receives the decoded return
 * value, and redirects fall back to a full navigation when no SPA commit
 * lands. Renders nothing.
 */
export function ActionFlowGuard({
  onResult,
  onRedirect
}: {
  onResult?: (value: unknown) => void;
  onRedirect?: (href: string) => void;
}) {
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const onResultRef = React.useRef(onResult);
  onResultRef.current = onResult;
  const onRedirectRef = React.useRef(onRedirect);
  onRedirectRef.current = onRedirect;

  React.useEffect(() => {
    const form = hostRef.current?.closest("form");
    if (!form) return;

    let disarm: (() => void) | null = null;
    const arm = () => {
      disarm?.();
      disarm = captureNextActionResult((event: ActionResultBridgeEvent) => {
        if (event.kind === "result") {
          onResultRef.current?.(event.value);
          return;
        }
        const handler = onRedirectRef.current;
        if (handler) {
          handler(event.href);
        } else {
          scheduleRedirectFallback(event.href);
        }
      });
    };

    form.addEventListener("submit", arm);
    return () => {
      form.removeEventListener("submit", arm);
      disarm?.();
    };
  }, []);

  return <span ref={hostRef} hidden aria-hidden="true" />;
}
