// @deprecated — prototype. Superseded by /admin/campaigns/[slug] (fundraising
// settings). See /team-app-admin/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppAdminFundraiser() {
  redirect("/admin");
}
