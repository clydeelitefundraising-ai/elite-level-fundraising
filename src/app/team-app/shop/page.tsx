// @deprecated — prototype. Superseded by /team/[slug]/shop. See /team-app/page.tsx.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppShop() {
  redirect("/login");
}
