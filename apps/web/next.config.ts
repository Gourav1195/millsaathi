import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep the existing Worker as the API source while its routes are ported to Node.
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN;
    return apiOrigin ? [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }] : [];
  },
};

export default nextConfig;
