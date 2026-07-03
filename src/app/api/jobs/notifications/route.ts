/**
 * POST /api/jobs/notifications
 *
 * Scheduled-execution entrypoint for the notification delivery queue.
 * Mirrors /api/jobs/automation: not wired to Vercel cron yet, exists so a
 * future cron job, external scheduler, or manual curl can drain the queue
 * without an admin session cookie.
 *
 * Auth: CRON_SECRET, passed as either:
 *   Authorization: Bearer <CRON_SECRET>
 *   or ?secret=<CRON_SECRET>
 */
import { NextRequest, NextResponse } from "next/server";
import { logAudit, ipOf } from "@/lib/platform/audit";
import { processQueue } from "@/lib/platform/notificationJobs";

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const queryToken = req.nextUrl.searchParams.get("secret");
  if (queryToken === secret) return true;

  return false;
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 500 },
    );
  }

  if (!authed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processQueue();

  logAudit({
    action:  "notifications.process_queue",
    summary: `Notification queue processed: ${result.processed} processed, ${result.sent} sent, ${result.failed} failed (${result.durationMs}ms)`,
    new_value:  result,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    queued:     result.queued,
    processed:  result.processed,
    sent:       result.sent,
    failed:     result.failed,
    duration:   result.durationMs,
  });
}
