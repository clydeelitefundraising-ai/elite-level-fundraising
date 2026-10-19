// Shared helpers for the Phase 3C completion routes (not a route itself —
// Next only treats route.ts files as endpoints).
import { NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { taskViewerFor } from "@/lib/teamTasks";
import { canViewCompletion } from "@/lib/teamTaskCompletion";
import type { CompletionFailure } from "@/lib/teamTaskCompletionStore";

const COMPLETION_FAILURES: Record<CompletionFailure, { status: number; error: string }> = {
  unavailable: { status: 503, error: "Completion tracking isn't available right now. Please try again." },
  error:       { status: 503, error: "Completion status is temporarily unavailable. Please try again." },
  not_found:   { status: 404, error: "Not found." },
  inactive:    { status: 409, error: "This task is archived, so it isn't a current requirement." },
};

export function completionFailure(reason: CompletionFailure) {
  const { status, error } = COMPLETION_FAILURES[reason];
  return NextResponse.json({ error, reason }, { status, headers: { "Cache-Control": "no-store" } });
}

export function completionResponse(body: Record<string, unknown>) {
  return NextResponse.json({ available: true, ...body }, { headers: { "Cache-Control": "no-store" } });
}

/** Coach-only, enforced here on the server: the actor is resolved for THIS
 *  team from the signed session (a coach of another team is not a coach
 *  here). Head Coach, Assistant Coach and platform admins may view;
 *  boosters, athletes, parents and the public may not. Returns a response
 *  to send if not allowed, or null. */
export async function denyUnlessCompletionViewer(slug: string): Promise<NextResponse | null> {
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCompletion(taskViewerFor(actor))) {
    return NextResponse.json({ error: "Only this team's coaches can view task completion." }, { status: 403 });
  }
  return null;
}
