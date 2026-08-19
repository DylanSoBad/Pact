import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
