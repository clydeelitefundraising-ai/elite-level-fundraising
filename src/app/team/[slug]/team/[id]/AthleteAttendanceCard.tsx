"use client";

import { useId, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import {
  absenceCountLabel,
  absenceReasonLabel,
  formatAbsenceDate,
  type AthleteAttendanceState,
} from "@/lib/athleteAttendance";
import type { AbsenceReason } from "@/lib/teamAttendance";

// Athlete profile — Attendance section, shared by both profile views
// (CoachAthleteView.tsx for staff, AthleteProfileView.tsx for the athlete
// and linked parents). Read-only and compact: collapsed by default, the
// header row shows the calendar icon, "Attendance", the total and a
// chevron; the counts (Total, Excused, Unexcused, and Other when
// any) stay visible; tapping the header lists every absence date, newest
// first, with its category. The page decides who sees this
// (canViewAthleteAttendance) and loads it on the server
// (getAthleteAbsences). Notes are never part of the data.

// Same card look as AthleteTaskCompletion.tsx / CoachAthleteView.tsx.
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "1.1rem",
  boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
  marginBottom: ".75rem",
};

export const ATTENDANCE_UNAVAILABLE_TEXT = "Attendance temporarily unavailable";

const REASON_COLORS: Record<AbsenceReason, { bg: string; fg: string }> = {
  excused:   { bg: "#eff6ff", fg: "#1d4ed8" },
  unexcused: { bg: "#fef2f2", fg: "#b91c1c" },
  other:     { bg: "#f3f4f6", fg: "#4b5563" },
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0, background: "#f9fafb", borderRadius: 10, padding: ".45rem 0", textAlign: "center" }}>
      <div style={{ fontSize: "1rem", fontWeight: 800, color: "#111827", lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: ".66rem", fontWeight: 600, color: "#6b7280", marginTop: ".1rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
    </div>
  );
}

export default function AthleteAttendanceCard({ attendance }: { attendance: AthleteAttendanceState }) {
  const [expanded, setExpanded] = useState(false);
  const listId = `athlete-attendance-${useId().replace(/:/g, "")}`;

  const icon = <CalendarDays size={16} aria-hidden="true" style={{ color: "#6b7280", flexShrink: 0 }} />;
  const label = <span style={{ fontSize: ".84rem", fontWeight: 700, color: "#111827" }}>Attendance</span>;

  if (!attendance.ok) {
    return (
      <div style={card} role="region" aria-label="Attendance">
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", minHeight: 24 }}>
          {icon}
          {label}
        </div>
        <p role="status" style={{ margin: ".5rem 0 0", fontSize: ".8rem", color: "#4b5563" }}>{ATTENDANCE_UNAVAILABLE_TEXT}</p>
      </div>
    );
  }

  const { summary } = attendance;
  return (
    <div style={card} role="region" aria-label="Attendance">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-controls={listId}
        className="elf-focus-ring"
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: ".5rem", minHeight: 44,
          margin: 0, padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        {icon}
        {label}
        <span style={{ marginLeft: "auto", fontSize: ".78rem", fontWeight: 600, color: "#6b7280", whiteSpace: "nowrap" }}>
          {absenceCountLabel(summary.total)}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          style={{ color: "#9ca3af", flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}
        />
      </button>

      <div style={{ display: "flex", gap: ".3rem", marginTop: ".1rem" }}>
        <Metric label="Total" value={summary.total} />
        <Metric label="Excused" value={summary.excused} />
        <Metric label="Unexcused" value={summary.unexcused} />
        {summary.other > 0 && <Metric label="Other" value={summary.other} />}
      </div>

      {expanded && (
        <div id={listId} style={{ marginTop: ".75rem" }}>
          {summary.absences.length === 0 ? (
            <p style={{ margin: 0, fontSize: ".8rem", color: "#6b7280" }}>No absences recorded this season.</p>
          ) : (
            <ul aria-label="Absence dates, newest first" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {summary.absences.map((a, i) => (
                <li
                  key={a.date}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem",
                    padding: ".45rem 0", borderTop: i === 0 ? "none" : "1px solid #f3f4f6", fontSize: ".8rem",
                  }}
                >
                  <span style={{ color: "#374151" }}>{formatAbsenceDate(a.date)}</span>
                  <span style={{
                    fontSize: ".68rem", fontWeight: 700, padding: ".15rem .5rem", borderRadius: 999, flexShrink: 0,
                    background: REASON_COLORS[a.reason].bg, color: REASON_COLORS[a.reason].fg,
                  }}>
                    {absenceReasonLabel(a.reason)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
