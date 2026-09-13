import { NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { deleteAccount } from "@/lib/accountDeletion";

// Deletes the caller's own elf_accounts login entirely (see
// accountDeletion.ts for the full rationale) — not scoped to just the
// team this request happened to originate from. Reachable from any
// team's Settings page since that's the only place a logged-in user
// currently sees an Account section, but the effect is account-wide.
export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await deleteAccount(actor);
  if (!result.ok) {
    if (result.reason === "no_linked_account") {
      return NextResponse.json({ error: "No linked login account was found for this session." }, { status: 400 });
    }
    if (result.reason === "last_platform_admin") {
      return NextResponse.json(
        { error: "You are the only Platform Admin. Add another platform admin before deleting your account." },
        { status: 409 },
      );
    }
    if (result.reason === "head_coach_blocker") {
      return NextResponse.json(
        {
          error:
            "You're the only Head Coach on " +
            `${result.campaigns.length === 1 ? "a team" : "teams"} (${result.campaigns.join(", ")}). ` +
            "Promote another coach to Head Coach on each of those teams before deleting your account.",
          campaigns: result.campaigns,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to delete account. Please try again." }, { status: 500 });
  }

  // elf_accounts row is already gone at this point (deleteAccount()
  // deleted it) — the account no longer exists to verify a cookie
  // against, so this is belt-and-suspenders cleanup on top of what
  // already makes the old cookie unverifiable. Same clearing pattern as
  // /api/auth/logout/route.ts.
  const res = NextResponse.json({ ok: true });
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 0 };
  res.cookies.set("elf_session", "", opts);
  res.cookies.set("team_coach",  "", opts);
  res.cookies.set("team_member", "", opts);
  return res;
}
