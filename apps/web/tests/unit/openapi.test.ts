import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "@/lib/api/openapi";
import { certificationStatuses } from "@/lib/certification/status";

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
    expect(document.paths["/readiness"].get.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ReadinessResponse"
    });
    expect(document.paths["/conversations"].get.security).toEqual([{ bearerApiToken: [] }]);
    expect(document.paths["/webhooks/{endpointId}"].post.security).toEqual([]);
    expect(document.paths["/webhooks/{endpointId}"].post.responses["413"]).toEqual({
      description: "Webhook payload слишком большой"
    });
    expect(document.paths["/jobs/run"].post.security).toEqual([{ sessionCookie: [] }]);
    expect(document.components.schemas.IntegrationCapability.required).toContain("supportedEvents");
    expect(document.components.schemas.ScoreSummary).toMatchObject({
      type: "object",
      required: ["totalScore", "scoreUnit", "scoreLabel"]
    });
    expect(document.components.schemas.ScoreSummary.properties.scoreUnit.enum).toEqual(["points"]);
    expect(document.components.schemas.ReviewListResponse.properties.data.properties.reviews.items).toEqual({
      $ref: "#/components/schemas/ReviewListItem"
    });
    expect(document.components.schemas.ReviewListItem.properties.score).toEqual({
      $ref: "#/components/schemas/ScoreSummary"
    });
    expect(document.components.schemas.ReviewDetail.properties.score).toEqual({
      $ref: "#/components/schemas/ScoreSummary"
    });
    expect(document.paths["/reviews"].get.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ReviewListResponse"
    });
    expect(document.paths["/reviews/{reviewId}"].get.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ReviewDetailResponse"
    });
    expect(document.paths["/conversations"].get.parameters.map((parameter) => parameter.name)).toEqual(
      expect.arrayContaining(["createdFrom", "createdTo"])
    );
    expect(document.paths["/reviews"].get.parameters.map((parameter) => parameter.name)).toEqual(
      expect.arrayContaining(["createdFrom", "createdTo"])
    );
    expect(document.components.schemas.CertificationStatus).toEqual({
      type: "string",
      enum: [...certificationStatuses]
    });
    expect(document.components.schemas.CertificationGateSummary.required).toEqual(["docs", "contract", "stub", "live"]);
    expect(document.components.schemas.CertificationGateSummary.properties).toEqual({
      docs: { $ref: "#/components/schemas/CertificationStatus" },
      contract: { $ref: "#/components/schemas/CertificationStatus" },
      stub: { $ref: "#/components/schemas/CertificationStatus" },
      live: { $ref: "#/components/schemas/CertificationStatus" }
    });
    expect(document.components.schemas.CertificationSummary.required).toEqual(["status", "label", "productionReady"]);
    expect(document.components.schemas.CertificationSummary.properties.status).toEqual({
      $ref: "#/components/schemas/CertificationStatus"
    });
    expect(document.components.schemas.Certification.properties.docs.items.properties.status).toEqual({
      $ref: "#/components/schemas/CertificationStatus"
    });
    expect(document.components.schemas.ReadinessResponse.required).toContain("phaseD");
    expect(document.components.schemas.ReadinessResponse.required).toContain("certification");
    expect(document.components.schemas.ReadinessResponse.properties.phaseD).toEqual({
      $ref: "#/components/schemas/PhaseDReadinessReport"
    });
    expect(document.components.schemas.ReadinessResponse.properties.certification.properties.latestRuns).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/CertificationRunSummary" }
    });
    expect(document.components.schemas.CertificationRunSummary).toMatchObject({
      type: "object",
      required: ["id", "targetType", "source", "status", "startedAt", "nextAction"]
    });
    expect(document.components.schemas.CertificationRunSummary.properties.status.enum).toEqual([
      "running",
      "passed",
      "failed",
      "blocked"
    ]);
    expect(document.components.schemas.PhaseDReadinessReport.properties.integrations.items).toEqual({
      $ref: "#/components/schemas/PhaseDReadinessItem"
    });
    expect(document.components.schemas.PhaseDReadinessItem.properties.latestEvidence.anyOf).toEqual([
      { $ref: "#/components/schemas/CertificationEvidence" },
      { type: "null" }
    ]);
    expect(document.components.schemas.CertificationEvidence.required).toEqual(
      expect.arrayContaining(["source", "runId", "actor", "recordedAt", "envGate", "result", "redactedDiagnostics"])
    );
    expect(document.components.schemas.IntegrationCapability.required).toContain("certification");
    expect(document.components.schemas.IntegrationCapability.properties.type).toEqual({
      $ref: "#/components/schemas/IntegrationCapabilityType"
    });
    expect(document.components.schemas.IntegrationCapability.properties.readiness).toEqual({
      $ref: "#/components/schemas/IntegrationReadiness"
    });
    expect(document.components.schemas.IntegrationCapability.required).toEqual(
      expect.arrayContaining([
        "supportsInboundWebhooks",
        "supportsOutboundWebhooks",
        "payloadLimits",
        "docsHref",
        "requiredSecrets"
      ])
    );
    expect(document.components.schemas.IntegrationCapability.properties.certification).toEqual({
      $ref: "#/components/schemas/Certification"
    });
    expect(document.components.schemas.IntegrationCapability.properties.operations.items.type).toBe("string");
    expect(document.components.schemas.IntegrationCapability.properties.payloadLimits).toEqual({
      $ref: "#/components/schemas/PayloadLimits"
    });
    expect(document.components.schemas.IntegrationCapabilityType).toEqual({
      type: "string",
      enum: ["otrs_family", "native_helpdesk", "custom_api", "webhook_bridge", "enterprise", "data_source"]
    });
    expect(document.components.schemas.IntegrationReadiness).toEqual({
      type: "string",
      enum: ["production_slice", "adapter_ready", "roadmap"]
    });
    expect(document.components.schemas.IntegrationCatalogResponse).toEqual({
      type: "object",
      required: ["catalog", "requestId"],
      properties: {
        catalog: {
          type: "array",
          items: { $ref: "#/components/schemas/IntegrationCapability" }
        },
        requestId: { type: "string" }
      }
    });
    expect(document.paths["/integrations/catalog"].get.responses["200"]).toEqual({
      description: "Connector capability catalog",
      headers: {
        "x-request-id": {
          description: "Stable request identifier echoed from request headers or generated by API gateway.",
          schema: { type: "string" }
        }
      },
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/IntegrationCatalogResponse" }
        }
      }
    });
    expect(document.paths["/integrations/catalog"].get.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/IntegrationCatalogResponse"
    });
    expect(document.paths["/integrations/{integrationId}/diagnostics"].post).toMatchObject({
      security: [{ sessionCookie: [] }],
      responses: {
        "202": { description: "Диагностика интеграции запущена" },
        "400": { description: "Некорректные параметры диагностики" },
        "404": { description: "Интеграция не найдена" }
      }
    });
    expect(document.paths["/integrations/{integrationId}/preview"].post).toMatchObject({
      security: [{ sessionCookie: [] }],
      responses: {
        "201": { description: "Preview интеграции создан" },
        "400": { description: "Некорректные параметры preview" },
        "404": { description: "Интеграция не найдена" }
      }
    });
    expect(document.paths["/integrations/{integrationId}/import"].post).toMatchObject({
      security: [{ sessionCookie: [] }],
      responses: {
        "202": { description: "Выбранные preview-строки поставлены в очередь импорта" },
        "400": { description: "Некорректные параметры выборочного импорта" },
        "404": { description: "Интеграция или preview-run не найдены" },
        "409": { description: "Выбранные строки уже поставлены в очередь или недоступны" }
      }
    });
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
        "/integrations/{integrationId}/imports",
        "/integrations/{integrationId}/diagnostics",
        "/integrations/{integrationId}/preview",
        "/integrations/{integrationId}/import",
        "/webhook-endpoints",
        "/webhooks/{endpointId}",
        "/jobs",
        "/auth/providers/{providerId}",
        "/auth/providers/{providerId}/scim-token",
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
