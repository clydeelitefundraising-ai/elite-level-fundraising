// @deprecated — prototype. Superseded by /admin (Gear Gallery / team store
// settings live under the real team hub). See /team-app-admin/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppAdminShop() {
  redirect("/admin");
}
