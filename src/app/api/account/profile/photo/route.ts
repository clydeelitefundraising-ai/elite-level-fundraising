import { NextResponse } from "next/server";
import { getAccountSession } from "@/lib/accountSession";
import sharp from "sharp";

const BASE    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BUCKET  = "profile-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function serviceHeaders(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function propagateToAthletes(accountId: string, url: string | null) {
  const res = await fetch(
    `${BASE}/rest/v1/team_members?account_id=eq.${encodeURIComponent(accountId)}&athlete_id=not.is.null&select=athlete_id`,
    { headers: serviceHeaders(), cache: "no-store" },
  );
  if (!res.ok) return;
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return;
  await Promise.all(
    rows.map((m: { athlete_id: string }) =>
      fetch(
        `${BASE}/rest/v1/athletes?id=eq.${encodeURIComponent(m.athlete_id)}`,
        {
          method:  "PATCH",
          headers: serviceHeaders({ Prefer: "return=minimal" }),
          body:    JSON.stringify({ profile_photo: url }),
        },
      ),
    ),
  );
}

export async function POST(req: Request) {
  const session = await getAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("photo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "photo file required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "File must be JPEG, PNG, WebP, or HEIC" }, { status: 415 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });
  }

  let processed: Buffer;
  try {
    processed = await sharp(buf)
      .rotate()
      .resize(400, 400, { fit: "cover", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to process image" }, { status: 422 });
  }

  const path = `${session.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const uploadKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const uploadRes = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey:          uploadKey,
      Authorization:   `Bearer ${uploadKey}`,
      "Content-Type":  "image/jpeg",
      "Cache-Control": "max-age=3600",
    },
    body: processed as unknown as BodyInit,
  });

  if (!uploadRes.ok) {
    const msg = await uploadRes.text();
    return NextResponse.json({ error: `Storage upload failed: ${msg}` }, { status: 500 });
  }

  const url = `${BASE}/storage/v1/object/public/${BUCKET}/${path}`;

  const patchRes = await fetch(
    `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(session.id)}`,
    {
      method:  "PATCH",
      headers: serviceHeaders({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ profile_photo_url: url }),
    },
  );
  if (!patchRes.ok) {
    return NextResponse.json({ error: "Failed to save photo URL" }, { status: 500 });
  }

  // Best-effort: propagate to linked athlete rows so roster/leaderboard stay current.
  void propagateToAthletes(session.id, url);

  return NextResponse.json({ ok: true, url });
}

export async function DELETE() {
  const session = await getAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(session.id)}`,
    {
      method:  "PATCH",
      headers: serviceHeaders({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ profile_photo_url: null }),
    },
  );
  if (!res.ok) return NextResponse.json({ error: "Failed to remove photo" }, { status: 500 });

  void propagateToAthletes(session.id, null);

  return NextResponse.json({ ok: true });
}
