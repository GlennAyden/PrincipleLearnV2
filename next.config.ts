import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// Force-load env files locally so overrides replace any global OPENAI_API_KEY
loadEnv({ path: ".env", override: true });
loadEnv({ path: ".env.local", override: true });

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
