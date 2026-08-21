// @deprecated — this route used to be a fully static hardcoded demo page
// (fake donations, fake athletes, fake sponsors, presented with no demo
// labeling on a publicly reachable URL). It has been superseded by the
// real, database-backed /campaign/[slug] route since Phase 3D. Rather than
// leave fabricated financial/donor data reachable at this URL indefinitely,
// this route now redirects to the real live campaign it was standing in
// for. See CampaignPageClient.tsx for the shared, real-data page.
import { redirect } from "next/navigation";

export default function DeprecatedParadiseValleyDemoPage() {
  redirect("/campaign/paradise-valley-track-field-live");
}
