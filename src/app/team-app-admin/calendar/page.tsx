// @deprecated — prototype. Superseded by /admin/campaigns/[slug] (calendar
// management). See /team-app-admin/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppAdminCalendar() {
  redirect("/admin");
}
