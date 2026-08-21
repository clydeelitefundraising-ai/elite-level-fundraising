// @deprecated — prototype. Superseded by /team/[slug]/calendar. See /team-app/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppCalendar() {
  redirect("/login");
}
