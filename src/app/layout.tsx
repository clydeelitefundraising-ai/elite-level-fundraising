import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./design-system.css";
import { AppStoreProvider } from "./_store/AppStore";

export const metadata: Metadata = {
  title: "Elite Level Fundraising | Arizona School Sports Teams",
  description:
    "We help Arizona school sports teams raise more money with simple donation pages, corporate sponsor outreach, and custom team merchandise shops.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ELF Team",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1e3d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><AppStoreProvider>{children}</AppStoreProvider></body>
    </html>
  );
}
