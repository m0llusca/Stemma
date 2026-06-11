import { describe, expect, it, vi } from "vitest";
import { classifyRouteProbe, detectOtrsRoutes } from "@/lib/integrations/otrs-family/route-detection";

describe("classifyRouteProbe", () => {
  it("marks 'determine Operation' as unbound", () => {
    expect(
      classifyRouteProbe({ statusCode: 500, bodyText: "HTTP::REST Error while determine Operation for request URI '/Ticket'." })
    ).toBe("unbound");
  });

  it("marks an AuthFail JSON body as bound", () => {
    expect(
      classifyRouteProbe({ statusCode: 200, bodyText: '{"Error":{"ErrorMessage":"TicketGet: Authorization failing!","ErrorCode":"TicketGet.AuthFail"}}' })
    ).toBe("bound");
  });

  it("marks 'Unsupported request content structure' as bound", () => {
    expect(classifyRouteProbe({ statusCode: 500, bodyText: "Unsupported request content structure." })).toBe("bound");
  });

  it("marks an ordinary operation JSON response as bound", () => {
    expect(classifyRouteProbe({ statusCode: 200, bodyText: '{"TicketID":["1"]}' })).toBe("bound");
  });
});

describe("detectOtrsRoutes", () => {
  it("detects the FSA-style instance (TicketGet on /Ticket/:id, SessionCreate on /Session, TicketSearch undetected)", async () => {
    const probeRoute = vi.fn(async (request: { operation: string; method: string; url: string }) => {
      // FSA instance: TicketGet maps to GET /Ticket/{id}; TicketSearch routes
      // (incl. POST /Ticket/Search) are not mapped → "determine Operation".
      if (request.url.endsWith("/Ticket/1")) {
        return { statusCode: 200, bodyText: '{"Error":{"ErrorCode":"TicketGet.AuthFail"}}' };
      }
      if (request.url.endsWith("/Session")) {
        return { statusCode: 500, bodyText: "Unsupported request content structure." };
      }
      return { statusCode: 500, bodyText: "HTTP::REST Error while determine Operation for request URI '...'." };
    });

    const result = await detectOtrsRoutes({
      probeRoute,
      baseUrl: "https://otrs.example.ru/otrs",
      webServiceName: "api",
      testTicketId: "1"
    });

    expect(result.ticketGet).toEqual({ method: "GET", path: "/Ticket/{TicketID}" });
    expect(result.sessionCreate).toEqual({ method: "POST", path: "/Session" });
    expect(result.undetected).toContain("ticketSearch");
  });

  it("aborts on a fatal transport error", async () => {
    const probeRoute = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(
      detectOtrsRoutes({ probeRoute, baseUrl: "https://x/otrs", webServiceName: "api", testTicketId: "1" })
    ).rejects.toThrow();
  });

  it("reports everything undetected for an empty webservice", async () => {
    const probeRoute = vi.fn(async () => ({ statusCode: 500, bodyText: "Error while determine Operation for request URI '...'." }));
    const result = await detectOtrsRoutes({ probeRoute, baseUrl: "https://x/otrs", webServiceName: "api", testTicketId: "1" });
    expect(result.undetected.sort()).toEqual(["sessionCreate", "ticketGet", "ticketSearch"]);
  });
});
