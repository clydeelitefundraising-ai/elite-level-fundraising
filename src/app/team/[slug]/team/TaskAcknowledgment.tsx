"use client";

import { useCallback, useEffect, useState } from "react";
import { ACK_NAME_MAX, normalizeAckName, type AckEntry, type AckView } from "@/lib/teamTaskAcks";
import styles from "./Team.module.css";

// Team Management Phase 3 — the acknowledgment section of a task's detail
// view, for athletes, linked parents and coaches who are linked parents.
// Shows each linked athlete's status (green check / red X) and, while the
// viewer's acknowledgment is still needed, the form: typed full name, the
// required statement checkbox, and Submit Acknowledgment.
//
// Everything that decides who is covered comes from the server
// (GET/POST /api/team/[slug]/todo/tasks/[taskId]/acknowledgment). The
// browser sends only the revision it shows, the typed name, the checkbox,
// and the athletes it listed — which the server checks against its own.
// Renders nothing for anyone the task doesn't ask (coaches, boosters).

type Props = {
  slug: string;
  taskId: string;
  revision: number;
  /** Called after a submit (or a stale-revision refusal) so the task list
   *  and row icons refresh. */
  onChanged: () => void;
};

type Notice = { kind: "success" | "error" | "info"; text: string };

const label: React.CSSProperties = {
  margin: "0 0 .35rem", fontSize: ".72rem", fontWeight: 800, color: "#6b7280",
  textTransform: "uppercase", letterSpacing: ".04em",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="10" fill="#16a34a" />
      <path d="M5.8 10.4 8.6 13.1 14.3 7.3" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="10" fill="#dc2626" />
      <path d="M6.8 6.8 13.2 13.2M13.2 6.8 6.8 13.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function entryText(e: AckEntry, childName: string, viewerIsChild: boolean): string {
  if (e.satisfied) {
    const who = e.by === "you" ? "you"
      : e.by === "athlete" ? (viewerIsChild ? "you" : childName)
      : "a parent/guardian";
    const date = fmtDate(e.at);
    return `Acknowledged by ${who}${date ? ` on ${date}` : ""}`;
  }
  if (e.earlierRevision) return "Needs a new acknowledgment — this task was updated";
  if (e.noEligibleMember) {
    return e.requirement === "parent" ? "No parent/guardian is linked yet" : `${childName} hasn't joined the team app yet`;
  }
  return "Not acknowledged yet";
}

