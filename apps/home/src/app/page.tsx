import { products } from "@/products";

import { Platform } from "./platform";

export default function Home() {
  const year = new Date().getFullYear();

  return (
    <div className="page">
      <Platform products={products} />

      <footer className="footer">
        <p>&copy; {year} Netstream Integrated Solutions</p>
        <p>Each product has its own secure sign-in.</p>
      </footer>
    </div>
  );
}
