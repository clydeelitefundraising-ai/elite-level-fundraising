// @deprecated — prototype. Superseded by /team/[slug]/home. See /team-app/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppHome() {
  redirect("/login");
}
