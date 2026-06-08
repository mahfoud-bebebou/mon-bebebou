import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { LayoutShell } from "@/components/LayoutShell";
import PWAInstaller from "./pwa";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mon Bebebou",
  description: "Application de suivi bébé — alimentation, sommeil, couches et plus",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka+One&display=swap"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#E8406A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Bébébou" />
        <link rel="apple-touch-icon" href="/logo-icon-192.png" />
      </head>
      <body className={inter.className}>
        <LayoutShell>{children}</LayoutShell>
        <PWAInstaller />
      </body>
    </html>
  );
}
