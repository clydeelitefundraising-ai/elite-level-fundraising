import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { isCoachOnly } from "@/lib/permissions";
import { validateCoachForCampaign } from "@/lib/platform/coachFundraising";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

type RouteCtx = { params: Promise<{ slug: string }> };

// subject is either an athlete_id or a coach_id (exactly one) — resolves
// a per-subject goal override, falling back to the single team-default
// row (athlete_id AND coach_id both null) exactly as before this
// generalization; that row's shape is unchanged, so existing athlete
// goals are unaffected.
async function resolveGoal(slug: string, subject: { athleteId: string } | { coachId: string }): Promise<number> {
  const subjectFilter = "athleteId" in subject
    ? `athlete_id=eq.${encodeURIComponent(subject.athleteId)}`
    : `coach_id=eq.${encodeURIComponent(subject.coachId)}`;
  const [perSubjectRes, teamDefaultRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${encodeURIComponent(slug)}&${subjectFilter}&select=goal&limit=1`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=is.null&coach_id=is.null&select=goal&limit=1`,
      { headers: h(), cache: "no-store" },
    ),
  ]);
  if (perSubjectRes.ok) {
    const rows = await perSubjectRes.json();
    if (rows.length > 0) return rows[0].goal as number;
  }
  if (teamDefaultRes.ok) {
    const rows = await teamDefaultRes.json();
    if (rows.length > 0) return rows[0].goal as number;
  }
  return 10;
}

// GET /api/team/[slug]/contacts
// ?summary=1 → { count, goal } (for home card)
// default    → { contacts, goal } (for ContactsView)
export async function GET(req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A participating coach manages their OWN fundraising contacts here,
  // scoped to their own session id — never a client-supplied coach id.
  // Any other staff (non-participating coach, booster) still uses
  // /coach/summary for campaign-wide reporting, unchanged.
  if (actor.kind === "coach" && isCoachOnly(actor)) {
    const eligible = await validateCoachForCampaign(actor.session.id, slug);
    if (eligible) {
      const coachId = actor.session.id;
      const isSummary = req.nextUrl.searchParams.get("summary") === "1";
      const goal = await resolveGoal(slug, { coachId });

      if (isSummary) {
        const countRes = await fetch(
          `${BASE}/rest/v1/fundraising_contacts?campaign_slug=eq.${encodeURIComponent(slug)}&coach_id=eq.${encodeURIComponent(coachId)}&select=id`,
          { headers: { ...h(), Prefer: "count=exact" }, cache: "no-store" },
        );
        const countHeader = countRes.headers.get("content-range");
        const count = countHeader ? parseInt(countHeader.split("/")[1] ?? "0", 10) : 0;
        return NextResponse.json({ count, goal });
      }

      const contactsRes = await fetch(
        `${BASE}/rest/v1/fundraising_contacts?campaign_slug=eq.${encodeURIComponent(slug)}&coach_id=eq.${encodeURIComponent(coachId)}&select=*&order=created_at.desc`,
        { headers: h(), cache: "no-store" },
      );
      if (!contactsRes.ok) {
        return NextResponse.json({ error: "Failed to load contacts." }, { status: 500 });
      }
      const contacts = await contactsRes.json();
      return NextResponse.json({ contacts, goal });
    }
  }

  // Staff (non-participating coach, booster) use /coach/summary — this
  // endpoint is member/participating-coach-only.
  if (isStaff(actor)) {
    return NextResponse.json({ error: "Use /coach/summary for staff access." }, { status: 403 });
  }
  if (actor.kind !== "member") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { session } = actor;
  if (session.role !== "athlete" && session.role !== "parent") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (!session.athlete_id) {
    return NextResponse.json({ error: "No athlete linked to this account." }, { status: 400 });
  }

  const isSummary = req.nextUrl.searchParams.get("summary") === "1";
  const athleteId = session.athlete_id;

  const goal = await resolveGoal(slug, { athleteId });

  if (isSummary) {
    const countRes = await fetch(
      `${BASE}/rest/v1/fundraising_contacts?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=eq.${encodeURIComponent(athleteId)}&select=id`,
      { headers: { ...h(), Prefer: "count=exact" }, cache: "no-store" },
    );
    const countHeader = countRes.headers.get("content-range");
    const count = countHeader ? parseInt(countHeader.split("/")[1] ?? "0", 10) : 0;
    return NextResponse.json({ count, goal });
  }

  const contactsRes = await fetch(
    `${BASE}/rest/v1/fundraising_contacts?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=eq.${encodeURIComponent(athleteId)}&select=*&order=created_at.desc`,
    { headers: h(), cache: "no-store" },
  );
  if (!contactsRes.ok) {
    return NextResponse.json({ error: "Failed to load contacts." }, { status: 500 });
  }
  const contacts = await contactsRes.json();
  return NextResponse.json({ contacts, goal });
}

