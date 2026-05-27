import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";
import { sendPushToTeam } from "@/lib/push";

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

const VALID_CATEGORIES = new Set([
  "schedule", "fundraiser", "travel", "meet-info", "team-alert", "team",
]);
const VALID_PRIORITIES = new Set(["normal", "high", "pinned"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, body, category, priority, attachment_id } = await req.json();
  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const safeCategory = VALID_CATEGORIES.has(category) ? category : "team";
  const safePriority = VALID_PRIORITIES.has(priority)  ? priority : "normal";
  const roleLabel    = coach.role === "head_coach" ? "Head Coach" : "Assistant Coach";

  const payload: Record<string, unknown> = {
    campaign_slug: slug,
    title:        title.trim(),
    body:         body?.trim() ?? "",
    category:     safeCategory,
    priority:     safePriority,
    author_name:  coach.name,
    author_role:  roleLabel,
    coach_id:     coach.id,
  };
  if (attachment_id) payload.attachment_id = attachment_id;

  const res = await fetch(`${BASE}/rest/v1/announcements`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to create announcement: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  if (safePriority !== "normal") {
    void sendPushToTeam(slug, {
      title: title.trim(),
      body:  (body?.trim() ?? "").slice(0, 100),
      url:   `/team/${slug}/home`,
    });
  }
  return NextResponse.json(rows[0]);
}
