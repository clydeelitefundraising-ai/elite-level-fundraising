import { requirePlatformAdminPage } from "@/lib/platformAdminPageGuard";
import { redirect } from "next/navigation";

// The moderation queue moved to /platform-admin/moderation ("Reports" now
// means business reports, under Reports & Analytics). Old links and
// bookmarks keep working.
export default async function PlatformAdminReportsRedirect() {
  await requirePlatformAdminPage();
  redirect("/platform-admin/moderation");
}
