import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config security headers", () => {
  it("sets baseline security headers without HSTS at the app layer", async () => {
    const headersFn = nextConfig.headers;
    expect(headersFn).toBeTypeOf("function");

    const entries = await headersFn!();
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("/:path*");

    const headerMap = Object.fromEntries(entries[0].headers.map((header) => [header.key, header.value]));
    expect(headerMap["X-Content-Type-Options"]).toBe("nosniff");
    expect(headerMap["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headerMap["X-Frame-Options"]).toBe("DENY");
    expect(headerMap["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
    expect(headerMap["Strict-Transport-Security"]).toBeUndefined();
  });
});