const ALLOWED_RELATIONSHIPS = new Set([
  "Family","Friend","Coworker","Neighbor","Coach","Teacher","Business","Other",
]);

function validateBody(body: Record<string, unknown>): string | null {
  const phone = (body.phone as string | undefined)?.trim() || null;
  const email = (body.email as string | undefined)?.trim() || null;
  if (!phone && !email) return "At least one of phone or email is required.";
  if (phone && phone.length > 30) return "Phone must be 30 characters or fewer.";
  if (email && email.length > 254) return "Email must be 254 characters or fewer.";
  if (email && !email.includes("@")) return "Email must contain @.";
  const rel = body.relationship as string | undefined;
  if (rel && !ALLOWED_RELATIONSHIPS.has(rel)) return "Invalid relationship value.";
  const relOther = (body.relationship_other as string | undefined)?.trim() || null;
  if (relOther && relOther.length > 100) return "Relationship note must be 100 characters or fewer.";
  const firstName = (body.first_name as string | undefined)?.trim() || null;
  if (firstName && firstName.length > 100) return "First name must be 100 characters or fewer.";
  const lastName = (body.last_name as string | undefined)?.trim() || null;
  if (lastName && lastName.length > 100) return "Last name must be 100 characters or fewer.";
  const notes = (body.notes as string | undefined)?.trim() || null;
  if (notes && notes.length > 500) return "Notes must be 500 characters or fewer.";
  return null;
}

// POST /api/team/[slug]/contacts
// Athlete/parent: creates a contact for their athlete_id.
// Participating coach: creates a contact for THEIR OWN coach_id, scoped
// to their own session id — never a client-supplied coach id.
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let ownerFields: { athlete_id: string | null; coach_id: string | null; added_by_type: "athlete" | "parent" | "coach"; added_by_member_id: string | null; added_by_coach_id: string | null };

  if (actor.kind === "coach" && isCoachOnly(actor)) {
    const eligible = await validateCoachForCampaign(actor.session.id, slug);
    if (!eligible) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    ownerFields = {
      athlete_id: null,
      coach_id: actor.session.id,
      added_by_type: "coach",
      added_by_member_id: null,
      added_by_coach_id: actor.session.id,
    };
  } else if (actor.kind === "member") {
    const { session } = actor;
    if (isStaff(actor) || (session.role !== "athlete" && session.role !== "parent")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!session.athlete_id) {
      return NextResponse.json({ error: "No athlete linked to this account." }, { status: 400 });
    }
    ownerFields = {
      athlete_id: session.athlete_id,
      coach_id: null,
      added_by_type: session.role === "athlete" ? "athlete" : "parent",
      added_by_member_id: session.id,
      added_by_coach_id: null,
    };
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const validationError = validateBody(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const now = new Date().toISOString();
  const contact = {
    campaign_slug:        slug,
    ...ownerFields,
    phone:                (body.phone as string | undefined)?.trim() || null,
    email:                (body.email as string | undefined)?.trim() || null,
    first_name:           (body.first_name as string | undefined)?.trim() || null,
    last_name:            (body.last_name as string | undefined)?.trim() || null,
    relationship:         (body.relationship as string | undefined) || null,
    relationship_other:   (body.relationship_other as string | undefined)?.trim() || null,
    notes:                (body.notes as string | undefined)?.trim() || null,
    created_at:           now,
    updated_at:           now,
  };

  const res = await fetch(`${BASE}/rest/v1/fundraising_contacts`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify(contact),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as { message?: string }).message ?? "Failed to save contact." },
      { status: 500 },
    );
  }
  const [created] = await res.json();
  return NextResponse.json(created, { status: 201 });
}
