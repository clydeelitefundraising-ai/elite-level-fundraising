import type { Metadata } from "next";
import CampaignPageClient from "../_shared/CampaignPageClient";
import { getCampaignSettings } from "@/lib/supabase";
import { getAthleteById } from "@/lib/teamData";
import { buildCampaignMetadata } from "@/lib/shareCopy";

type RouteParams = { slug: string };
type RouteSearchParams = { athlete?: string };

// Per-campaign (and, via ?athlete=<id>, per-athlete) share-link metadata.
// Previously this page had no generateMetadata at all, so every share
// (team-wide or athlete-specific) fell through to the site-wide default in
// layout.tsx — same generic title/description and the old desert-logo
// image for every campaign and every athlete. This builds real title/
// description/OG-image data from the actual campaign + athlete, reusing
// the same share-copy wording used by the in-app "Share Fundraiser"
// buttons (lib/shareCopy.ts) so the two stay consistent.
export async function generateMetadata(
  { params, searchParams }: { params: Promise<RouteParams>; searchParams: Promise<RouteSearchParams> },
): Promise<Metadata> {
  const { slug } = await params;
  const { athlete: athleteId } = await searchParams;

  const [settings, athlete] = await Promise.all([
    getCampaignSettings(slug),
    athleteId ? getAthleteById(athleteId) : Promise.resolve(null),
  ]);

  if (!settings) {
    return { title: "Fundraiser | Elite Level Fundraising" };
  }

  const teamLabel = [settings.school_name, settings.mascot, settings.sport_name].filter(Boolean).join(" ");
  const athleteName = athlete && athlete.campaign_slug === slug ? athlete.name : null;

  const { title, description } = buildCampaignMetadata({
    athleteName,
    teamLabel,
    schoolName: settings.school_name,
    sportName:  settings.sport_name,
  });

  const ogImageUrl = `/api/og?slug=${encodeURIComponent(slug)}${athleteName ? `&athlete=${encodeURIComponent(athleteId!)}` : ""}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function CampaignPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  return <CampaignPageClient slug={slug} />;
}
