export const CONNECTION_SOURCE_LABELS: Record<string, string> = {
  dynamics: "Microsoft Dynamics 365",
  freshdesk: "Freshdesk",
  hubspot: "HubSpot",
  intercom: "Intercom",
  jira: "Jira Service Management",
  otobo: "OTOBO",
  otrs: "OTRS Community Edition 6",
  salesforce: "Salesforce",
  servicenow: "ServiceNow",
  ydb: "YDB",
  ytsaurus: "YTsaurus",
  zendesk: "Zendesk",
  znuny: "Znuny"
};

export function connectionSourceLabel(source: string) {
  return CONNECTION_SOURCE_LABELS[source] ?? source;
}
