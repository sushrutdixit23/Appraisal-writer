import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Zyntask - Agents that work with you",
  description: "Zyntask builds AI agents that handle the work, while you keep the final call.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
