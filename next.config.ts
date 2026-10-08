import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=86400' },
      { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests" },
    ] }];
  },
  /* Human Assistant was renamed Human Support; its first address was live
     briefly, so anyone holding the old link lands on the new page. */
  async redirects() {
    return [
      { source: "/products/human-assistant", destination: "/products/human-support", permanent: true },
      { source: "/global/products/human-assistant", destination: "/global/products/human-support", permanent: true },
    ];
  },
};

export default nextConfig;
