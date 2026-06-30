import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, getAdminToken } from "@/lib/adminAuth";
import { makeCoachCookie } from "@/lib/teamAuth";
import { makeAccountCookie } from "@/lib/accountAuth";
import { makeMemberCookie } from "@/lib/memberAuth";
import { supabaseHeaders } from "@/lib/campaignCreate";
import { DEMO_SLUG, DEMO_COACH_EMAIL, DEMO_ATHLETE_EMAIL, DEMO_PARENT_EMAIL } from "@/lib/demoPersonas";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  return supabaseHeaders();
}

function errRedirect(req: NextRequest, code: string): NextResponse {
  return NextResponse.redirect(new URL(`/admin/demo?launch_error=${code}`, req.url));
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path:     "/",
  maxAge:   60 * 60 * 4, // 4-hour demo session
};

export async function GET(req: NextRequest) {
  const persona = req.nextUrl.searchParams.get("persona") ?? "";

  // Public: no auth needed, direct link to campaign
  if (persona === "public") {
    return NextResponse.redirect(new URL(`/campaign/${DEMO_SLUG}`, req.url));
  }

  // All other personas require admin to be authenticated
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // --- Admin ---
  if (persona === "admin") {
    const token = getAdminToken();
    if (!token) return errRedirect(req, "admin_config");
    const res = NextResponse.redirect(new URL("/admin/dashboard", req.url));
    res.cookies.set("elf_admin", token, COOKIE_OPTS);
    return res;
  }

  // --- Coach ---
  if (persona === "coach") {
    const coachRes = await fetch(
      `${BASE}/rest/v1/team_coaches?email=eq.${encodeURIComponent(DEMO_COACH_EMAIL)}&campaign_slug=eq.${encodeURIComponent(DEMO_SLUG)}&select=id,salt&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const coaches: { id: string; salt: string }[] = coachRes.ok ? await coachRes.json() : [];
    if (!coaches[0]) return errRedirect(req, "no_coach");
    const res = NextResponse.redirect(new URL(`/team/${DEMO_SLUG}/home`, req.url));
    res.cookies.set("team_coach", makeCoachCookie(coaches[0].id, coaches[0].salt), COOKIE_OPTS);
    return res;
  }

  // --- Athlete or Parent ---
  if (persona === "athlete" || persona === "parent") {
    const email = persona === "athlete" ? DEMO_ATHLETE_EMAIL : DEMO_PARENT_EMAIL;

    // Get elf_account for session cookie
    const acctRes = await fetch(
      `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(email)}&select=id,salt&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const accounts: { id: string; salt: string }[] = acctRes.ok ? await acctRes.json() : [];
    if (!accounts[0]) return errRedirect(req, `no_${persona}`);
    const acct = accounts[0];

    // Get team_members row for member cookie
    const memberRes = await fetch(
      `${BASE}/rest/v1/team_members?account_id=eq.${encodeURIComponent(acct.id)}&campaign_slug=eq.${encodeURIComponent(DEMO_SLUG)}&select=id,salt&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const members: { id: string; salt: string }[] = memberRes.ok ? await memberRes.json() : [];
    if (!members[0]) return errRedirect(req, `no_${persona}_member`);
    const member = members[0];

    const res = NextResponse.redirect(new URL(`/team/${DEMO_SLUG}/home`, req.url));
    res.cookies.set("elf_session",  makeAccountCookie(acct.id,   acct.salt),   COOKIE_OPTS);
    res.cookies.set("team_member",  makeMemberCookie(member.id, member.salt), COOKIE_OPTS);
    return res;
  }

  return NextResponse.json({ error: "Unknown persona" }, { status: 400 });
}
