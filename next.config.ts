import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Server-only packages that use worker threads / native bindings must NOT be
    // bundled by Next — bundling rewrites their internal worker paths and breaks
    // them at runtime (e.g. pino → ".next/server/vendor-chunks/lib/worker.js not
    // found"). Keep them external so they load from node_modules normally.
    serverExternalPackages: [
        'pino',
        'pino-pretty',
        'thread-stream',
        'bullmq',
        'ioredis',
        'redis',
        '@socket.io/redis-adapter',
        '@sentry/node',
        'prom-client',
    ],
    experimental: {
        serverActions: {
            bodySizeLimit: '2mb',
        },
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
    },
};

export default nextConfig;
