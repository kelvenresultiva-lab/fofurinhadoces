import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      // Upload da logo (até 2 MB) passa pela Server Action; folga para o envelope multipart.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
