/** @type {import('next').NextConfig} */
const apiBase = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiBase}/api/v1/:path*` }];
  },
  async redirects() {
    return [
      { source: "/today", destination: "/", permanent: false },
      { source: "/research", destination: "/research/daily", permanent: false },
    ];
  },
};

export default nextConfig;
