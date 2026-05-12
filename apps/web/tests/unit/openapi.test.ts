import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "@/lib/api/openapi";

describe("openapi contract", () => {
  it("builds an OpenAPI 3.1 document with shared error and pagination schemas", () => {
    const document = buildOpenApiDocument();

    expect(document.openapi).toBe("3.1.0");
    expect(document).not.toHaveProperty("security");
    expect(document.components.securitySchemes).toEqual({
      bearerApiToken: {
        type: "http",
        scheme: "bearer",
        description: "API-токен workspace. Для UI используется серверная сессия."
      },
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "qc_session",
        description: "Сессионная cookie администратора UI."
      }
    });
    expect(document.paths["/health"].get.security).toEqual([]);
    expect(document.paths["/openapi"].get.security).toEqual([]);
    expect(document.paths["/conversations"].get.security).toEqual([{ bearerApiToken: [] }]);
    expect(document.paths["/webhooks/{endpointId}"].post.security).toEqual([]);
    expect(document.paths["/webhooks/{endpointId}"].post.responses["413"]).toEqual({
      description: "Webhook payload слишком большой"
    });
    expect(document.paths["/jobs/run"].post.security).toEqual([{ sessionCookie: [] }]);
    expect(document.components.schemas.IntegrationCapability.required).toContain("supportedEvents");
    expect(document.components.schemas.WebhookEndpoint.required).toContain("secretPrefix");
    expect(document.components.schemas.WebhookEndpoint.required).toEqual([
      "id",
      "integrationId",
      "source",
      "name",
      "status",
      "acceptedEvents",
      "secretPrefix",
      "signingAlgorithm",
      "lastReceivedAt",
      "lastError",
      "createdAt",
      "updatedAt"
    ]);
    expect(document.paths["/webhook-endpoints"].post.responses["201"].content["application/json"].schema).toEqual({
      type: "object",
      required: ["webhookEndpoint"],
      properties: {
        webhookEndpoint: { $ref: "#/components/schemas/WebhookEndpointWithSecret" }
      }
    });
    expect(document.components.schemas.ApiError).toEqual({
      type: "object",
      required: ["error"],
      properties: {
        error: {
          type: "object",
          required: ["code", "message", "details", "requestId"],
          properties: {
            code: { type: "string" },
            message: { type: "string" },
            details: {},
            requestId: { type: "string" }
          }
        }
      }
    });
    expect(document.components.schemas.PaginationMeta.required).toEqual([
      "page",
      "limit",
      "total",
      "totalPages",
      "hasNextPage",
      "hasPreviousPage"
    ]);
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/health",
        "/readiness",
        "/conversations",
        "/conversations/{conversationId}",
        "/reviews",
        "/reviews/{reviewId}",
        "/integrations",
        "/integrations/catalog",
        "/webhook-endpoints",
        "/webhooks/{endpointId}",
        "/jobs",
        "/auth/providers/{providerId}",
        "/auth/providers/{providerId}/sync",
        "/auth/sessions/{sessionId}/revoke",
        "/api-tokens/{tokenId}/revoke",
        "/jobs/run",
        "/jobs/{jobId}/cancel",
        "/jobs/{jobId}/requeue",
        "/reports/exports",
        "/api-tokens",
        "/audit-logs"
      ])
    );
  });
});
