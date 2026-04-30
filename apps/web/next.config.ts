import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Sentry's connect-src ingestion endpoint (sentry.io) — only added to CSP when a DSN is configured.
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
const sentryConnectSrc = sentryDsn ? " https://*.sentry.io" : "";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@template/shared", "@template/supabase"],
  experimental: {
    reactCompiler: false,
    serverActions: { bodySizeLimit: "5mb" },
  },

  // 3D: Allow next/image to serve Supabase Storage images
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // 2E: Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed for Next.js dev
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https://*.supabase.co",
              "font-src 'self'",
              `connect-src 'self' https://*.supabase.co wss://*.supabase.co${sentryConnectSrc}`,
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

// Wrap with Sentry only when a DSN is configured. Otherwise withSentryConfig is a passthrough,
// but we skip it to avoid the build-time source-map upload step that requires SENTRY_AUTH_TOKEN.
export default sentryDsn
  ? withSentryConfig(nextConfig, {
      silent: !process.env.CI,
      // Source-map upload — only runs if SENTRY_AUTH_TOKEN + org/project are set.
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      sourcemaps: { disable: false },
      disableLogger: true,
    })
  : nextConfig;
