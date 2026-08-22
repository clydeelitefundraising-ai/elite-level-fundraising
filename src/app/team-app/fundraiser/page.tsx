// @deprecated — prototype. Superseded by /team/[slug]/fundraiser. See /team-app/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppFundraiser() {
  redirect("/login");
}
