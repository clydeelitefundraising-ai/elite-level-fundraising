// @deprecated — prototype. Superseded by /team/[slug]/roster. See /team-app/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppRoster() {
  redirect("/login");
}
