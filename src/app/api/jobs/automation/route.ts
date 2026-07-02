/**
 * POST /api/jobs/automation
 *
 * Scheduled-execution entrypoint for the automation rule engine. Not wired
 * to Vercel cron yet (no cron config exists in this project) — this route
 * exists so a future cron job, external scheduler, or manual curl can
 * trigger a run without going through the admin session cookie.
 *
 * Auth: CRON_SECRET, passed as either:
 *   Authorization: Bearer <CRON_SECRET>
 *   or ?secret=<CRON_SECRET>
 */
import { NextRequest, NextResponse } from "next/server";
import { logAudit, ipOf } from "@/lib/platform/audit";
import { runAutomationJob } from "@/lib/platform/jobs";

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
    // Missing config is a deploy/ops error, not a client error — surface it clearly
    // rather than silently allowing (or silently rejecting) every request.
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 500 },
    );
  }

  if (!authed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runAutomationJob("scheduled", { source: "api_jobs_automation" });

  logAudit({
    action:  "automation.run",
    summary: result.status === "succeeded"
      ? `Scheduled automation run: ${result.rulesEvaluated} rules evaluated, ${result.eventsCreated} created, ${result.eventsResolved} resolved (${result.durationMs}ms)`
      : `Scheduled automation run failed: ${result.error} (${result.durationMs}ms)`,
    new_value:  result,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    runId:           result.runId,
    status:          result.status,
    rulesEvaluated:  result.rulesEvaluated,
    eventsCreated:   result.eventsCreated,
    eventsResolved:  result.eventsResolved,
    executionTimeMs: result.durationMs,
    error:           result.error,
  }, { status: result.status === "failed" ? 500 : 200 });
}
