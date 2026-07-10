import type { Metadata, Viewport } from "next";
import "./globals.css";
export const dynamic = "force-dynamic";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#EDF0F6",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://zyntask.in"),
  title: "Zyntask - Agents that work with you",
  description: "Zyntask builds AI agents that handle the work, while you keep the final call.",
  openGraph: {
    title: "Zyntask - your professional copilot",
    description: "AI that drafts the work. You make every call.",
    url: "https://zyntask.in",
    siteName: "Zyntask",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Zyntask - your professional copilot",
    description: "AI that drafts the work. You make every call.",
    images: ["/og-image.png"],
  },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body>{children}</body>
    </html>
  );
}
