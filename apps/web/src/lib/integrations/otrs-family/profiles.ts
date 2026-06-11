export const otrsFamilyProfiles = {
  otrs_ce_6: {
    product: "otrs_ce_6",
    source: "otrs",
    label: "OTRS Community Edition 6",
    basePath: "/otrs",
    webServiceName: "GenericTicketConnectorREST",
    ticketSearchPath: "/Ticket",
    ticketGetPath: "/Ticket/{TicketID}",
    ticketSearchMethod: "GET",
    ticketGetMethod: "GET",
    ticketZoomPath: "/index.pl?Action=AgentTicketZoom;TicketID=<TicketID>"
  },
  znuny_lts: {
    product: "znuny_lts",
    source: "znuny",
    label: "Znuny LTS",
    basePath: "/znuny",
    webServiceName: "GenericTicketConnectorREST",
    ticketSearchPath: "/Ticket/Search",
    ticketGetPath: "/Ticket/{TicketID}",
    ticketSearchMethod: "POST",
    ticketGetMethod: "GET",
    ticketZoomPath: "/index.pl?Action=AgentTicketZoom;TicketID=<TicketID>"
  },
  otobo: {
    product: "otobo",
    source: "otobo",
    label: "OTOBO",
    basePath: "/otobo",
    webServiceName: "GenericTicketConnectorREST",
    ticketSearchPath: "/TicketSearch",
    ticketGetPath: "/TicketGet",
    ticketSearchMethod: "GET",
    ticketGetMethod: "GET",
    ticketZoomPath: "/index.pl?Action=AgentTicketZoom;TicketID=<TicketID>"
  }
} as const;

export type OtrsProduct = keyof typeof otrsFamilyProfiles;
export type OtrsFamilyProfile = (typeof otrsFamilyProfiles)[OtrsProduct];
export type OtrsFamilySource = "otrs" | "znuny" | "otobo" | "otrs_family";

export const otrsFamilySourceOptions = [
  { value: "znuny", label: "Znuny" },
  { value: "otrs", label: "OTRS CE 6" },
  { value: "otobo", label: "OTOBO" },
  { value: "otrs_family", label: "OTRS-family fallback" }
] as const satisfies ReadonlyArray<{ value: OtrsFamilySource; label: string }>;

export const otrsFamilyApiProfiles = [
  {
    source: "otrs",
    label: "OTRS Community Edition 6",
    shortLabel: "OTRS CE 6",
    basePath: otrsFamilyProfiles.otrs_ce_6.basePath,
    exampleBaseUrl: "https://support.example.com/otrs",
    webService: otrsFamilyProfiles.otrs_ce_6.webServiceName,
    auth: "UserLogin + Password или SessionID",
    ticketGetMethod: otrsFamilyProfiles.otrs_ce_6.ticketGetMethod,
    ticketGetPath: otrsFamilyProfiles.otrs_ce_6.ticketGetPath,
    ticketSearchMethod: otrsFamilyProfiles.otrs_ce_6.ticketSearchMethod,
    ticketSearchPath: otrsFamilyProfiles.otrs_ce_6.ticketSearchPath,
    ticketZoomPath: otrsFamilyProfiles.otrs_ce_6.ticketZoomPath,
    docsUrl: "https://otrscommunityedition.com/doc/manual/admin/6.0/en/html/genericinterface.html",
    note: "В стандартном REST-примере OTRS CE 6 TicketGet идет GET на /Ticket/{TicketID}; имя Web Service и route могут отличаться после ручной настройки."
  },
  {
    source: "znuny",
    label: "Znuny LTS",
    shortLabel: "Znuny",
    basePath: otrsFamilyProfiles.znuny_lts.basePath,
    exampleBaseUrl: "https://support.example.com/znuny",
    webService: otrsFamilyProfiles.znuny_lts.webServiceName,
    auth: "UserLogin + Password или SessionID",
    ticketGetMethod: otrsFamilyProfiles.znuny_lts.ticketGetMethod,
    ticketGetPath: otrsFamilyProfiles.znuny_lts.ticketGetPath,
    ticketSearchMethod: otrsFamilyProfiles.znuny_lts.ticketSearchMethod,
    ticketSearchPath: otrsFamilyProfiles.znuny_lts.ticketSearchPath,
    ticketZoomPath: otrsFamilyProfiles.znuny_lts.ticketZoomPath,
    docsUrl: "https://doc.znuny.org/znuny/admin/webservices/examples/GenericTicketConnectorREST/index.html",
    note: "Ready2Adopt GenericTicketConnectorREST в Znuny показывает TicketGet через GET /Ticket/<ticket_id>; base path обычно /znuny."
  },
  {
    source: "otobo",
    label: "OTOBO",
    shortLabel: "OTOBO",
    basePath: otrsFamilyProfiles.otobo.basePath,
    exampleBaseUrl: "https://support.example.com/otobo",
    webService: otrsFamilyProfiles.otobo.webServiceName,
    auth: "UserLogin + Password или SessionID",
    ticketGetMethod: otrsFamilyProfiles.otobo.ticketGetMethod,
    ticketGetPath: otrsFamilyProfiles.otobo.ticketGetPath,
    ticketSearchMethod: otrsFamilyProfiles.otobo.ticketSearchMethod,
    ticketSearchPath: otrsFamilyProfiles.otobo.ticketSearchPath,
    ticketZoomPath: otrsFamilyProfiles.otobo.ticketZoomPath,
    docsUrl: "https://otobo-docs.softoft.de/en/administration/automation/rest-api",
    note: "В OTOBO web service создается в админке, поэтому часто встречается GET /TicketGet?TicketID=... вместо /Ticket/{TicketID}."
  }
] as const satisfies ReadonlyArray<{
  source: Exclude<OtrsFamilySource, "otrs_family">;
  label: string;
  shortLabel: string;
  basePath: string;
  exampleBaseUrl: string;
  webService: string;
  auth: string;
  ticketGetMethod: "GET";
  ticketGetPath: string;
  ticketSearchMethod: "GET" | "POST";
  ticketSearchPath: string;
  ticketZoomPath: string;
  docsUrl: string;
  note: string;
}>;

export type OtrsFamilyApiProfile = (typeof otrsFamilyApiProfiles)[number];

const genericOtrsFamilyProfile: OtrsFamilyApiProfile = otrsFamilyApiProfiles[0];

export function otrsFamilyProfileForSource(source: OtrsFamilySource): OtrsFamilyApiProfile {
  return otrsFamilyApiProfiles.find((profile) => profile.source === source) ?? genericOtrsFamilyProfile;
}
