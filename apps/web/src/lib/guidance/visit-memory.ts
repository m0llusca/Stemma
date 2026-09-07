/**
 * Client-side visit memory for welcome-back + day-1 glossary.
 * No backend: localStorage only (cookie optional via same keys if needed later).
 */

export const LAST_VISIT_STORAGE_KEY = "qc:last-visit";
export const DAY1_TOUR_DISMISS_STORAGE_KEY = "qc:day1-tour:dismissed";
export const WELCOME_BACK_ABSENCE_DAYS = 30;

const dayMs = 24 * 60 * 60 * 1000;

/** Pagination / flash markers — not a saved-view identity. */
const QUEUE_VIEW_NOISE_KEYS = new Set(["page", "empty", "saved"]);

export function parseLastVisit(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed);
}

export function shouldShowWelcomeBack(
  now: Date,
  lastVisit: Date | null,
  absenceDays = WELCOME_BACK_ABSENCE_DAYS
): boolean {
  if (!lastVisit) {
    return false;
  }

  const thresholdMs = Math.max(1, absenceDays) * dayMs;
  return now.getTime() - lastVisit.getTime() >= thresholdMs;
}

export function isDay1TourDismissed(value: string | null | undefined): boolean {
  return value === "1";
}

/** Client-only: true when localStorage lastVisit is past the absence threshold. */
export function welcomeBackWouldShowFromStorage(now = new Date()): boolean {
  try {
    if (typeof window === "undefined") {
      return false;
    }

    const lastVisit = parseLastVisit(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY));
    return shouldShowWelcomeBack(now, lastVisit);
  } catch {
    return false;
  }
}

/**
 * Compare queue hrefs without page/empty/saved noise so a shared view still
 * matches after Take-next empty flash or pagination.
 */
export function canonicalizeQueueViewHref(href: string): string {
  try {
    const parsed = new URL(href, "http://local.qc");
    if (parsed.pathname !== "/reviews") {
      return href;
    }

    const params = new URLSearchParams(parsed.search);
    for (const key of QUEUE_VIEW_NOISE_KEYS) {
      params.delete(key);
    }

    const ordered = new URLSearchParams();
    for (const key of [...params.keys()].sort()) {
      for (const value of params.getAll(key)) {
        ordered.append(key, value);
      }
    }

    const query = ordered.toString();
    return query ? `/reviews?${query}` : "/reviews";
  } catch {
    return href;
  }
}

export type WorkspaceQueueViewRef = {
  name: string;
  href: string;
  scope: string;
};

export type QueueFilterTrapKind = "workspace" | "private" | "adhoc";

export type QueueFilterTrap = {
  kind: QueueFilterTrapKind;
  name?: string;
};

/**
 * Any open queue URL that is not the role-home reset — workspace, private, or
 * ad-hoc filters. First paint must not treat that as the inbox.
 */
export function findQueueFilterTrap(
  currentHref: string,
  resetHref: string,
  savedViews: readonly WorkspaceQueueViewRef[]
): QueueFilterTrap | undefined {
  const current = canonicalizeQueueViewHref(currentHref);
  const reset = canonicalizeQueueViewHref(resetHref);

  if (current === reset) {
    return undefined;
  }

  const match = savedViews.find((view) => canonicalizeQueueViewHref(view.href) === current);
  if (!match) {
    return { kind: "adhoc" };
  }

  return {
    kind: match.scope === "workspace" ? "workspace" : "private",
    name: match.name
  };
}

/**
 * True when the open queue URL is a workspace (shared) saved view that is not
 * the role-home reset target.
 */
export function findForeignWorkspaceQueueView(
  currentHref: string,
  resetHref: string,
  savedViews: readonly WorkspaceQueueViewRef[]
): WorkspaceQueueViewRef | undefined {
  const trap = findQueueFilterTrap(currentHref, resetHref, savedViews);
  if (trap?.kind !== "workspace" || !trap.name) {
    return undefined;
  }

  return savedViews.find(
    (view) =>
      view.scope === "workspace" &&
      view.name === trap.name &&
      canonicalizeQueueViewHref(view.href) === canonicalizeQueueViewHref(currentHref)
  );
}

export function isForeignWorkspaceQueueView(
  currentHref: string,
  resetHref: string,
  savedViews: readonly WorkspaceQueueViewRef[]
): boolean {
  return findQueueFilterTrap(currentHref, resetHref, savedViews)?.kind === "workspace";
}

export function welcomeBackTrapCopy(trap?: QueueFilterTrap): string {
  if (trap?.kind === "workspace" && trap.name) {
    return `Давно не заходили — сейчас открыт общий вид «${trap.name}». Можно вернуться к очереди дня без ловушки чужих фильтров.`;
  }

  if (trap?.kind === "private" && trap.name) {
    return `Давно не заходили — сейчас открыт сохранённый вид «${trap.name}». Можно вернуться к очереди дня без ловушки старых фильтров.`;
  }

  if (trap) {
    return "Давно не заходили — текущие фильтры не совпадают с очередью дня. Можно сбросить к виду роли без ловушки старых параметров.";
  }

  return "Давно не заходили — сохранённые фильтры могли устареть. Можно сбросить очередь к виду роли без ловушки старых параметров.";
}
