/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
  output: 'export',
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  distDir: 'out',
  typescript: {
    ignoreBuildErrors: true,
  },
  // `next dev` only: extra hosts allowed to load dev resources (HMR, chunks)
  // when the app is opened by IP instead of localhost, e.g.
  // RENSAIO_DEV_ORIGINS=172.17.0.2 pnpm dev -H 0.0.0.0
  allowedDevOrigins: process.env.RENSAIO_DEV_ORIGINS
    ? process.env.RENSAIO_DEV_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined,
  // Move serverComponentsExternalPackages to root level as per Next.js 15
  serverExternalPackages: [],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.gravatar.com",
        port: "",
        pathname: "/avatar/**",
      },
    ],
  },
};

export default config;
