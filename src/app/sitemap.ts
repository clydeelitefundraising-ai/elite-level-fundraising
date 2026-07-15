import type { MetadataRoute } from "next";

// Only meaningful for the marketing site build (IS_APP unset) — the Team App
// deployment never gets crawled, but generating this route is harmless there.
const SITE_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://www.elitelevelfundraising.com";

const MARKETING_ROUTES = [
  "",
  "/product",
  "/fundraising",
  "/communication",
  "/sponsors",
  "/why-elf",
  "/pricing",
  "/about",
  "/contact",
  "/faq",
  "/demo",
  "/trust",
  "/trust/security",
  "/trust/privacy",
  "/trust/accessibility",
  "/trust/compliance",
  "/trust/data-protection",
  "/trust/status",
  "/trust/contact",
  "/legal/terms",
  "/legal/acceptable-use",
  "/legal/cookies",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return MARKETING_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
  }));
}
