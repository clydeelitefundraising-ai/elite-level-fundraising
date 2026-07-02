import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAudit, ipOf } from "@/lib/platform/audit";
import { runRules } from "@/lib/platform/automation";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await runRules();

  logAudit({
    action:  "automation.run",
    summary: `Automation run: ${result.rulesEvaluated} rules evaluated, ${result.eventsCreated} created, ${result.eventsResolved} resolved (${result.executionTimeMs}ms)`,
    new_value:  result,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json(result);
}
