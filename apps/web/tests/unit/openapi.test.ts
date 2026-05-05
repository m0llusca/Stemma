import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "@/lib/api/openapi";

describe("openapi contract", () => {
  it("builds an OpenAPI 3.1 document with shared error and pagination schemas", () => {
    const document = buildOpenApiDocument();

    expect(document.openapi).toBe("3.1.0");
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
        "/jobs",
        "/api-tokens",
        "/audit-logs"
      ])
    );
  });
});
