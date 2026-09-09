import { createRequire } from "node:module";
import path from "node:path";

import type { NextConfig } from "next";

const requireFromWeb = createRequire(path.join(process.cwd(), "package.json"));
const morphiconsReact = requireFromWeb.resolve("morphicons/react");

const nextConfig: NextConfig = {
  transpilePackages: ["morphicons"],
  turbopack: {
    resolveAlias: {
      "morphicons/react": morphiconsReact
    }
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "morphicons/react": morphiconsReact
    };
    return config;
  },
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
