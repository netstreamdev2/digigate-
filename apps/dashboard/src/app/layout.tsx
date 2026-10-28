import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DigiGate",
  description: "Gate access control dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
