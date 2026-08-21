import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { VALID_EVENT_TYPES } from "@/lib/calendarShared";
import { getTeamIdBySlug, createNotification } from "@/lib/notifications";
import { getAccountIdsForScope } from "@/lib/pushRecipients";
import { dispatchApnsPush } from "@/lib/apns";

// Phase 10: shared by both edit and cancel below — a failure here must
// never fail the event mutation that already succeeded.
function notifyCalendarChange(slug: string, eventId: string, eventTitle: string | undefined, changeLabel: string) {
  void (async () => {
    try {
      const teamId = await getTeamIdBySlug(slug);
      if (!teamId) return;
      await createNotification(teamId, {
        type: "calendar_event",
        title: "Calendar Updated",
        body: `${eventTitle ?? "An event"} ${changeLabel}`.slice(0, 140),
        reference_id: eventId,
        reference_url: `/team/${slug}/calendar`,
        recipient_scope: "everyone",
      });
      const accountIds = await getAccountIdsForScope(slug, "everyone", null);
      await dispatchApnsPush({
        accountIds,
        category: "calendar",
        kind: "calendar_event",
        ctx: {},
        url: `/team/${slug}/calendar`,
      });
    } catch (err) {
      console.error("[events] notification/push failed:", err);
    }
  })();
}

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

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, event_date, event_time, location, type, description, start_time, end_time } = await req.json();

  const patch: Record<string, unknown> = {};
  if (title?.trim())          patch.title      = title.trim();
  if (event_date)             patch.event_date  = event_date;
  // Phase 4A: the edit form no longer submits event_time at all (no free-
  // text Time field in the UI anymore), so this key is simply absent from
  // the request body for every edit made through the new form — leaving
  // this historical column completely untouched. Still defensively
  // supported here in case anything else ever needs to set it explicitly.
  if (event_time !== undefined) patch.event_time = event_time?.trim() ?? "";
  if (location   !== undefined) patch.location   = location?.trim() ?? "";
  if (VALID_EVENT_TYPES.has(type)) patch.type    = type;
  if (description !== undefined) patch.description = description?.trim() ? description.trim() : null;
  if (start_time  !== undefined) patch.start_time   = start_time?.trim()  ? start_time.trim()  : null;
  if (end_time    !== undefined) patch.end_time     = end_time?.trim()    ? end_time.trim()    : null;

  const res = await fetch(
    `${BASE}/rest/v1/calendar_events?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify(patch),
    },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  notifyCalendarChange(slug, id, title?.trim(), "schedule updated");
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${BASE}/rest/v1/calendar_events?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  notifyCalendarChange(slug, id, undefined, "was cancelled");
  return NextResponse.json({ ok: true });
}
