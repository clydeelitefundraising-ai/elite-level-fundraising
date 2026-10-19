"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TASK_AUDIENCE_LABELS, type TaskAudience } from "@/lib/teamTasks";
import {
  COMPLETION_STATE_DISPLAY,
  REQUIREMENT_LABELS,
  formatAcknowledgedDate,
  parseTaskCompletionResponse,
  parseTeamSummaryResponse,
  type AthleteCompletionRow,
  type CompletionEntry,
  type CompletionState,
  type RequirementCounts,
  type TaskCompletionSummary,
} from "@/lib/teamTaskCompletion";
import { requirementsFor } from "@/lib/teamTaskAcks";
import GradeTabs, { gradeTabId, gradeTabPanelId } from "./GradeTabs";
import { ALL_ATHLETES_TAB, buildGradeTabs, resolveGradeTab, type GradeTabKey } from "./rosterHelpers";
import { COMPLETION_FILTERS, completionFilterCounts, filterCompletionRows, type CompletionFilter } from "./completionView";
import styles from "./Team.module.css";

// Team Management Phase 3C-3 — the coach completion dashboard inside the
// To-Do List (?view=completion): a team-wide summary per active task, and
// one task's athletes with grade tabs, All / Outstanding / Complete and
// search. Head Coach, Assistant Coach and platform admins only — the
// To-Do List shows the entry points only to them, and every API it reads
// (/api/team/[slug]/todo/completion/…) enforces that on the server.
//
// Fail closed: a failed, refused, malformed or internally inconsistent
// response shows "temporarily unavailable" with Try again — never a
// partial report, and an unknown status is never green. Dates are shown
// in the team's time zone (America/Phoenix), not the device's.

export const COMPLETION_UNAVAILABLE = "Completion status is temporarily unavailable.";

const column: React.CSSProperties = { width: "100%", maxWidth: 760, minWidth: 0 };
const backBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: ".3rem", minHeight: 44, padding: ".4rem 0",
  background: "none", border: "none", color: "#0b1e3d", fontSize: ".85rem", fontWeight: 700, cursor: "pointer",
};
const textBtn: React.CSSProperties = { ...backBtn, minHeight: 36, fontSize: ".8rem", color: "#374151" };
const muted: React.CSSProperties = { margin: 0, fontSize: ".8rem", color: "#6b7280", lineHeight: 1.5 };
const chip: React.CSSProperties = { fontSize: ".68rem", fontWeight: 700, padding: ".12rem .45rem", borderRadius: 6, background: "#eef2ff", color: "#3730a3", whiteSpace: "nowrap" };

type Load<T> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: T };

const NO_MESSAGES: Record<number, string> = {};

/** GET + strict parse. Any failure is an error state, never partial data.
 *  parse and messages must be stable (module-level) values. */
function useCompletion<T>(url: string, parse: (body: unknown) => T | null, messages: Record<number, string> = NO_MESSAGES) {
  const [state, setState] = useState<Load<T>>({ kind: "loading" });
  const read = useCallback(async (): Promise<Load<T>> => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return { kind: "error", message: messages[res.status] ?? COMPLETION_UNAVAILABLE };
      const value = parse(await res.json());
      return value ? { kind: "ready", value } : { kind: "error", message: COMPLETION_UNAVAILABLE };
    } catch {
      return { kind: "error", message: COMPLETION_UNAVAILABLE };
    }
  }, [url, parse, messages]);
  useEffect(() => {
    let cancelled = false;
    void read().then(next => { if (!cancelled) setState(next); });
    return () => { cancelled = true; };
  }, [read]);
  const reload = () => { setState({ kind: "loading" }); void read().then(setState); };
  return { state, reload };
}

