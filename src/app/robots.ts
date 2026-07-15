import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://www.elitelevelfundraising.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/team", "/login", "/coach-login", "/enter-code", "/join"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
