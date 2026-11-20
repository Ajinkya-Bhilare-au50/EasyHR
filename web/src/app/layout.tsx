import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "EasyHR", template: "%s · EasyHR" },
  description: "EasyHR – attendance, leave, holidays and people for growing companies.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Sets data-theme / data-credit on <html> before first paint, so there is no flash.
            An async src script is a hoisted React resource, so React does not warn about it the
            way it does for inline <script> (and next/script's beforeInteractive runs too late). */}
        <script src="/theme-init.js" async />
      </head>
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen, Grammarly) add attributes to
          <body> before React hydrates. This ignores attribute differences on <body> only;
          mismatches anywhere inside the app are still reported. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
