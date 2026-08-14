import {
  buildReportAnalysisHref,
  type ReportEvidenceType,
  type ReportFilterCatalog
} from "@/lib/reports/report-analysis-state";

const reportEvidenceTypes = new Set<ReportEvidenceType>([
  "trend",
  "driver",
  "matrix",
  "kpi"
]);
const reportEvidenceKeyPattern = /^ev1_[A-Za-z0-9_-]{43}$/;
const evidenceNavigationOptions = { scroll: false } as const;
const evidenceLinkProps = {
  scroll: false,
  prefetch: false
} as const;
const reportPageLinkProps = {
  prefetch: false
} as const;
const reportPageLocalOrigin = "https://report-page.local";

export type TrustedReportEvidenceLink = {
  evidenceType: ReportEvidenceType;
  key: string;
};

function parseReportPageLocalHref(href: string) {
  if (
    !href.startsWith("/") ||
    href.startsWith("//") ||
    /[\u0000-\u001F\u007F\\]/.test(href)
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(href, reportPageLocalOrigin);
  } catch {
    return null;
  }

  return url.origin === reportPageLocalOrigin ? url : null;
}

function isReportPageLocalHref(href: string) {
  const url = parseReportPageLocalHref(href);
  if (!url) return false;

  return (
    url.pathname === "/reports" ||
    url.pathname.startsWith("/reports/") ||
    url.pathname === "/reviews" ||
    url.pathname.startsWith("/reviews/")
  );
}

function isExactReportEvidenceHref(href: string) {
  if (!href.startsWith("/reports?")) return false;

  const url = parseReportPageLocalHref(href);
  if (!url) return false;

  const evidenceTypes = url.searchParams.getAll("evidenceType");
  const evidenceKeys = url.searchParams.getAll("evidenceKey");
  return (
    url.pathname === "/reports" &&
    evidenceTypes.length === 1 &&
    evidenceKeys.length === 1 &&
    reportEvidenceTypes.has(evidenceTypes[0] as ReportEvidenceType) &&
    reportEvidenceKeyPattern.test(evidenceKeys[0])
  );
}

export function reportEvidenceNavigationOptions(href: string) {
  return isExactReportEvidenceHref(href)
    ? evidenceNavigationOptions
    : undefined;
}

/**
 * Opens a chart point target. Exact report evidence hrefs commit through the
 * native History API only: the Evidence Sheet watches the address bar and
 * resolves the payload on demand, so opening evidence never depends on an
 * App Router navigation commit (which the Next 16.2.x client router can drop
 * on a fresh page load). Any other href keeps the regular router navigation.
 */
export function openReportChartPointHref(
  push: (href: string, options?: { scroll?: boolean }) => void,
  href: string
) {
  const options = reportEvidenceNavigationOptions(href);
  if (options) {
    window.history.pushState(null, "", href);
    return;
  }
  push(href, options);
}

export function reportPageLocalLinkProps(href: string) {
  if (isExactReportEvidenceHref(href)) return evidenceLinkProps;
  return isReportPageLocalHref(href) ? reportPageLinkProps : undefined;
}

/**
 * Rebases an evidence href built by the server onto the live address-bar
 * state. Presentation and filter changes commit without a server re-render,
 * so the server-rendered prop can carry a stale base; the pair it carries was
 * minted for that stale state and must be re-minted for the live one (the
 * caller does that via the evidence route). Returns `rebased: false` when the
 * live base already matches the prop base (fast path) or the inputs are not
 * trusted /reports evidence hrefs.
 */
export function rebaseReportEvidenceHref(href: string, liveHref: string) {
  const source = parseReportPageLocalHref(href);
  const live = parseReportPageLocalHref(liveHref);
  if (
    !source ||
    !live ||
    source.pathname !== "/reports" ||
    live.pathname !== "/reports"
  ) {
    return { href, rebased: false as const };
  }

  const evidenceType = source.searchParams.get("evidenceType");
  const evidenceKey = source.searchParams.get("evidenceKey");
  if (!evidenceType || !evidenceKey) {
    return { href, rebased: false as const };
  }

  const sourceBase = new URL(source.toString());
  sourceBase.searchParams.delete("evidenceType");
  sourceBase.searchParams.delete("evidenceKey");
  const liveBase = new URL(live.toString());
  liveBase.searchParams.delete("evidenceType");
  liveBase.searchParams.delete("evidenceKey");
  if (
    `${sourceBase.pathname}${sourceBase.search}` ===
    `${liveBase.pathname}${liveBase.search}`
  ) {
    return { href, rebased: false as const };
  }

  live.searchParams.set("evidenceType", evidenceType);
  live.searchParams.set("evidenceKey", evidenceKey);
  return {
    href: `${live.pathname}${live.search}${live.hash}`,
    rebased: true as const
  };
}

export function buildTrustedReportEvidenceHref(
  currentHref: string,
  descriptor: TrustedReportEvidenceLink,
  catalog: ReportFilterCatalog
) {
  return buildReportAnalysisHref(
    currentHref,
    {
      evidenceType: descriptor.evidenceType,
      evidenceKey: descriptor.key
    },
    catalog
  );
}

export function relinkReportChartModel<
  Point extends { id: string; href?: string },
  Model extends { points: readonly Point[] }
>(
  model: Model,
  hrefByPointId: Readonly<Record<string, string | undefined>>
): Model {
  return {
    ...model,
    points: model.points.map((point) => {
      const href = hrefByPointId[point.id];
      return href ? { ...point, href } : point;
    })
  } as Model;
}

export function relinkReportRows<Row extends { key: string; href?: string }>(
  rows: readonly Row[],
  hrefByRowKey: Readonly<Record<string, string | undefined>>
): Row[] {
  return rows.map((row) => {
    const href = hrefByRowKey[row.key];
    return href ? { ...row, href } : row;
  });
}
