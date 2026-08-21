import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Allow the dev server's static assets to be requested through local tunnels
  // (ngrok / Cloudflare quick tunnels) used to test Shopify OAuth locally.
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok-free.dev"],
};

export default nextConfig;
