// @deprecated — prototype. Superseded by /admin/campaigns/[slug] (branding
// settings). See /team-app-admin/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppAdminTeamProfile() {
  redirect("/admin");
}
