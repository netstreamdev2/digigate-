import { products } from "@/products";

import { Chooser } from "./chooser";

export default function Home() {
  const year = new Date().getFullYear();

  return (
    <div className="page">
      <Chooser products={products} />

      <footer className="footer">
        <p>&copy; {year} Netstream Integrated Solutions</p>
        <p>Each product has its own secure sign-in.</p>
      </footer>
    </div>
  );
}
