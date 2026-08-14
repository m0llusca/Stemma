"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { XIcon } from "lucide-react";
import type { ReportEvidenceResult } from "@/lib/reports/report-evidence";
import {
  rebaseReportEvidenceHref
} from "@/lib/reports/report-evidence-links";

const evidenceInteractiveSelector =
  'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
const evidenceTypes = new Set(["trend", "driver", "matrix", "kpi"]);
const evidenceKeyPattern = /^ev1_[A-Za-z0-9_-]{43}$/;

function reportEvidenceUrl(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) return undefined;
  try {
    const url = new URL(href, "https://report-evidence.local");
    return url.pathname === "/reports" ? url : undefined;
  } catch {
    return undefined;
  }
}

function trustedOpenEvidenceHref(openHref: string) {
  const url = reportEvidenceUrl(openHref);
  const types = url?.searchParams.getAll("evidenceType") ?? [];
  const keys = url?.searchParams.getAll("evidenceKey") ?? [];
  return types.length === 1 &&
    keys.length === 1 &&
    evidenceTypes.has(types[0]) &&
    evidenceKeyPattern.test(keys[0])
    ? openHref
    : undefined;
}

function trustedCloseEvidenceHref(closeHref: string) {
  const url = reportEvidenceUrl(closeHref);
  return url &&
    !url.searchParams.has("evidenceType") &&
    !url.searchParams.has("evidenceKey")
    ? closeHref
    : undefined;
}

function evidenceIdentity(
  evidenceType: string | null | undefined,
  evidenceKey: string | null | undefined
) {
  return evidenceType &&
    evidenceKey &&
    evidenceTypes.has(evidenceType) &&
    evidenceKeyPattern.test(evidenceKey)
    ? `${evidenceType}:${evidenceKey}`
    : null;
}

function evidenceIdentityFromSearchParams(searchParams: {
  getAll(name: string): string[];
}) {
  const types = searchParams.getAll("evidenceType");
  const keys = searchParams.getAll("evidenceKey");
  return types.length === 1 && keys.length === 1
    ? evidenceIdentity(types[0], keys[0])
    : null;
}

// Mirrors unavailableReportEvidence from the server evidence module; kept
// local so this client bundle never imports that server-only module.
const onDemandUnavailableEvidence: ReportEvidenceResult = {
  status: "unavailable",
  title: "Данные больше недоступны",
  description:
    "Выбранный фрагмент нельзя открыть. Обновите отчёт и попробуйте снова.",
  rows: []
};

function onDemandEvidenceResult(value: unknown): ReportEvidenceResult {
  const candidate = value as ReportEvidenceResult | null;
  if (
    candidate &&
    (candidate.status === "ready" || candidate.status === "unavailable") &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.rows)
  ) {
    return candidate;
  }
  return onDemandUnavailableEvidence;
}

function evidenceTriggerId(openHref: string) {
  const trustedHref = trustedOpenEvidenceHref(openHref);
  if (trustedHref) {
    const url = reportEvidenceUrl(trustedHref);
    const type = url?.searchParams.get("evidenceType");
    const key = url?.searchParams.get("evidenceKey");
    if (type && key) return `report-evidence-trigger-${type}-${key}`;
  }
  return "report-evidence-trigger";
}

function synchronizeEvidenceLinkIds() {
  const positions = new Map<string, number>();
  document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const baseId = evidenceTriggerId(anchor.getAttribute("href") ?? "");
    if (baseId === "report-evidence-trigger") return;
    const position = (positions.get(baseId) ?? 0) + 1;
    positions.set(baseId, position);
    const existingMarker = anchor.getAttribute("data-report-evidence-trigger");
    if (existingMarker && !existingMarker.startsWith(`${baseId}-link-`)) {
      return;
    }
    const id = `${baseId}-link-${position}`;
    anchor.id = id;
    anchor.setAttribute("data-report-evidence-trigger", id);
  });
}

function evidenceFocusOrigin(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return undefined;
  if (
    target.hasAttribute("data-report-evidence-trigger") ||
    target.matches('[data-accessibility-layer="app-owned"]')
  ) {
    return target;
  }
  if (target instanceof HTMLAnchorElement) {
    const href = target.getAttribute("href");
    if (!href) return undefined;
    const baseId = evidenceTriggerId(href);
    if (baseId !== "report-evidence-trigger") {
      const matchingAnchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a[href]")
      ).filter(
        (anchor) =>
          evidenceTriggerId(anchor.getAttribute("href") ?? "") === baseId
      );
      const position = matchingAnchors.indexOf(target);
      const id = `${baseId}-link-${Math.max(0, position) + 1}`;
      target.id = id;
      target.setAttribute("data-report-evidence-trigger", id);
      return target;
    }
  }
  return undefined;
}

