import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The 10-K analyzer moved into the research tab; keep old links working.
    return [{ source: "/statement-analyzer", destination: "/research", permanent: true }];
  },
};

export default nextConfig;
