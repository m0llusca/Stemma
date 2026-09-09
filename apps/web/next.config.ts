import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["morphicons"],
  experimental: {
    authInterrupts: true
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
          // HSTS omitted: TLS is typically terminated at the ingress/proxy, not the Next.js process.
          // Enable at the terminator, or uncomment when the app itself terminates TLS:
          // { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ]
      }
    ];
  }
};

export default nextConfig;
