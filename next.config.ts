import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Token icons are tiny; skip the optimizer so Workers spend no CPU on it.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dd.dexscreener.com",
      },
      {
        protocol: "https",
        hostname: "images.dexscreener.com",
      },
      {
        protocol: "https",
        hostname: "cdn.dexscreener.com",
      },
      {
        protocol: "https",
        hostname: "**.dexscreener.com",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/admin",
        destination: "/submit",
        permanent: true,
      },
      {
        // Old leaderboard share image, now a static file.
        source: "/api/og/site",
        destination: "/og/site.png",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
