import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const r2PublicUrl = process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL) : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: r2PublicUrl
      ? [{ protocol: r2PublicUrl.protocol === "http:" ? "http" : "https", hostname: r2PublicUrl.hostname }]
      : [],
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
