const isProductionBuild = process.env.NODE_ENV === "production";

if (isProductionBuild && !process.env.NEXT_PUBLIC_API_URL?.trim()) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is required for production builds. Set it to the deployed backend URL.",
  );
}

/** @type {import('next').NextConfig} */
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
  runtimeCaching: [
    // Delivery queue — serve stale while revalidating
    {
      urlPattern: /^https?.*\/api\/v1\/deliveries/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "deliveries-cache",
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
      },
    },
    // Robot status — network first with offline fallback
    {
      urlPattern: /^https?.*\/api\/v1\/robots/,
      handler: "NetworkFirst",
      options: {
        cacheName: "robot-status-cache",
        expiration: { maxEntries: 20, maxAgeSeconds: 30 },
        networkTimeoutSeconds: 5,
      },
    },
    // Camera snapshots (recent 10)
    {
      urlPattern: /^https?.*\/api\/v1\/camera/,
      handler: "CacheFirst",
      options: {
        cacheName: "camera-cache",
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    // Static image assets
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|ico|webp)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "static-images",
        expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    // Fonts
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
    // Everything else — network first
    {
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "default-cache",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
        networkTimeoutSeconds: 10,
      },
    },
  ],
});

const nextConfig = withPWA({
  reactStrictMode: true,
  trailingSlash: true,
  // PWA plugin injects webpack config; acknowledge Turbopack for `next dev` (PWA is off in dev).
  turbopack: {},
});

module.exports = nextConfig;
