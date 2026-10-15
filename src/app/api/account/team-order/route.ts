import { NextRequest, NextResponse } from "next/server";
import { getAccountSession, getAccountTeams } from "@/lib/accountSession";
import { saveTeamOrder } from "@/lib/accountTeamOrder";
import { MAX_SAVED_TEAM_SLUGS, dedupeTeamSlugs } from "@/lib/teamOrder";

// Custom Team Ordering: saves the signed-in account's preferred team order
// (whole list, from the Team Selector's Reorder → Done). Account-scoped via
// getAccountSession(), like /api/push/preferences — the order belongs to the
// person, not one team. Only slugs this account currently belongs to (the
// same list getAccountTeams() shows them) are accepted, so nothing here can
// reveal or reference a team the account isn't on. Never touches
// membership or roles.
export async function PUT(req: NextRequest) {
  const account = await getAccountSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const raw: unknown = body?.team_slugs;
  if (!Array.isArray(raw) || raw.length > MAX_SAVED_TEAM_SLUGS || raw.some(s => typeof s !== "string")) {
    return NextResponse.json({ error: "team_slugs must be a list of team slugs." }, { status: 400 });
  }

  const slugs = dedupeTeamSlugs(raw);
  const memberOf = new Set((await getAccountTeams(account.id)).map(t => t.campaign_slug));
  if (slugs.some(s => !memberOf.has(s))) {
    return NextResponse.json({ error: "You can only order teams you belong to." }, { status: 403 });
  }

  const result = await saveTeamOrder(account.id, slugs);
  if (!result.ok) {
    return result.reason === "unavailable"
      ? NextResponse.json({ error: "Team ordering isn't available yet." }, { status: 503 })
      : NextResponse.json({ error: "Couldn't save your team order." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, team_slugs: slugs });
}
