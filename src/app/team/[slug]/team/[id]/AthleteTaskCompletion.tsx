"use client";

import { useCallback, useEffect, useState } from "react";
import {
  COMPLETION_STATE_DISPLAY,
  REQUIREMENT_LABELS,
  parseAthleteCompletionResponse,
  type AthleteTaskStatus,
  type CompletionEntry,
  type CompletionState,
} from "@/lib/teamTaskCompletion";

// Team Management Phase 3C-2 — the "To-Do Tasks" card on a coach's view of
// an athlete's profile: every active task with its athlete and/or
// parent/guardian requirement (only the ones the task asks for), each with
// an icon AND its text. Coach-only: the page renders this only for Head
// Coaches, Assistant Coaches and platform admins, and the API it reads
// (/api/team/[slug]/todo/completion/athletes/[id]) refuses anyone else.
//
// Fail closed: if the data can't be loaded or verified, nothing green is
// shown — only a temporary-unavailability message with Try again.

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; tasks: AthleteTaskStatus[] };

// Same card and section-title look as CoachAthleteView.tsx.
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "1.1rem",
  boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
  marginBottom: ".75rem",
};

const sectionTitle: React.CSSProperties = {
  fontSize: ".62rem",
  fontWeight: 700,
  color: "#9ca3af",
  textTransform: "uppercase" as const,
  letterSpacing: ".08em",
  marginBottom: ".6rem",
};

export const UNAVAILABLE_TEXT = "To-Do task status is temporarily unavailable.";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function StateIcon({ state }: { state: CompletionState }) {
  const { icon } = COMPLETION_STATE_DISPLAY[state];
  const fill = icon === "check" ? "#16a34a" : icon === "x" ? "#dc2626" : "#9ca3af";
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="10" cy="10" r="10" fill={fill} />
      {icon === "unknown" ? (
        <text x="10" y="14.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">?</text>
      ) : (
        <path d={icon === "check" ? "M5.8 10.4 8.6 13.1 14.3 7.3" : "M6.8 6.8 13.2 13.2M13.2 6.8 6.8 13.2"} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function EntryLine({ entry }: { entry: CompletionEntry }) {
  const { text } = COMPLETION_STATE_DISPLAY[entry.state];
  const date = entry.state === "complete" ? fmtDate(entry.acknowledgedAt) : "";
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: ".45rem", fontSize: ".78rem", lineHeight: 1.35 }}>
      <StateIcon state={entry.state} />
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        <span style={{ fontWeight: 700, color: "#374151" }}>{REQUIREMENT_LABELS[entry.requirement]}:</span>{" "}
        <span style={{ color: entry.state === "complete" ? "#166534" : entry.state === "unknown" ? "#6b7280" : "#b91c1c" }}>{text}</span>
        {date && <span style={{ color: "#6b7280" }}> · {date}</span>}
      </span>
    </li>
  );
}

export default function AthleteTaskCompletion({ slug, athleteId }: { slug: string; athleteId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const url = `/api/team/${slug}/todo/completion/athletes/${athleteId}`;

  const read = useCallback(async (): Promise<LoadState> => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return { kind: "error" };
      const tasks = parseAthleteCompletionResponse(await res.json());
      return tasks ? { kind: "ready", tasks } : { kind: "error" };
    } catch {
      return { kind: "error" };
    }
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    void read().then(next => { if (!cancelled) setState(next); });
    return () => { cancelled = true; };
  }, [read]);

  const retry = () => {
    setState({ kind: "loading" });
    void read().then(setState);
  };

  return (
    <div style={card} role="region" aria-labelledby="athlete-todo-heading">
      <div id="athlete-todo-heading" style={sectionTitle}>To-Do Tasks</div>

      {state.kind === "loading" && (
        <p role="status" style={{ margin: 0, fontSize: ".78rem", color: "#9ca3af" }}>Loading task status…</p>
      )}

      {state.kind === "error" && (
        <div role="alert" style={{ padding: ".6rem .75rem", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: ".8rem", color: "#4b5563" }}>{UNAVAILABLE_TEXT}</p>
          <button
            type="button"
            onClick={retry}
            className="elf-focus-ring"
            style={{ marginTop: ".2rem", minHeight: 44, padding: ".3rem 0", background: "none", border: "none", fontSize: ".8rem", fontWeight: 700, color: "#0b1e3d", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "ready" && state.tasks.length === 0 && (
        <p style={{ margin: 0, fontSize: ".8rem", color: "#6b7280" }}>No active To-Do tasks.</p>
      )}

      {state.kind === "ready" && state.tasks.length > 0 && (
        <ul aria-label="To-Do task acknowledgment status" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
          {state.tasks.map((t, i) => (
            <li key={t.task.id} style={{ paddingTop: i === 0 ? 0 : ".6rem", paddingBottom: i === state.tasks.length - 1 ? 0 : ".6rem", borderTop: i === 0 ? "none" : "1px solid #f3f4f6" }}>
              <div style={{ fontSize: ".84rem", fontWeight: 700, color: "#111827", marginBottom: ".3rem", overflowWrap: "anywhere" }}>{t.task.title}</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: ".25rem" }}>
                {t.entries.map(e => <EntryLine key={e.requirement} entry={e} />)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
