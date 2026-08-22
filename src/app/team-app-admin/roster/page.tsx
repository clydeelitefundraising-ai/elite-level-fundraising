// @deprecated — prototype. Superseded by /admin/campaigns/[slug] (roster
// management). See /team-app-admin/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppAdminRoster() {
  redirect("/admin");
}
