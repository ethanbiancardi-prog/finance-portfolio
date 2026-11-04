import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (used to read congressional disclosure PDFs) is a plain Node
  // library; bundling it breaks its pdfjs worker resolution.
  serverExternalPackages: ["pdf-parse"],
  // Dev server only: lets a browser on 127.0.0.1 (not just localhost) load
  // the dev scripts, for browser-automation checks. No effect in production.
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    // The 10-K analyzer moved into the research tab; keep old links working.
    return [
      { source: "/statement-analyzer", destination: "/research", permanent: true },
      // Quant Notes grew into the Education section (tool guides + fundamentals).
      { source: "/quant-notes", destination: "/education", permanent: true },
      { source: "/quant-notes/:slug", destination: "/education/:slug", permanent: true },
      // The client-work section was removed in Oct 2026.
      { source: "/client-work", destination: "/", permanent: true },
      // Industry Charts became the first tab of /research.
      { source: "/industries", destination: "/research", permanent: true },
      // Carbon Intensity moved into the Sustainability page (Nov 2026).
      { source: "/carbon", destination: "/sustainability#carbon", permanent: true },
      // Contact folded into About (Nov 2026); ?type= is passed through.
      { source: "/contact", destination: "/about#message", permanent: true },
    ];
  },
};

export default nextConfig;
