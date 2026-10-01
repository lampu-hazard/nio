import type { NextConfig } from 'next';

const backendUrl = process.env.BACKEND_URL || 'http://nio-server:3002';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backendUrl}/:path*` },
      { source: '/auth/discord/callback', destination: `${backendUrl}/auth/discord/callback` },
      { source: '/auth/:path*', destination: `${backendUrl}/auth/:path*` },
    ];
  },
};

export default nextConfig;
