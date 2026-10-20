"use client";

import { useAttendanceEditor } from "./useAttendanceEditor";
import AttendanceScreen from "./AttendanceScreen";

// Team Management Phase 5-4 — client entry for the attendance screen.
export default function AttendanceView({ slug, teamName, initialDate }: { slug: string; teamName: string; initialDate: string | null }) {
  const { state, dirty, actions } = useAttendanceEditor(slug, initialDate);
  return <AttendanceScreen slug={slug} teamName={teamName} state={state} dirty={dirty} actions={actions} />;
}
