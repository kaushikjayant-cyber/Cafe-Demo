import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Menu and logo photos straight from a phone camera. The server re-encodes them to
      // small WebP files, so this only limits the upload, not what's stored.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
