import { requirePlatformAdminPage } from "@/lib/platformAdminPageGuard";
import { navSection } from "@/lib/platformAdminNav";
import SectionHub from "../_components/SectionHub";

export const dynamic = "force-dynamic";

// Platform Admin section hub (navigation: src/lib/platformAdminNav.ts).
// The /platform-admin layout has already verified the Platform Admin account.
export default async function PlatformAdminTeamsPage() {
  await requirePlatformAdminPage();
  return <SectionHub section={navSection("teams")} />;
}
