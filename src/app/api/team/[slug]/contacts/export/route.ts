import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type RouteCtx = { params: Promise<{ slug: string }> };

type RawContact = {
  id: string;
  athlete_id: string;
  phone: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  relationship: string | null;
  relationship_other: string | null;
  notes: string | null;
  added_by_type: string;
  created_at: string;
  athletes: { name: string } | null;
  team_members: { name: string; role: string } | null;
  team_coaches: { name: string } | null;
};

function csvEscape(val: string | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toRow(c: RawContact): string {
  const addedBy =
    c.added_by_type === "coach"
      ? `Coach: ${c.team_coaches?.name ?? ""}`
      : `${c.added_by_type === "athlete" ? "Athlete" : "Parent"}: ${c.team_members?.name ?? ""}`;

  const relationship =
    c.relationship === "Other" && c.relationship_other
      ? `Other: ${c.relationship_other}`
      : (c.relationship ?? "");

  return [
    c.athlete_id,
    c.athletes?.name ?? "",
    c.first_name ?? "",
    c.last_name ?? "",
    c.phone ?? "",
    c.email ?? "",
    relationship,
    c.notes ?? "",
    addedBy,
    c.created_at,
  ].map(csvEscape).join(",");
}

const CSV_HEADER =
  "athlete_id,athlete_name,first_name,last_name,phone,email,relationship,notes,added_by,created_at";

// GET /api/team/[slug]/contacts/export
// ?athleteId=xxx → per-athlete export
// default        → master export (all contacts)
// Staff only.
export async function GET(req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public" || !isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const athleteId = req.nextUrl.searchParams.get("athleteId");
  const athleteFilter = athleteId
    ? `&athlete_id=eq.${encodeURIComponent(athleteId)}`
    : "";

  const select =
    "id,athlete_id,phone,email,first_name,last_name,relationship,relationship_other,notes,added_by_type,created_at," +
    "athletes!athlete_id(name)," +
    "team_members!added_by_member_id(name,role)," +
    "team_coaches!added_by_coach_id(name)";

  const res = await fetch(
    `${BASE}/rest/v1/fundraising_contacts?campaign_slug=eq.${encodeURIComponent(slug)}${athleteFilter}&select=${encodeURIComponent(select)}&order=athlete_id.asc,created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to load contacts." }, { status: 500 });
  }
  const contacts: RawContact[] = await res.json();

  const date     = new Date().toISOString().slice(0, 10);
  const filename = athleteId
    ? `contacts-${slug}-athlete-${date}.csv`
    : `contacts-${slug}-master-${date}.csv`;

  const csv = [CSV_HEADER, ...contacts.map(toRow)].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
