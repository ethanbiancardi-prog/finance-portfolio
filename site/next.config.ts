import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (used to read congressional disclosure PDFs) is a plain Node
  // library; bundling it breaks its pdfjs worker resolution.
  serverExternalPackages: ["pdf-parse"],
  async redirects() {
    // The 10-K analyzer moved into the research tab; keep old links working.
    return [{ source: "/statement-analyzer", destination: "/research", permanent: true }];
  },
};

export default nextConfig;
