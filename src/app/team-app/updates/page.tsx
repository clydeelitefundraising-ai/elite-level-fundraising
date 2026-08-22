// @deprecated — prototype. Superseded by /team/[slug]/communications. See /team-app/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppUpdates() {
  redirect("/login");
}
