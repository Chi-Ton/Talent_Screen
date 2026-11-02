/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    return process.env.INTERNAL_API_URL
      ? [
          { source: "/api/:path*", destination: `${process.env.INTERNAL_API_URL}/api/:path*` },
          { source: "/docs", destination: `${process.env.INTERNAL_API_URL}/docs` },
          { source: "/docs/:path*", destination: `${process.env.INTERNAL_API_URL}/docs/:path*` },
          { source: "/openapi.json", destination: `${process.env.INTERNAL_API_URL}/openapi.json` },
        ]
      : [];
  },
};

export default nextConfig;
