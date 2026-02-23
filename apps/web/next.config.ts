import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@template/ui", "@template/shared", "@template/supabase"],
  experimental: {
    // Enable React 19 features
    reactCompiler: false,
  },
};

export default nextConfig;
