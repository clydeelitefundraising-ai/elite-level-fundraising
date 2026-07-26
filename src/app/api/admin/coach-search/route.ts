import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { searchCoachAccounts, getCoachById } from "@/lib/coachAssignment";

// Admin-only, authenticated coach lookup for the "Select Existing Coach"
// mode of the New Campaign wizard. Deliberately NOT reachable from any
// team-member/public route — only platform admins can search across coach
// accounts. Never returns password hashes, salts, or any account beyond
// name/email/current-teams.
async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    try {
      const account = await getCoachById(id);
      return NextResponse.json({ results: account ? [account] : [] });
    } catch (err) {
      console.error("[coach-search] id lookup failed:", err);
      return NextResponse.json({ error: "Lookup failed. Please try again." }, { status: 500 });
    }
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ results: [] });

  try {
    const results = await searchCoachAccounts(q, 8);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[coach-search] failed:", err);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
