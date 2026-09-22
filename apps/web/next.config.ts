import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // All current App Router routes are static. The Worker serves this export and its native
  // Hono API on the same origin, so session cookies and /api requests remain same-origin.
  output: 'export',
};

export default nextConfig;
