import { redirect } from "next/navigation";
import { getAdminAccess } from "@/lib/adminAccess";
import { getSponsors, getSponsorActivities, getSponsorSummary, getRenewalsDue } from "@/lib/platform/sponsors";
import SponsorDirectoryView from "./SponsorDirectoryView";
import type { SponsorDirectoryData } from "./types";

export const dynamic = "force-dynamic";

export default async function SponsorDirectoryPage() {
  if (!(await getAdminAccess())) redirect("/admin");

  const [sponsors, recentActivity, summary, renewalsDue] = await Promise.all([
    getSponsors(),
    getSponsorActivities(undefined, 20),
    getSponsorSummary(),
    getRenewalsDue(30),
  ]);

  const data: SponsorDirectoryData = { sponsors, summary, renewalsDue, recentActivity };

  return <SponsorDirectoryView data={data} />;
}
