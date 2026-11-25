/** @type {import('next').NextConfig} */
const apiBase = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

// One id per build. The browser compares it with /build-id.txt to notice that the server was updated.
// The config is evaluated again in build worker processes; they inherit the variable, so all agree on one id.
process.env.GIZER_BUILD_ID ??= String(Date.now());
const buildId = process.env.GIZER_BUILD_ID;

const nextConfig = {
  generateBuildId: async () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
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
      { source: "/props", destination: "/player-props", permanent: false },
    ];
  },
};

export default nextConfig;
