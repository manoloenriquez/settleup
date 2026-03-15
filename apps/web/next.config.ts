import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@template/ui", "@template/shared", "@template/supabase"],
  experimental: {
    reactCompiler: false,
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
