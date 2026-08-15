import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // Some OpenAI-compatible clients append `/v1/...` even when Base URL
    // already ends with `/api/v1`, producing `/api/v1/v1/images/edits`.
    return {
      beforeFiles: [
        {
          source: "/api/v1/v1/images/:path*",
          destination: "/api/v1/images/:path*",
        },
        {
          source: "/api/images/:path*",
          destination: "/api/v1/images/:path*",
        },
        {
          source: "/api/v1/run/images/:path*",
          destination: "/api/v1/images/:path*",
        },
        {
          source: "/api/v1/image/edits",
          destination: "/api/v1/images/edits",
        },
        {
          source: "/api/v1/images/edit",
          destination: "/api/v1/images/edits",
        },
      ],
    };
  },
};

export default nextConfig;