function evidenceTriggerFromHost(host: HTMLElement | null) {
  const trigger = host?.firstElementChild;
  return trigger instanceof HTMLElement ? trigger : undefined;
}

const sheetTabbableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The floating-UI focus guards around the popup redirect focus on the next
// animation frame, so a fast keyboard read can land on the hidden sentinel
// outside the sheet. Wrapping at the first/last tabbable keeps every Tab and
// Shift+Tab stop inside the sheet without waiting for a frame.
function wrapSheetTabFocus(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab" || event.defaultPrevented) {
    return;
  }
  const content = event.currentTarget;
  const tabbables = Array.from(
    content.querySelectorAll<HTMLElement>(sheetTabbableSelector)
  );
  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];
  if (!first || !last) {
    return;
  }
  const active = document.activeElement;
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return;
  }
  if (event.shiftKey && (active === first || active === content)) {
    event.preventDefault();
    last.focus();
  }
}

function acceptedEvidenceTrigger(
  host: HTMLElement | null,
  eventTarget: EventTarget | null
) {
  const trigger = evidenceTriggerFromHost(host);
  const target =
    eventTarget instanceof Element
      ? eventTarget
      : eventTarget instanceof Node
        ? eventTarget.parentElement
        : null;
  if (!trigger || !target || (target !== trigger && !trigger.contains(target))) {
    return undefined;
  }
  return target.closest(evidenceInteractiveSelector) === trigger
    ? trigger
    : undefined;
}

function finalizedDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Дата не указана"
    : date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      });
}

