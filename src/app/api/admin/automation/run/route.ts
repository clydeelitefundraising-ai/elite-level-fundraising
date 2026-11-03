import { NextRequest, NextResponse } from "next/server";
import { logAudit, ipOf } from "@/lib/platform/audit";
import { runAutomationJob } from "@/lib/platform/jobs";
import { getAdminAccess, adminUnauthorized, adminAuditActor } from "@/lib/adminAccess";

export async function POST(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();

  const result = await runAutomationJob("manual", { source: "admin_dashboard" });

  logAudit({
    actor: adminAuditActor(access),
    action:  "automation.run",
    summary: result.status === "succeeded"
      ? `Automation run: ${result.rulesEvaluated} rules evaluated, ${result.eventsCreated} created, ${result.eventsResolved} resolved (${result.durationMs}ms)`
      : `Automation run failed: ${result.error} (${result.durationMs}ms)`,
    new_value:  result,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({
    runId:          result.runId,
    status:         result.status,
    rulesEvaluated: result.rulesEvaluated,
    eventsCreated:  result.eventsCreated,
    eventsResolved: result.eventsResolved,
    executionTimeMs: result.durationMs,
    error:          result.error,
  }, { status: result.status === "failed" ? 500 : 200 });
}
