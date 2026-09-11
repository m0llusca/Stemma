export const openCoachingActionsPageSize = 5;
export const openCoachingActionsPageParam = "actionsPage";

export type OpenCoachingActionsPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  hasMore: boolean;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Parse a 1-based page number from a raw search param, clamping junk to 1. */
export function parseOpenCoachingActionsPage(value: string | string[] | undefined): number {
  const raw = firstParam(value)?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : 1;

  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Slice already-loaded open coaching actions into a single page.
 * `page` is 1-based and clamped into range; an out-of-range page returns the last page.
 */
export function paginateOpenCoachingActions<T>(
  actions: readonly T[],
  page = 1,
  pageSize = openCoachingActionsPageSize
): OpenCoachingActionsPage<T> {
  const total = actions.length;
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const start = (safePage - 1) * safePageSize;

  return {
    items: actions.slice(start, start + safePageSize) as T[],
    page: safePage,
    pageSize: safePageSize,
    pageCount,
    total,
    hasMore: safePage < pageCount
  };
}

export function openCoachingActionsPageHref(
  page: number,
  params: {
    view: string;
    q: string;
    assigneeId: string;
    category: string;
  }
) {
  const searchParams = new URLSearchParams();
  searchParams.set("view", params.view);

  if (params.q) {
    searchParams.set("q", params.q);
  }

  if (params.assigneeId) {
    searchParams.set("assigneeId", params.assigneeId);
  }

  if (params.category) {
    searchParams.set("category", params.category);
  }

  if (page > 1) {
    searchParams.set(openCoachingActionsPageParam, String(page));
  }

  return `/coaching?${searchParams.toString()}`;
}
