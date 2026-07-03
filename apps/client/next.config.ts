import type { NextConfig } from 'next';

const backendUrl = process.env.BACKEND_URL || 'http://localhost:3002';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
