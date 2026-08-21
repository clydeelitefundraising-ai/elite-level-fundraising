import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { sendPushToTeam } from "@/lib/push";
import { VALID_EVENT_TYPES } from "@/lib/calendarShared";
import { getTeamIdBySlug, createNotification } from "@/lib/notifications";
import { getAccountIdsForScope } from "@/lib/pushRecipients";
import { dispatchApnsPush } from "@/lib/apns";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, event_date, event_time, location, type, description, start_time, end_time } = await req.json();
  if (!title?.trim() || !event_date) {
    return NextResponse.json({ error: "title and event_date are required" }, { status: 400 });
  }

  const safeType = VALID_EVENT_TYPES.has(type) ? type : "team";

  const res = await fetch(`${BASE}/rest/v1/calendar_events`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({
      campaign_slug: slug,
      title:      title.trim(),
      event_date,
      // Legacy free-text field — the create form no longer exposes it, so
      // this only ever writes "" for events created after Phase 4A. Kept
      // accepted here defensively; no caller sends it anymore.
      event_time: event_time?.trim() ?? "",
      location:   location?.trim() ?? "",
      type:       safeType,
      description: description?.trim() ? description.trim() : null,
      start_time:  start_time?.trim() ? start_time.trim() : null,
      end_time:    end_time?.trim()   ? end_time.trim()   : null,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to create event: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();

  void sendPushToTeam(slug, {
    title: `Event Added: ${title.trim()}`,
    body:  [event_date, location?.trim()].filter(Boolean).join(" · "),
    url:   `/team/${slug}/calendar`,
  });

  // Phase 10: canonical notification row + native push, fire-and-forget —
  // a failure here must never fail event creation (already succeeded above).
  void (async () => {
    try {
      const teamId = await getTeamIdBySlug(slug);
      if (!teamId) return;
      await createNotification(teamId, {
        type: "calendar_event",
        title: "Calendar Updated",
        body: `${title.trim()} added to the calendar`.slice(0, 140),
        reference_id: rows[0]?.id ?? null,
        reference_url: `/team/${slug}/calendar`,
        recipient_scope: "everyone",
      });
      const accountIds = await getAccountIdsForScope(slug, "everyone", null);
      await dispatchApnsPush({
        accountIds,
        category: "calendar",
        kind: "calendar_event",
        ctx: { eventTitle: title.trim() },
        url: `/team/${slug}/calendar`,
      });
    } catch (err) {
      console.error("[events] notification/push failed:", err);
    }
  })();

  return NextResponse.json(rows[0]);
}
