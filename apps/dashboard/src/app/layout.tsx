import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";

import { themeCss } from "@/theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });

export const metadata: Metadata = {
  title: "DigiGate",
  description: "Gate access control dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
      <head>
        <style>{themeCss}</style>
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
