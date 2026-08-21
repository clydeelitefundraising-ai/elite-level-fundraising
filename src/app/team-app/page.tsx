// @deprecated — prototype. Superseded by /team/[slug]. Do not link here.
//
// Neutralized (pilot hardening, second P0): this whole tree used to render
// entirely from mock/fabricated data (fake athletes, fake fundraising
// totals, fake announcements — see ../_data/mockData.ts) at a publicly
// reachable URL. There's no team-slug context on this route to redirect
// into a specific real team, so it sends visitors to the real, unambiguous
// entry point instead: /login. See /team/[slug]/* for the real team hub.
import { redirect } from "next/navigation";

export default function DeprecatedTeamAppRoot() {
  redirect("/login");
}
