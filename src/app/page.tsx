import type { Metadata } from "next";
import MarketingPage from "./MarketingPage";
import AppEntry from "./AppEntry";

// NEXT_PUBLIC_APP_URL is set only in the ELF Team App Vercel project,
// not in the marketing site project — so this evaluates at build time
// to produce different static output for each deployment.
const IS_APP = Boolean(process.env.NEXT_PUBLIC_APP_URL);

const HOME_TITLE = "Elite Level Fundraising | The Operating System for Athletic Programs";
const HOME_DESCRIPTION =
  "Fundraising, team communication, and roster management in one platform for schools and athletic programs. Proudly serving Arizona, built to scale nationwide.";

// Only the marketing build gets homepage-specific metadata — the Team App
// build keeps whatever layout.tsx already resolves for it (unindexed).
export const metadata: Metadata = IS_APP
  ? {}
  : {
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      alternates: { canonical: "/" },
      openGraph: {
        title: HOME_TITLE,
        description: HOME_DESCRIPTION,
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: HOME_TITLE,
        description: HOME_DESCRIPTION,
      },
    };

const ORG_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Elite Level Fundraising",
  url: "https://www.elitelevelfundraising.com",
  logo: "https://www.elitelevelfundraising.com/ELF.LOGO.png",
  areaServed: "Arizona, US",
};

const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Elite Level Fundraising",
  url: "https://www.elitelevelfundraising.com",
};

export default function RootPage() {
  if (IS_APP) return <AppEntry />;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_SCHEMA) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_SCHEMA) }} />
      <MarketingPage />
    </>
  );
}
