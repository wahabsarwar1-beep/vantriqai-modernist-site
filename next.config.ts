import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
