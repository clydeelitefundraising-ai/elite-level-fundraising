// @deprecated — static hardcoded demo. Superseded by /campaign/[slug]. Do not link here.
import CampaignPageClient from "../_shared/CampaignPageClient";

// CampaignPageClient now reads useSearchParams() — force-dynamic keeps this
// deprecated route buildable without needing a Suspense boundary.
export const dynamic = "force-dynamic";

export default function CampaignLivePage() {
  return <CampaignPageClient slug="paradise-valley-track-field-live" />;
}
