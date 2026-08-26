import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAudit, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/platform/audit";
import { runAutomationJob } from "@/lib/platform/jobs";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await runAutomationJob("manual", { source: "admin_dashboard" });

  logAudit({
    actor: ADMIN_TOOL_ACTOR,
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