function Chevron({ direction = "right" }: { direction?: "right" | "left" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={direction === "right" ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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

function Unavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" style={{ padding: ".65rem .8rem", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10 }}>
      <p style={{ margin: 0, fontSize: ".85rem", color: "#4b5563" }}>{message}</p>
      <button type="button" onClick={onRetry} className="elf-focus-ring" style={{ ...textBtn, minHeight: 44, color: "#0b1e3d" }}>Try again</button>
    </div>
  );
}

function Header({ title, backLabel, onBack, onRefresh, children }: {
  title: string; backLabel: string; onBack: () => void; onRefresh?: () => void; children?: React.ReactNode;
}) {
  return (
    <header style={{ marginBottom: ".75rem" }}>
      <button type="button" onClick={onBack} className="elf-focus-ring" style={backBtn}>
        <Chevron direction="left" />
        {backLabel}
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", gap: ".5rem", marginTop: ".2rem" }}>
        <h2 id="completion-title" style={{ flex: 1, minWidth: 0, margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#0b1e3d", lineHeight: 1.3, overflowWrap: "anywhere" }}>
          {title}
        </h2>
        {onRefresh && (
          <button type="button" onClick={onRefresh} className="elf-focus-ring" style={{ ...textBtn, flexShrink: 0 }}>Refresh</button>
        )}
      </div>
      {children}
    </header>
  );
}

/** "12 / 56" with a thin bar — completed requirements of this kind. */
function RequirementProgress({ label, c }: { label: string; c: RequirementCounts }) {
  const pct = c.required > 0 ? Math.round((c.complete / c.required) * 100) : 0;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", fontSize: ".78rem", color: "#374151" }}>
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span><strong style={{ color: "#111827" }}>{c.complete}</strong> / {c.required} acknowledged</span>
      </div>
      <div aria-hidden="true" style={{ height: 5, background: "#f3f4f6", borderRadius: 99, overflow: "hidden", marginTop: ".2rem" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#16a34a", borderRadius: 99 }} />
      </div>
    </div>
  );
}

/** Requirement counts (each athlete/parent requirement once) and, kept
 *  separate, distinct athletes. */
function CountsBlock({ s }: { s: TaskCompletionSummary }) {
  const ath = s.requirements.athlete;
  const par = s.requirements.parent;
  const cannot = [
    ath && ath.cannotCompleteYet > 0 ? `${ath.cannotCompleteYet} athlete${ath.cannotCompleteYet === 1 ? "" : "s"} not joined` : null,
    par && par.cannotCompleteYet > 0 ? `${par.cannotCompleteYet} with no parent linked` : null,
  ].filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
      {ath && <RequirementProgress label={REQUIREMENT_LABELS.athlete} c={ath} />}
      {par && <RequirementProgress label={REQUIREMENT_LABELS.parent} c={par} />}
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: ".6rem", rowGap: ".1rem", fontSize: ".76rem", color: "#4b5563" }}>
        <dt style={{ fontWeight: 700 }}>Outstanding</dt>
        <dd style={{ margin: 0 }}>
          {s.totals.outstanding} requirement{s.totals.outstanding === 1 ? "" : "s"} · {s.athletes.outstanding} of {s.athletes.total} athlete{s.athletes.total === 1 ? "" : "s"}
        </dd>
        {cannot.length > 0 && (
          <>
            <dt style={{ fontWeight: 700 }}>Can&apos;t complete yet</dt>
            <dd style={{ margin: 0 }}>{s.totals.cannotCompleteYet} ({cannot.join(", ")})</dd>
          </>
        )}
        {s.totals.needsUpdate > 0 && (
          <>
            <dt style={{ fontWeight: 700 }}>Needs new</dt>
            <dd style={{ margin: 0 }}>{s.totals.needsUpdate} (task was updated)</dd>
          </>
        )}
        {s.totals.unknown > 0 && (
          <>
            <dt style={{ fontWeight: 700 }}>Unavailable</dt>
            <dd style={{ margin: 0 }}>{s.totals.unknown}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

const audienceLabel = (a: string) => TASK_AUDIENCE_LABELS[a as TaskAudience] ?? a;

// ── Team summary ──────────────────────────────────────────────────────────

export function CompletionSummaryView({ slug, backLabel, onBack, onOpenTask }: {
  slug: string; backLabel: string; onBack: () => void; onOpenTask: (taskId: string) => void;
}) {
  const { state, reload } = useCompletion(`/api/team/${slug}/todo/completion`, parseTeamSummaryResponse);
  return (
    <div role="region" aria-labelledby="completion-title" style={{ ...column, animation: "elf-fadeUp .18s ease both" }}>
      <Header title="Task Completion" backLabel={backLabel} onBack={onBack} onRefresh={state.kind === "ready" ? reload : undefined}>
        <p style={{ ...muted, marginTop: ".25rem" }}>
          Acknowledgments for active tasks. Requirement counts include each athlete and parent/guardian requirement; athlete counts include each athlete once.
        </p>
      </Header>
      {state.kind === "loading" && <p role="status" style={muted}>Loading completion…</p>}
      {state.kind === "error" && <Unavailable message={state.message} onRetry={reload} />}
      {state.kind === "ready" && state.value.tasks.length === 0 && (
        <div className={styles.todoList}><p style={{ ...muted, padding: ".75rem 1rem" }}>No active tasks. Completion appears here once a task is created.</p></div>
      )}
      {state.kind === "ready" && state.value.tasks.length > 0 && (
        <ul className={styles.todoList} aria-label="Completion by task">
          {state.value.tasks.map(s => (
            <li key={s.task.id}>
              <button
                type="button"
                onClick={() => onOpenTask(s.task.id)}
                className="elf-focus-ring"
                style={{ display: "flex", alignItems: "center", gap: ".6rem", width: "100%", padding: ".8rem 1rem", background: "none", border: "none", textAlign: "left", cursor: "pointer", color: "inherit" }}
              >
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: ".45rem" }}>
                  <span style={{ display: "flex", alignItems: "flex-start", gap: ".45rem" }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: ".92rem", fontWeight: 700, color: "#0b1e3d", overflowWrap: "anywhere" }}>{s.task.title}</span>
                    <span style={chip}>{audienceLabel(s.task.audience)}</span>
                  </span>
                  <CountsBlock s={s} />
                </span>
                <span style={{ color: "#9ca3af" }}><Chevron /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── One task ─────────────────────────────────────────────────────────────

function EntryLine({ entry }: { entry: CompletionEntry }) {
  const { text } = COMPLETION_STATE_DISPLAY[entry.state];
  const date = entry.state === "complete" ? formatAcknowledgedDate(entry.acknowledgedAt) : "";
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: ".4rem", fontSize: ".78rem", lineHeight: 1.35 }}>
      <StateIcon state={entry.state} />
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        <span style={{ fontWeight: 700, color: "#374151" }}>{REQUIREMENT_LABELS[entry.requirement]}:</span>{" "}
        <span style={{ color: entry.state === "complete" ? "#166534" : entry.state === "unknown" ? "#6b7280" : "#b91c1c" }}>{text}</span>
        {date && <span style={{ color: "#6b7280" }}> · {date}</span>}
      </span>
    </li>
  );
}

function AthleteRow({ row }: { row: AthleteCompletionRow }) {
  return (
    <li style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", columnGap: "1rem", rowGap: ".35rem", padding: ".65rem 1rem" }}>
      <div style={{ flex: "1 1 11rem", minWidth: 0 }}>
        <div style={{ fontSize: ".88rem", fontWeight: 700, color: "#111827", overflowWrap: "anywhere" }}>{row.athlete.name || "Unnamed athlete"}</div>
        <div style={{ fontSize: ".72rem", color: "#9ca3af" }}>{row.athlete.class_year || "No grade set"}</div>
      </div>
      <ul style={{ flex: "1 1 15rem", minWidth: 0, listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: ".2rem" }}>
        {row.entries.map(e => <EntryLine key={e.requirement} entry={e} />)}
      </ul>
    </li>
  );
}

const TASK_MESSAGES: Record<number, string> = {
  404: "This task isn't on the To-Do List anymore.",
  409: "This task was archived, so it's no longer a current requirement.",
};

export function TaskCompletionDetailView({ slug, taskId, backLabel, onBack }: {
  slug: string; taskId: string; backLabel: string; onBack: () => void;
}) {
  const { state, reload } = useCompletion(`/api/team/${slug}/todo/completion/tasks/${encodeURIComponent(taskId)}`, parseTaskCompletionResponse, TASK_MESSAGES);
  const [grade, setGrade] = useState<GradeTabKey>(ALL_ATHLETES_TAB);
  const [filter, setFilter] = useState<CompletionFilter>("all");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => (state.kind === "ready" ? state.value.athletes : []), [state]);
  const tabs = useMemo(() => buildGradeTabs(rows.map(r => r.athlete)), [rows]);
  const activeGrade = resolveGradeTab(grade, tabs);
  const counts = completionFilterCounts(rows, { grade: activeGrade, search });
  const shown = filterCompletionRows(rows, { grade: activeGrade, filter, search });
  const idPrefix = "completion-grade";

  const title = state.kind === "ready" ? state.value.summary.task.title : "Task Completion";
  return (
    <div role="region" aria-labelledby="completion-title" style={{ ...column, animation: "elf-fadeUp .18s ease both" }}>
      <Header title={title} backLabel={backLabel} onBack={onBack} onRefresh={state.kind === "ready" ? reload : undefined}>
        {state.kind === "ready" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".35rem", marginTop: ".4rem" }}>
            <span style={chip}>{audienceLabel(state.value.summary.task.audience)}</span>
            <span style={{ ...chip, background: "#f3f4f6", color: "#4b5563" }}>
              Requires: {requirementsFor(state.value.summary.task.audience).map(r => REQUIREMENT_LABELS[r]).join(" + ")}
            </span>
          </div>
        )}
      </Header>

      {state.kind === "loading" && <p role="status" style={muted}>Loading completion…</p>}
      {state.kind === "error" && <Unavailable message={state.message} onRetry={reload} />}

      {state.kind === "ready" && (
        <>
          <div style={{ padding: ".75rem 1rem", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", marginBottom: ".85rem" }}>
            <CountsBlock s={state.value.summary} />
          </div>

          {rows.length === 0 ? (
            <div className={styles.todoList}><p style={{ ...muted, padding: ".75rem 1rem" }}>No athletes on the roster yet.</p></div>
          ) : (
            <>
              <GradeTabs tabs={tabs} value={activeGrade} onChange={setGrade} idPrefix={idPrefix} label="Filter completion by grade" />
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: ".5rem", margin: ".6rem 0" }}>
                <div role="group" aria-label="Show athletes" style={{ display: "flex", gap: ".3rem", flexWrap: "wrap" }}>
                  {COMPLETION_FILTERS.map(f => (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={filter === f.key}
                      onClick={() => setFilter(f.key)}
                      className="elf-focus-ring"
                      style={{
                        minHeight: 36, padding: ".3rem .7rem", borderRadius: 99, fontSize: ".78rem", fontWeight: 700, cursor: "pointer",
                        border: filter === f.key ? "1.5px solid var(--team-primary)" : "1.5px solid #e5e7eb",
                        background: filter === f.key ? "var(--team-primary)" : "#fff",
                        color: filter === f.key ? "var(--team-primary-foreground)" : "#374151",
                      }}
                    >
                      {f.label} <span style={{ opacity: .8 }}>{counts[f.key]}</span>
                    </button>
                  ))}
                </div>
                <label style={{ flex: "1 1 12rem", minWidth: 0 }}>
                  <span className={styles.srOnly}>Search athletes</span>
                  <input
                    type="search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search athletes"
                    style={{ width: "100%", boxSizing: "border-box", minHeight: 40, padding: ".4rem .7rem", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: "1rem", color: "#111827", background: "#fff" }}
                  />
                </label>
              </div>
              <div role="tabpanel" id={gradeTabPanelId(idPrefix)} aria-labelledby={gradeTabId(idPrefix, activeGrade)}>
                {shown.length === 0 ? (
                  <div className={styles.todoList}>
                    <p style={{ ...muted, padding: ".75rem 1rem" }}>
                      {search.trim() ? "No athletes match your search."
                        : filter === "outstanding" ? "No outstanding athletes here."
                        : filter === "complete" ? "No athletes here have completed every requirement yet."
                        : "No athletes in this grade."}
                    </p>
                  </div>
                ) : (
                  <ul className={styles.todoList} aria-label="Athlete completion">
                    {shown.map(r => <AthleteRow key={r.athlete.id} row={r} />)}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
