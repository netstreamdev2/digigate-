import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";

import { welcomedScript } from "./welcome-state";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://digilog360.co.za";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "DigiLog360",
  description: "Sign in to DigiLog360 or DigiGate, security products by Netstream Integrated Solutions.",
  openGraph: {
    title: "DigiLog360",
    description: "Sign in to DigiLog360 or DigiGate.",
    siteName: "DigiLog360",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#141833",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The welcome check below marks <html> before React starts, hence suppressHydrationWarning.
    <html lang="en" className={`${inter.variable} ${interTight.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: welcomedScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
