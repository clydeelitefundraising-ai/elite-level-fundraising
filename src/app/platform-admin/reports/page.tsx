import { redirect } from "next/navigation";

// The moderation queue moved to /platform-admin/moderation ("Reports" now
// means business reports, under Reports & Analytics). Old links and
// bookmarks keep working.
export default function PlatformAdminReportsRedirect() {
  redirect("/platform-admin/moderation");
}
