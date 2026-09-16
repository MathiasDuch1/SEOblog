import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const r2PublicUrl = process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL) : null;

const nextConfig: NextConfig = {
  // `global-not-found.tsx` handles URLs that match no route. It is needed here because the
  // root layout lives under a dynamic `[host]` segment, so there is no single layout to
  // compose a global 404 from.
  experimental: {
    globalNotFound: true,
  },
  images: {
    remotePatterns: [
      ...(r2PublicUrl
        ? [{ protocol: r2PublicUrl.protocol === "http:" ? "http" as const : "https" as const, hostname: r2PublicUrl.hostname }]
        : []),
      // Affiliate product images. Real marketplace hosts are added in phase 03 alongside
      // the product feed; `picsum.photos` only serves the seed fixtures.
      { protocol: "https" as const, hostname: "picsum.photos" },
      { protocol: "https" as const, hostname: "fastly.picsum.photos" },
    ],
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
