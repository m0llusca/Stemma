import { createRequire } from "node:module";
import path from "node:path";

import type { NextConfig } from "next";

const appRoot = process.cwd();
const requireFromWeb = createRequire(path.join(appRoot, "package.json"));
/** Absolute filesystem path — webpack alias. Turbopack cannot consume this:
 *  it prefixes `./` and looks for `./workspace/...` inside the app root. */
const morphiconsReactAbsolute = path.resolve(requireFromWeb.resolve("morphicons/react"));
if (!path.isAbsolute(morphiconsReactAbsolute)) {
  throw new Error("morphicons/react must resolve to an absolute filesystem path");
}
/** Project-relative (`./node_modules/morphicons/dist/react.js`) for Turbopack. */
const morphiconsReactFromApp = `./${path
  .relative(appRoot, morphiconsReactAbsolute)
  .split(path.sep)
  .join("/")}`;

/** Monorepo root so Turbopack can resolve `file:../../packages/kinetics`
 *  (symlink target lives outside `apps/web`; without this, CSS import panics:
 *  "leaves the filesystem root"). */
const monorepoRoot = path.resolve(appRoot, "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["morphicons", "@stemma/kinetics"],
  // Dev client (HMR + /_next/*) rejects cross-origin hosts by default. Without
  // this, 127.0.0.1 and Cloudflare tunnels get ERR_INVALID_HTTP_RESPONSE on
  // `/_next/hmr`, React never hydrates, and chart tooltips stay dead.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.trycloudflare.com",
    "*.cloudflare.com"
  ],
  turbopack: {
    root: monorepoRoot,
    resolveAlias: {
      "morphicons/react": morphiconsReactFromApp
    }
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "morphicons/react": morphiconsReactAbsolute
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
