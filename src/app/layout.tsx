import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./design-system.css";
import { NativeBootstrap } from "./_components/NativeBootstrap";

// Same build-time switch as page.tsx: NEXT_PUBLIC_APP_URL is set only in the
// ELF Team App Vercel project, so this resolves to the right canonical domain
// per deployment without needing a separate env var for each project.
const IS_APP = Boolean(process.env.NEXT_PUBLIC_APP_URL);
const SITE_URL = IS_APP
  ? (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.elitelevelfundraising.com")
  : (process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://www.elitelevelfundraising.com");

const TITLE = "Elite Level Fundraising | The Operating System for Athletic Programs";
const DESCRIPTION =
  "Donation pages, team communication, and fundraising tools built for school sports programs — proudly serving Arizona schools, built to support athletic programs nationwide.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ELF Team",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Elite Level Fundraising",
    type: "website",
    // Deliberately no `images` override here — this app directory's
    // sibling opengraph-image.tsx (current ELF wordmark/brand identity,
    // replacing the old desert-logo PNG) is auto-detected by Next and used
    // as the site-wide default. Per-route pages (e.g. campaign/[slug])
    // that need a more specific image define their own generateMetadata.
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1e3d",
  // Lets content and env(safe-area-inset-*) reach into the notch/gesture-bar
  // area instead of Next's default viewport stopping short of it — TeamNav
  // already reads safe-area-inset-bottom for its padding, but that value is
  // always 0 without this.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><NativeBootstrap />{children}</body>
    </html>
  );
}
