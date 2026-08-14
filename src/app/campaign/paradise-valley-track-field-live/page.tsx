// @deprecated — static hardcoded demo. Superseded by /campaign/[slug]. Do not link here.
import CampaignPageClient from "../_shared/CampaignPageClient";

// Phase 3A-1 share-path fix: CampaignPageClient now reads useSearchParams()
// (to prefill a shared athlete link), which requires either a Suspense
// boundary or dynamic rendering to avoid a static-prerender build error.
// This route takes no params and would otherwise be statically generated;
// force-dynamic is the minimal fix for this already-deprecated demo page
// specifically — the real /campaign/[slug] route is unaffected (dynamic
// segments aren't statically prerendered here).
export const dynamic = "force-dynamic";

export default function CampaignLivePage() {
  return <CampaignPageClient slug="paradise-valley-track-field-live" />;
}
