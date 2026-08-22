// @deprecated — prototype. Superseded by /admin. Do not link here.
//
// Neutralized (pilot hardening, second P0): this whole tree used to render
// entirely from mock/fabricated data (fake athletes, fake fundraising
// totals, fake events, fake updates — see ../team-app/_data/mockData.ts)
// at a publicly reachable URL. /admin is the real, single, unambiguous
// admin destination (its own auth gate), so redirecting there is safe —
// unlike /team-app/*, there's no "which team" ambiguity to worry about.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppAdminRoot() {
  redirect("/admin");
}
