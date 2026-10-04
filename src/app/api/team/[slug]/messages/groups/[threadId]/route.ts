import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getThreadById,
  validateGroupName,
  canManageGroupThread,
  renameGroupThread,
  archiveGroupThread,
} from "@/lib/messages";

type RouteCtx = { params: Promise<{ slug: string; threadId: string }> };

// Shared by PATCH (rename) and DELETE (archive) below — campaign/type/
// authorization are identical for both; only the mutation differs.
async function loadManageableGroup(slug: string, threadId: string) {
  const actor = await getTeamActor(slug);
  if (actor.kind !== "coach" || (actor.session.role !== "head_coach" && actor.session.role !== "assistant_coach")) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  const role = actor.session.role as "head_coach" | "assistant_coach";
  const coachId = actor.session.id;

  const thread = await getThreadById(threadId, slug);
  if (!thread || thread.thread_type !== "group") {
    return { ok: false as const, status: 404, error: "Group not found." };
  }

  if (!canManageGroupThread(role, coachId, thread)) {
    return { ok: false as const, status: 403, error: "Unauthorized" };
  }

  return { ok: true as const };
}

// Rename. Head Coach can rename any group on the team; an Assistant Coach
// only the group they personally created (canManageGroupThread —
// src/lib/messages.ts). Booster/member/public never reach past
// loadManageableGroup's role check above.
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const { slug, threadId } = await params;
  const loaded = await loadManageableGroup(slug, threadId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const body = await req.json().catch(() => null);
  const nameResult = validateGroupName(body?.name);
  if (!nameResult.ok) {
    return NextResponse.json({ error: nameResult.error }, { status: 400 });
  }

  await renameGroupThread(threadId, nameResult.name);
  return NextResponse.json({ ok: true, name: nameResult.name });
}

// Archive (soft-delete). Locked G1 scope: Head Coach only — an Assistant
// Coach may rename/manage participants of their own group (PATCH above,
// the participants route) but may NOT archive, even a group they created.
export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const { slug, threadId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind !== "coach" || actor.session.role !== "head_coach") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thread = await getThreadById(threadId, slug);
  if (!thread || thread.thread_type !== "group") {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  await archiveGroupThread(threadId);
  return NextResponse.json({ ok: true });
}
