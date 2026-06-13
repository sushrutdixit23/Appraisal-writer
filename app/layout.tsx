import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Appraisal Writer by Zyntask",
  description: "Turn your raw work into a polished performance review. No login required.",
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
      <body className={geist.className}>{children}</body>
    </html>
  );
}