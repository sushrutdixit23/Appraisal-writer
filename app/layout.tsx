import type { Metadata } from "next";
import "./globals.css";
import PageTransition from "./components/PageTransition";

export const metadata: Metadata = {
  title: "Zyntask — Agents that work with you",
  description: "Zyntask builds AI agents that handle the work, while you keep the final call. Calm, in sync, and always moving toward done.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <script src="https://checkout.razorpay.com/v1/checkout.js" />
      </head>
      <body>
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}