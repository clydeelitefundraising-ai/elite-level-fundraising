// @deprecated — prototype. Superseded by /team/[slug]. Do not link here.
import { redirect } from "next/navigation";

// /team-app → /team-app/home
export default function TeamAppRoot() {
  redirect("/team-app/home");
}
