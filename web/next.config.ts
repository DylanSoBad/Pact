import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === 'development';
const configuredConnections = [
  process.env.NEXT_PUBLIC_ARC_RPC_URL,
  process.env.NEXT_PUBLIC_ARC_RPC_FALLBACK_URL,
  process.env.NEXT_PUBLIC_ERROR_REPORT_URL,
].flatMap(value => {
  if (!value) return [];
  try { return [new URL(value).origin]; } catch { return []; }
});

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' https://rpc.testnet.arc.network https://*.walletconnect.com wss://*.walletconnect.com ${configuredConnections.join(' ')}`.trim(),
  "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  ...(!isDevelopment ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  async redirects() {
    return [
      {
        source: '/pact/:id',
        destination: '/p/:id',
        permanent: true,
      },
      {
        source: '/pacts/:id',
        destination: '/p/:id',
        permanent: true,
      },
      {
        source: '/pact',
        destination: '/',
        permanent: true,
      },
      {
        source: '/pacts',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
