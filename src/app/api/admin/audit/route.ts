import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

type AuditLog = {
  id:               string;
  created_at:       string;
  admin_identifier: string | null;
  action:           string;
  entity_type:      string | null;
  entity_id:        string | null;
  campaign_slug:    string | null;
  summary:          string | null;
  previous_value:   Record<string, unknown> | null;
  new_value:        Record<string, unknown> | null;
  ip_address:       string | null;
  user_agent:       string | null;
};

export async function GET(req: NextRequest) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp       = req.nextUrl.searchParams;
  const page     = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const perPage  = 50;
  const campaign = sp.get("campaign") ?? "";
  const action   = sp.get("action")   ?? "";
  const search   = sp.get("search")   ?? "";
  const from     = sp.get("from")     ?? "";
  const to       = sp.get("to")       ?? "";

  const filters: string[] = [];
  if (campaign && campaign !== "all") filters.push(`campaign_slug=eq.${encodeURIComponent(campaign)}`);
  if (action)  filters.push(`action=eq.${encodeURIComponent(action)}`);
  if (from)    filters.push(`created_at=gte.${encodeURIComponent(from)}`);
  if (to)      filters.push(`created_at=lte.${encodeURIComponent(to + "T23:59:59.999Z")}`);

  const qs = filters.length ? "&" + filters.join("&") : "";

  const res = await fetch(
    `${BASE}/rest/v1/audit_logs?select=*&order=created_at.desc&limit=500${qs}`,
    { headers: h(), cache: "no-store" },
  );

  if (!res.ok) {
    // Table may not exist yet (migration not run)
    return NextResponse.json({ rows: [], total: 0, page: 1, per_page: perPage });
  }

  let rows: AuditLog[] = await res.json();

  if (search.trim()) {
    const q = search.toLowerCase().trim();
    rows = rows.filter(r =>
      r.summary?.toLowerCase().includes(q)      ||
      r.action.toLowerCase().includes(q)         ||
      r.campaign_slug?.toLowerCase().includes(q) ||
      r.entity_id?.toLowerCase().includes(q)     ||
      r.entity_type?.toLowerCase().includes(q)
    );
  }

  const total  = rows.length;
  const offset = (page - 1) * perPage;
  const slice  = rows.slice(offset, offset + perPage);

  return NextResponse.json({ rows: slice, total, page, per_page: perPage });
}
