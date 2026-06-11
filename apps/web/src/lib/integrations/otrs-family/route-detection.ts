import { buildOtrsWebServiceBaseUrl } from "@/lib/integrations/otrs-family/config";

export type RouteProbeResponse = { statusCode: number; bodyText: string };
export type RouteProbeClassification = "bound" | "unbound";

export type DetectedRoute = { method: "GET" | "POST"; path: string };

export type OtrsRouteDetectionResult = {
  webServiceName: string;
  ticketGet?: DetectedRoute;
  ticketSearch?: DetectedRoute;
  sessionCreate?: DetectedRoute;
  undetected: string[];
};

type RouteCandidate = { method: "GET" | "POST"; path: string };

const CANDIDATES: Record<"ticketGet" | "ticketSearch" | "sessionCreate", RouteCandidate[]> = {
  ticketGet: [
    { method: "GET", path: "/Ticket/{TicketID}" },
    { method: "GET", path: "/TicketGet/{TicketID}" }
  ],
  ticketSearch: [
    { method: "GET", path: "/Ticket" },
    { method: "POST", path: "/Ticket/Search" },
    { method: "GET", path: "/TicketSearch" },
    { method: "POST", path: "/TicketSearch" }
  ],
  sessionCreate: [
    { method: "POST", path: "/Session" },
    { method: "POST", path: "/SessionCreate" }
  ]
};

export function classifyRouteProbe(response: RouteProbeResponse): RouteProbeClassification {
  if (/determine Operation/i.test(response.bodyText)) {
    return "unbound";
  }
  return "bound";
}

export async function detectOtrsRoutes(input: {
  probeRoute: (request: { operation: string; method: "GET" | "POST"; url: string }) => Promise<RouteProbeResponse>;
  baseUrl: string;
  webServiceName: string;
  testTicketId: string;
}): Promise<OtrsRouteDetectionResult> {
  const serviceBase = buildOtrsWebServiceBaseUrl({ baseUrl: input.baseUrl, webServiceName: input.webServiceName });
  const result: OtrsRouteDetectionResult = { webServiceName: input.webServiceName, undetected: [] };

  for (const operation of ["sessionCreate", "ticketGet", "ticketSearch"] as const) {
    let found: DetectedRoute | undefined;
    for (const candidate of CANDIDATES[operation]) {
      const path = candidate.path.replace("{TicketID}", encodeURIComponent(input.testTicketId));
      const response = await input.probeRoute({ operation, method: candidate.method, url: `${serviceBase}${path}` });
      if (classifyRouteProbe(response) === "bound") {
        found = { method: candidate.method, path: candidate.path };
        break;
      }
    }
    if (found) {
      result[operation] = found;
    } else {
      result.undetected.push(operation);
    }
  }

  return result;
}
