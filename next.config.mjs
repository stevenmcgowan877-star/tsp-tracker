/** @type {import('next').NextConfig} */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

const nextConfig = {
  reactStrictMode: true,
  env: {
    // Absolute origin for share cards; empty in local dev, set by Vercel in production.
    NEXT_PUBLIC_SITE_URL: siteUrl,
  },
};

export default nextConfig;
