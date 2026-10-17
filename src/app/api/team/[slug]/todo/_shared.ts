// Shared response helpers for the To-Do task routes (not a route itself —
// Next only treats route.ts files as endpoints).
import { NextResponse } from "next/server";
import type { StoreFailure } from "@/lib/teamTasksStore";

const FAILURE_RESPONSES: Record<StoreFailure, { status: number; error: string }> = {
  unavailable: { status: 503, error: "To-Do tasks aren't set up yet." },
  not_found:   { status: 404, error: "Task not found." },
  not_active:  { status: 409, error: "Archived tasks can't be edited. Restore the task first." },
  conflict:    { status: 409, error: "This task was changed by someone else. Reload and try again." },
  invalid:     { status: 400, error: "Some task details couldn't be saved. Check the links and documents." },
  error:       { status: 500, error: "Something went wrong. Please try again." },
};

export function failureResponse(reason: StoreFailure) {
  const { status, error } = FAILURE_RESPONSES[reason];
  return NextResponse.json({ error, reason }, { status });
}

export const ONLY_HEAD_COACH = "Only this team's Head Coach can manage To-Do tasks.";
