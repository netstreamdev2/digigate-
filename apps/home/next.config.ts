import type { NextConfig } from "next";

import { products } from "./src/products";

const nextConfig: NextConfig = {
  // The floating dev-mode badge sits over the footer in screenshots and demos.
  devIndicators: false,
  // digilog360.co.za/digigate and friends go straight to the product. Temporary, so an address can change later
  // without browsers holding on to the old one.
  redirects: async () =>
    products.flatMap((product) =>
      product.shortcuts.map((source) => ({ source, destination: product.href, permanent: false })),
    ),
};

export default nextConfig;
