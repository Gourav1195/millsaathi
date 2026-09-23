import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  // Static export is for production builds only. Keeping it enabled during `next dev` disables
  // rewrites and degrades Fast Refresh — the browser keeps serving stale static output.
  ...(isDev ? {} : { output: 'export' }),
  ...(isDev ? {
    // API still runs in Wrangler on :8787 while the Next dev server handles the UI on :3000.
    async rewrites() {
      return [{ source: '/api/:path*', destination: `${process.env.MILLSAATHI_API_ORIGIN ?? 'http://127.0.0.1:8787'}/api/:path*` }];
    },
    async headers() {
      return [{
        source: '/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      }];
    },
  } : {}),
};

export default nextConfig;
