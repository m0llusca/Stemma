const HOST_SOURCE_PATTERNS: Array<{ pattern: RegExp; source: string }> = [
  { pattern: /(^|\.)zendesk\.com$/i, source: "zendesk" },
  { pattern: /(^|\.)freshdesk\.com$/i, source: "freshdesk" },
  { pattern: /(^|\.)atlassian\.net$/i, source: "jira" },
  { pattern: /(^|\.)service-now\.com$/i, source: "servicenow" },
  { pattern: /(^|\.)crm\.dynamics\.com$/i, source: "dynamics" },
  { pattern: /(^|\.)my\.salesforce\.com$/i, source: "salesforce" }
];

export function detectSourceFromHost(rawUrl: string): string | undefined {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return HOST_SOURCE_PATTERNS.find((entry) => entry.pattern.test(host))?.source;
  } catch {
    return undefined;
  }
}

export function extractTicketIdFromPath(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    const ticket = url.pathname.match(/\/tickets?\/(\d+)/i);
    if (ticket) return ticket[1];
    const issue = url.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
    if (issue) return issue[1];
    const otrsId = url.searchParams.get("TicketID");
    if (otrsId) return otrsId;
    return undefined;
  } catch {
    return undefined;
  }
}

// Сводит произвольную ссылку helpdesk к базовому URL. Для OTRS сохраняет basePath
// (первый сегмент вида /otrs, /znuny, /otobo); для прочих — origin.
export function normalizeHelpdeskBaseUrl(rawUrl: string): { baseUrl: string; basePath?: string } {
  const url = new URL(rawUrl);
  const otrsBase = url.pathname.match(/^\/(otrs|znuny|otobo)(\/|$)/i);
  if (otrsBase) {
    return { baseUrl: `${url.origin}/${otrsBase[1]}`, basePath: `/${otrsBase[1]}` };
  }
  return { baseUrl: url.origin };
}
