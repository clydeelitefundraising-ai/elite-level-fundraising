import { navSection } from "@/lib/platformAdminNav";
import SectionHub from "../_components/SectionHub";

export const dynamic = "force-dynamic";

// Platform Admin section hub (navigation: src/lib/platformAdminNav.ts).
// The /platform-admin layout has already verified the Platform Admin account.
export default function PlatformAdminAnalyticsPage() {
  return <SectionHub section={navSection("analytics")} />;
}