export default function TaskAcknowledgment({ slug, taskId, revision, onChanged }: Props) {
  const [view, setView] = useState<AckView | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const url = `/api/team/${slug}/todo/tasks/${taskId}/acknowledgment`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setLoadError(data.error ?? "Couldn't load your acknowledgment status."); setView(null); return; }
      setLoadError("");
      setView(data.acknowledgment ?? null);
    } catch {
      setLoadError("Couldn't load your acknowledgment status.");
      setView(null);
    }
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async res => ({ res, data: await res.json().catch(() => ({})) }))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) { setLoadError(data.error ?? "Couldn't load your acknowledgment status."); setView(null); return; }
        setView(data.acknowledgment ?? null);
      })
      .catch(() => { if (!cancelled) { setLoadError("Couldn't load your acknowledgment status."); setView(null); } });
    return () => { cancelled = true; };
  }, [url]);

  if (view === undefined) return null;
  if (!view) {
    return loadError ? <p role="alert" style={{ margin: 0, fontSize: ".85rem", color: "#dc2626" }}>{loadError}</p> : null;
  }

  const isAthlete = view.requirement === "athlete";
  const outstanding = view.children.filter(c => view.outstandingAthleteIds.includes(c.athleteId));
  const validName = normalizeAckName(name) !== null;
  const canSubmit = validName && confirmed && !submitting && outstanding.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_revision: revision,
          full_name: name,
          confirmed: true,
          athlete_ids: view.outstandingAthleteIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setView(data.acknowledgment ?? null);
        setName("");
        setConfirmed(false);
        setNotice({ kind: "success", text: "Thank you — your acknowledgment was submitted." });
        onChanged();
        return;
      }
      if (data.acknowledgment !== undefined) setView(data.acknowledgment);
      else await load();
      if (data.reason === "revision_changed") onChanged(); // pull the updated task content
      if (data.reason === "already_satisfied") onChanged();
      setNotice({ kind: data.reason === "already_satisfied" ? "info" : "error", text: data.error ?? "Something went wrong. Please try again." });
    } catch {
      setNotice({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const noticeStyle: Record<Notice["kind"], React.CSSProperties> = {
    success: { background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534" },
    error:   { background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" },
    info:    { background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af" },
  };

  return (
    <div role="region" aria-labelledby={`ack-heading-${taskId}`}>
      <h3 id={`ack-heading-${taskId}`} style={label}>Acknowledgment</h3>

      {view.children.length === 0 ? (
        <p style={{ margin: 0, fontSize: ".85rem", color: "#6b7280" }}>
          {isAthlete
            ? "Your account isn't linked to an athlete on this team yet, so there's nothing to acknowledge."
            : "No athletes on this team are linked to your account yet, so there's nothing to acknowledge."}
        </p>
      ) : (
        <ul className={styles.todoList} aria-label="Acknowledgment status">
          {view.children.map(c => (
            <li key={c.athleteId} style={{ padding: ".65rem 1rem" }}>
              {!isAthlete && (
                <div style={{ fontSize: ".92rem", fontWeight: 600, color: "#0b1e3d", marginBottom: ".3rem", overflowWrap: "anywhere" }}>{c.name}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                {c.entries.map(e => {
                  const who = e.requirement === "athlete" ? (isAthlete ? "You (athlete)" : "Athlete") : "Parent/guardian";
                  return (
                    <div key={e.requirement} style={{ display: "flex", alignItems: "flex-start", gap: ".55rem" }}>
                      <StatusIcon ok={e.satisfied} />
                      <div style={{ minWidth: 0, fontSize: ".85rem", lineHeight: 1.35 }}>
                        <span style={{ fontWeight: 700, color: "#0b1e3d" }}>{who}</span>
                        <span className={styles.srOnly}>{e.satisfied ? " — complete" : " — outstanding"}</span>
                        <div style={{ color: "#6b7280", overflowWrap: "anywhere" }}>{entryText(e, c.name, isAthlete)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}

      {notice && (
        <p role={notice.kind === "error" ? "alert" : "status"} style={{ margin: ".75rem 0 0", padding: ".55rem .75rem", borderRadius: 9, fontSize: ".85rem", ...noticeStyle[notice.kind] }}>
          {notice.text}
        </p>
      )}

      {view.children.length > 0 && outstanding.length === 0 && !notice && (
        <p role="status" style={{ margin: ".75rem 0 0", fontSize: ".85rem", color: "#166534" }}>
          You&apos;re all set — your acknowledgment is complete for the current version of this task.
        </p>
      )}

      {outstanding.length > 0 && (
        <form onSubmit={submit} style={{ marginTop: ".9rem", display: "flex", flexDirection: "column", gap: ".75rem" }}>
          {!isAthlete && (
            <p style={{ margin: 0, fontSize: ".88rem", color: "#1f2937", lineHeight: 1.5 }}>
              Your acknowledgment will be recorded for{" "}
              <strong>{listNames(outstanding.map(c => c.name))}</strong>.
            </p>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em" }}>
            Your full name
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
              maxLength={ACK_NAME_MAX}
              required
              disabled={submitting}
              style={{
                padding: ".55rem .75rem", border: "1.5px solid #e5e7eb", borderRadius: 9,
                // 16px: iOS WebKit zooms on focus for anything smaller.
                fontSize: "1rem", width: "100%", boxSizing: "border-box", color: "#111827", background: "#fff",
                minHeight: 44, textTransform: "none", letterSpacing: "normal", fontWeight: 400,
              }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "flex-start", gap: ".65rem", minHeight: 44, cursor: "pointer", fontSize: ".9rem", color: "#1f2937", lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              required
              disabled={submitting}
              style={{ width: 22, height: 22, margin: ".1rem 0 0", flexShrink: 0, accentColor: "var(--team-primary)", cursor: "pointer" }}
            />
            <span>{view.statement.text}</span>
          </label>

          <div>
            <button type="submit" disabled={!canSubmit} className={`${styles.btnSolid} elf-focus-ring`} style={{ minHeight: 44, padding: ".5rem 1.1rem", fontSize: ".85rem" }}>
              {submitting ? "Submitting…" : "Submit Acknowledgment"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
