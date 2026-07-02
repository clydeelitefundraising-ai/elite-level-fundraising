import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { evaluateAutomationRules, dedupKey } from "@/lib/automation/rules";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

type OpenEvent = {
  id: string;
  rule_key: string;
  campaign_slug: string | null;
  coach_id: string | null;
  crm_contact_id: string | null;
};

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const start = Date.now();

  const [{ candidates, rulesEvaluated }, openEventsRes] = await Promise.all([
    evaluateAutomationRules(),
    fetch(`${BASE}/rest/v1/automation_events?status=eq.open&select=id,rule_key,campaign_slug,coach_id,crm_contact_id&limit=2000`, {
      headers: h(), cache: "no-store",
    }),
  ]);

  const openEvents: OpenEvent[] = openEventsRes.ok ? await openEventsRes.json() : [];
  const openByKey = new Map(openEvents.map(e => [dedupKey(e), e]));
  const candidateKeys = new Set(candidates.map(dedupKey));

  const toCreate = candidates.filter(c => !openByKey.has(dedupKey(c)));
  const toResolve = openEvents.filter(e => !candidateKeys.has(dedupKey(e)));

  let eventsCreated  = 0;
  let eventsResolved = 0;

  if (toCreate.length > 0) {
    const res = await fetch(`${BASE}/rest/v1/automation_events`, {
      method:  "POST",
      // on_conflict is a no-op safety net if two runs race on the same dedup key
      headers: h({ Prefer: "return=representation, resolution=ignore-duplicates" }),
      body: JSON.stringify(toCreate.map(c => ({
        rule_key:       c.rule_key,
        severity:       c.severity,
        campaign_slug:  c.campaign_slug ?? null,
        coach_id:       c.coach_id ?? null,
        crm_contact_id: c.crm_contact_id ?? null,
        title:          c.title,
        description:    c.description ?? null,
      }))),
    });
    if (res.ok) {
      const rows = await res.json();
      eventsCreated = Array.isArray(rows) ? rows.length : 0;
    }
  }

  if (toResolve.length > 0) {
    const ids = toResolve.map(e => e.id);
    const res = await fetch(`${BASE}/rest/v1/automation_events?id=in.(${ids.join(",")})`, {
      method:  "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ status: "resolved", resolved_at: new Date().toISOString() }),
    });
    if (res.ok) eventsResolved = toResolve.length;
  }

  const executionTimeMs = Date.now() - start;

  logAuditEvent({
    action:  "automation.run",
    summary: `Automation run: ${rulesEvaluated} rules evaluated, ${eventsCreated} created, ${eventsResolved} resolved (${executionTimeMs}ms)`,
    new_value: { rulesEvaluated, eventsCreated, eventsResolved, executionTimeMs },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ rulesEvaluated, eventsCreated, eventsResolved, executionTimeMs });
}
