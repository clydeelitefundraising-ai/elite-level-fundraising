import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff, isHeadCoach } from "@/lib/permissions.server";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";

const BASE   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BUCKET = "team-files";

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

type RouteContext = { params: Promise<{ slug: string; id: string }> };

// ── Download — requires a valid team actor (coach or member) for this
// slug. Proxied through the server so the team-files bucket stays private
// and no Supabase signed-URL token round-trip is needed (avoids JWT path
// mismatch errors that occur with some Supabase storage versions).
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;

  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Look up the file record — scoped to slug for isolation
  const rowRes = await fetch(
    `${BASE}/rest/v1/team_files?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=storage_path,name&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!rowRes.ok) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const rows: { storage_path: string; name: string }[] = await rowRes.json();
  if (!rows.length) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const { storage_path, name } = rows[0];

  // 2. Fetch the file from private storage using the service role key
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const fileRes = await fetch(
    `${BASE}/storage/v1/object/${BUCKET}/${storage_path}`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    },
  );

  if (!fileRes.ok) {
    return NextResponse.json({ error: "File not available." }, { status: fileRes.status });
  }

  // 3. Stream the file to the browser with download headers
  const contentType = fileRes.headers.get("Content-Type") ?? "application/octet-stream";
  const safeFilename = encodeURIComponent(name).replace(/%20/g, "+");

  return new NextResponse(fileRes.body, {
    headers: {
      "Content-Type":        contentType,
      "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      "Cache-Control":       "private, max-age=1800",
    },
  });
}

// ── Rename — any staff (coach or booster)
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const res = await fetch(
    `${BASE}/rest/v1/team_files?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ name: name.trim() }) },
  );
  if (!res.ok) return NextResponse.json({ error: "Failed to rename file." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ── Delete — head coach only
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only head coaches can delete files." }, { status: 403 });
  }
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
    return NextResponse.json({ error: "Only head coaches can delete files." }, { status: 403 });
  }

  // Fetch storage path
  const rowRes = await fetch(
    `${BASE}/rest/v1/team_files?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=storage_path,name`,
    { headers: h() },
  );
  if (!rowRes.ok) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const rows: { storage_path: string; name: string }[] = await rowRes.json();
  if (!rows.length) return NextResponse.json({ error: "File not found." }, { status: 404 });

  // Delete DB row FIRST. Phase 7: attachment_id on clearance_resources uses
  // ON DELETE RESTRICT (see supabase/migrations/phase_7_team_hub.sql) — a
  // file still referenced by a Clearance resource cannot be deleted here.
  // Must run before the storage delete below: this row-delete is the only
  // thing that can fail-safe (RESTRICT blocks it, storage is untouched);
  // deleting storage first would orphan a live Clearance attachment's
  // underlying file if the DB delete were then blocked.
  const dbRes = await fetch(
    `${BASE}/rest/v1/team_files?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );
  if (!dbRes.ok) {
    // PostgREST surfaces a RESTRICT violation as 409 with Postgres error
    // code 23503 (foreign_key_violation) in the body. Give a clear,
    // actionable message instead of the generic 500 this route used to
    // return for any failure.
    const msg = await dbRes.text();
    if (dbRes.status === 409 || msg.includes("23503")) {
      return NextResponse.json(
        { error: "This file is used by a Clearance resource — remove or replace it there first." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to delete file record." }, { status: 500 });
  }

  // Delete from storage (best-effort) — only after the DB row is confirmed gone.
  await fetch(`${BASE}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: h(),
    body: JSON.stringify({ prefixes: [rows[0].storage_path] }),
  });

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "file.deleted",
    entity_type: "team_file",
    entity_id: id,
    campaign_slug: slug,
    summary: `Deleted file "${rows[0].name}" from ${slug}`,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
