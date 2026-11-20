import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Tenant subdomains in development, e.g. http://alphabet-inc.localhost:3000
  allowedDevOrigins: ["*.localhost"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Same-origin proxy to the FastAPI backend so the httpOnly session cookie just works.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