export function ReportEvidenceSheet({
  evidence,
  open,
  resolvedEvidenceIdentity,
  defaultEvidence,
  openHref,
  closeHref,
  chartHeadingId,
  children
}: {
  evidence: ReportEvidenceResult;
  open: boolean;
  resolvedEvidenceIdentity: string | null;
  defaultEvidence?: {
    identity: string;
    result: ReportEvidenceResult;
  };
  openHref: string;
  closeHref: string;
  chartHeadingId: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contentRef = React.useRef<HTMLDivElement>(null);
  const focusOriginRef = React.useRef<HTMLElement | null>(null);
  const focusOriginIdRef = React.useRef<string | null>(null);
  const triggerHostRef = React.useRef<HTMLSpanElement>(null);
  const enterActivationRef = React.useRef<HTMLElement | null>(null);
  const [dismissedEvidenceIdentity, setDismissedEvidenceIdentity] =
    React.useState<string | null>(null);
  const [fetchedEvidence, setFetchedEvidence] = React.useState<{
    identity: string;
    result: ReportEvidenceResult;
  } | null>(null);
  const triggerId = evidenceTriggerId(openHref);
  const currentEvidenceIdentity =
    evidenceIdentityFromSearchParams(searchParams);
  const serverPayloadMatchesUrl =
    open &&
    resolvedEvidenceIdentity !== null &&
    currentEvidenceIdentity === resolvedEvidenceIdentity;
  // The default payload ships with the page, so the Sheet may open whenever
  // the address bar asks for it — including after a native-history Back or
  // Forward that never reaches the server.
  const localPayloadMatchesUrl =
    defaultEvidence !== undefined &&
    currentEvidenceIdentity === defaultEvidence.identity;
  const fetchedPayloadMatchesUrl =
    fetchedEvidence !== null &&
    currentEvidenceIdentity === fetchedEvidence.identity;
  const payloadMatchesUrl =
    serverPayloadMatchesUrl ||
    localPayloadMatchesUrl ||
    fetchedPayloadMatchesUrl;
  const activeEvidence = localPayloadMatchesUrl && defaultEvidence
    ? defaultEvidence.result
    : fetchedPayloadMatchesUrl && fetchedEvidence
      ? fetchedEvidence.result
      : evidence;
  const sheetOpen =
    payloadMatchesUrl &&
    dismissedEvidenceIdentity !== currentEvidenceIdentity;

  React.useEffect(() => {
    if (currentEvidenceIdentity === null) {
      setDismissedEvidenceIdentity(null);
    }
  }, [currentEvidenceIdentity]);

  // A URL-carried evidence identity that neither the server payload nor the
  // bundled default covers (e.g. Enter on a chart point) is resolved on
  // demand. The App Router can drop navigation commits on a fresh page load
  // (Next 16.2.x), so the Sheet fetches the payload instead of waiting for an
  // RSC commit that may never arrive.
  React.useEffect(() => {
    const identity = currentEvidenceIdentity;
    if (!identity) {
      return;
    }
    if (open && identity === resolvedEvidenceIdentity) {
      return;
    }
    if (defaultEvidence && identity === defaultEvidence.identity) {
      return;
    }
    if (fetchedEvidence && fetchedEvidence.identity === identity) {
      return;
    }

    let cancelled = false;
    fetch(`/api/reports/evidence${window.location.search}`, {
      headers: { accept: "application/json" }
    })
      .then(async (response) => {
        const result = response.ok
          ? onDemandEvidenceResult(await response.json())
          : onDemandUnavailableEvidence;
        if (!cancelled) {
          setFetchedEvidence({ identity, result });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedEvidence({
            identity,
            result: onDemandUnavailableEvidence
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    currentEvidenceIdentity,
    open,
    resolvedEvidenceIdentity,
    defaultEvidence,
    fetchedEvidence
  ]);

  React.useEffect(() => {
    function rememberOrigin(event: Event) {
      const origin = evidenceFocusOrigin(event.target);
      if (origin) {
        focusOriginRef.current = origin;
        focusOriginIdRef.current = origin.id || null;
      }
    }

    document.addEventListener("focusin", rememberOrigin, true);
    document.addEventListener("click", rememberOrigin, true);
    const activeOrigin = evidenceFocusOrigin(document.activeElement);
    if (activeOrigin) {
      focusOriginRef.current = activeOrigin;
      focusOriginIdRef.current = activeOrigin.id || null;
    }
    return () => {
      document.removeEventListener("focusin", rememberOrigin, true);
      document.removeEventListener("click", rememberOrigin, true);
    };
  }, []);

  React.useLayoutEffect(() => {
    synchronizeEvidenceLinkIds();
  });

  const finalFocus = React.useCallback(() => {
    if (focusOriginRef.current?.isConnected) {
      return focusOriginRef.current;
    }
    if (focusOriginIdRef.current) {
      const replacement = document.getElementById(focusOriginIdRef.current);
      if (replacement) {
        focusOriginRef.current = replacement;
        return replacement;
      }
    }
    const heading = document.getElementById(chartHeadingId);
    if (heading && !heading.hasAttribute("tabindex")) {
      heading.tabIndex = -1;
    }
    return heading;
  }, [chartHeadingId]);

  const navigateOpen = React.useCallback(() => {
    const href = trustedOpenEvidenceHref(openHref);
    if (!href) return;
    setDismissedEvidenceIdentity(null);
    const url = reportEvidenceUrl(href);
    const identity = evidenceIdentity(
      url?.searchParams.get("evidenceType"),
      url?.searchParams.get("evidenceKey")
    );
    if (defaultEvidence && identity === defaultEvidence.identity) {
      const liveHref = `${window.location.pathname}${window.location.search}`;
      const rebased = rebaseReportEvidenceHref(href, liveHref);
      if (!rebased.rebased) {
        window.history.pushState(null, "", href);
        return;
      }
      // The prop's pair was minted for the server-rendered state; pushing it
      // would silently rewrite live filters and fail to resolve after a
      // reload. Mint the same descriptor for the live state first, then push.
      fetch(
        `/api/reports/evidence${window.location.search}&from=${encodeURIComponent(href)}`,
        { headers: { accept: "application/json" } }
      )
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { href?: unknown; result?: unknown } | null) => {
          // The user moved on while the mint was in flight.
          if (`${window.location.pathname}${window.location.search}` !== liveHref) {
            return;
          }
          const nextHref =
            payload && typeof payload.href === "string" ? payload.href : null;
          const nextUrl = nextHref ? reportEvidenceUrl(nextHref) : undefined;
          const nextIdentity = evidenceIdentity(
            nextUrl?.searchParams.get("evidenceType"),
            nextUrl?.searchParams.get("evidenceKey")
          );
          if (!nextHref || !nextIdentity) {
            window.history.pushState(null, "", rebased.href);
            return;
          }
          setFetchedEvidence({
            identity: nextIdentity,
            result: onDemandEvidenceResult(payload?.result)
          });
          window.history.pushState(null, "", nextHref);
        })
        .catch(() => {
          if (`${window.location.pathname}${window.location.search}` === liveHref) {
            window.history.pushState(null, "", rebased.href);
          }
        });
      return;
    }
    router.push(href, { scroll: false });
  }, [defaultEvidence, openHref, router]);

  React.useLayoutEffect(() => {
    const trigger = evidenceTriggerFromHost(triggerHostRef.current);
    if (!trigger) return;
    trigger.id = triggerId;
    trigger.setAttribute("data-report-evidence-trigger", triggerId);
  }, [children, triggerId]);

  const trigger = children ? (
    <span
      ref={triggerHostRef}
      className="contents"
      onClick={(event) => {
        const origin = acceptedEvidenceTrigger(
          event.currentTarget,
          event.target
        );
        if (!origin) return;
        focusOriginRef.current = origin;
        focusOriginIdRef.current = origin.id || null;
        if (event.defaultPrevented) return;
        event.preventDefault();
        if (enterActivationRef.current === origin && event.detail === 0) {
          enterActivationRef.current = null;
          return;
        }
        navigateOpen();
      }}
      onKeyDown={(event) => {
        const origin = acceptedEvidenceTrigger(
          event.currentTarget,
          event.target
        );
        if (
          !origin ||
          event.defaultPrevented ||
          event.key !== "Enter" ||
          event.repeat
        ) {
          return;
        }
        event.preventDefault();
        enterActivationRef.current = origin;
        focusOriginRef.current = origin;
        focusOriginIdRef.current = origin.id || null;
        navigateOpen();
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter") {
          enterActivationRef.current = null;
        }
      }}
      onBlurCapture={() => {
        enterActivationRef.current = null;
      }}
    >
      {children}
    </span>
  ) : null;

  return (
    <>
      {trigger}
      <Sheet
        open={sheetOpen}
        onOpenChange={(nextOpen) => {
          if (sheetOpen && !nextOpen) {
            setDismissedEvidenceIdentity(currentEvidenceIdentity);
            const href = trustedCloseEvidenceHref(closeHref);
            if (href) {
              window.history.pushState(null, "", href);
            }
          }
        }}
      >
        <SheetContent
          ref={contentRef}
          side="right"
          showCloseButton={false}
          initialFocus={contentRef}
          finalFocus={finalFocus}
          onKeyDown={wrapSheetTabFocus}
          className="h-dvh w-full max-w-none gap-0 data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:max-w-none data-[side=right]:sm:max-w-none data-[side=right]:min-[641px]:h-full data-[side=right]:min-[641px]:w-[26rem] data-[side=right]:min-[641px]:max-w-[28rem]"
        >
          <SheetClose
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
            <span className="sr-only">Закрыть</span>
          </SheetClose>
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle>Данные и примеры</SheetTitle>
            <SheetDescription>{activeEvidence.description}</SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <section
              aria-labelledby="report-evidence-summary"
              className="flex flex-col gap-2"
            >
              <h3
                id="report-evidence-summary"
                className="text-sm font-medium text-foreground"
              >
                {activeEvidence.title}
              </h3>
              {activeEvidence.status === "ready" ? (
                <dl className="grid gap-1 text-sm text-muted-foreground">
                  <div className="flex items-start justify-between gap-4">
                    <dt>Сравнение</dt>
                    <dd className="text-right text-foreground">
                      {activeEvidence.comparison}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt>Выборка</dt>
                    <dd className="text-right text-foreground">
                      {activeEvidence.sample}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </section>

            {activeEvidence.status === "ready" ? (
              <>
                <Separator />
                <section
                  aria-labelledby="report-evidence-list"
                  className="flex flex-col gap-2"
                >
                  <h3
                    id="report-evidence-list"
                    className="text-sm font-medium text-foreground"
                  >
                    Проверки
                  </h3>
                  <ul className="divide-y divide-border">
                    {activeEvidence.rows.slice(0, 5).map((row) => (
                      <li key={row.id}>
                        <Link
                          href={row.href}
                          className="flex min-w-0 items-start justify-between gap-3 py-3 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {row.sourceLabel}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {row.teamLabel} ·{" "}
                              {finalizedDateLabel(row.finalizedAt)}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {row.riskLabel} · {row.relationLabel}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-medium tabular-nums">
                            {row.scoreLabel}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
