import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/shell/providers";
// The typeface is self-hosted through @fontsource so the build never depends on a network fetch.
// wdth.css carries both axes: weight 100–900 and width 62–125.
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GIZER NBA", template: "%s · GIZER NBA" },
  description: "Private NBA quantitative research terminal. Research and paper testing only.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  applicationName: "GIZER NBA",
  appleWebApp: { capable: true, title: "GIZER NBA", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFFFFF",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
