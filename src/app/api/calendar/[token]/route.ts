import { NextRequest, NextResponse } from "next/server";
import { resolveCampaignByToken } from "@/lib/calendarSubscription";
import { getCalendarEvents } from "@/lib/teamData";
import { getCampaignSettings } from "@/lib/supabase";
import { buildIcsCalendar } from "@/lib/ics";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";

// Phase 4C: PUBLIC subscription feed — fetched directly by Apple/Google
// Calendar's own servers, with no ELF session at all. Token alone
// resolves the campaign; campaign_slug is never accepted from the client
// (there is no [slug] segment in this route at all, deliberately).
//
// SECURITY:
//  - Rate limiting is scoped to the client IP only, NOT the token, and is
//    checked BEFORE the token is looked up — a 429 response therefore
//    carries zero information about whether the supplied token is valid,
//    unknown, or revoked. Only the post-rate-limit lookup can 404, and
//    unknown/malformed/revoked tokens all produce the exact same 404, so
//    there is no oracle anywhere in this route.
//  - The raw token is never logged, and no error path echoes it back.
//  - Every event read goes through resolveCampaignByToken() first — no
//    calendar data is read or returned before that succeeds.
const RATE_LIMIT = { limit: 60, windowSeconds: 300 }; // per IP, 5-minute window

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const rl = await consumeRateLimit(`rl:calendar-feed:${getClientIp(req)}`, RATE_LIMIT);
  if (!rl.allowed) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfter) },
    });
  }

  const { token: rawParam } = await params;
  const token = rawParam.endsWith(".ics") ? rawParam.slice(0, -4) : rawParam;

  const slug = await resolveCampaignByToken(token);
  if (!slug) {
    // Identical response for unknown, malformed, and revoked tokens.
    return new NextResponse("Not Found", { status: 404 });
  }

  const [settings, events] = await Promise.all([
    getCampaignSettings(slug),
    getCalendarEvents(slug),
  ]);
  if (!settings) return new NextResponse("Not Found", { status: 404 });

  const calName = `${settings.school_name} ${settings.sport_name}`.trim() || "ELF Team Calendar";
  const ics = buildIcsCalendar(events, calName);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // No Content-Disposition — this is a subscription feed, not a
      // one-time download (see /api/team/[slug]/calendar/download for that).
      "Cache-Control": "private, max-age=1800",
    },
  });
}
