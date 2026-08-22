// @deprecated — prototype. Superseded by /admin (team communications are
// managed from within the real team hub). See /team-app-admin/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppAdminUpdates() {
  redirect("/admin");
}
