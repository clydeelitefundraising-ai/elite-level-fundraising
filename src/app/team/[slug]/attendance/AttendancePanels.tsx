"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import type { AttendanceDraft } from "@/lib/teamAttendanceDraft";
import type { AttendanceSessionSummary } from "./attendanceApi";
import type { AttendanceSummaryView, EditOp, MergeNotice, PendingLeave } from "./attendanceEditor";
import {
  editableWindowText,
  formatLongDate,
  formatMonthDay,
  formatSavedAt,
  formatShortDate,
  mergeNoticeLines,
  relativeDayLabel,
} from "./attendanceFormat";
import { entryStateText } from "./AttendanceRow";
import styles from "./Attendance.module.css";

// Team Management Phase 5-4 — the attendance screen's panels: date
// selection, summary, history, merge notice, conflicts and the
// Stay / Discard dialog.

// ── Date selection ────────────────────────────────────────────────────────

export function DatePanel({
  today,
  selectedDate,
  recent,
  dateError,
  disabled,
  onSelect,
}: {
  today: string | null;
  selectedDate: string | null;
  recent: { date: string; saved: boolean; today: boolean }[];
  dateError: "future" | "invalid" | null;
  disabled: boolean;
  onSelect: (date: string) => void;
}) {
  const inputId = useId();
  return (
    <section className={styles.card} aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`} className={styles.cardTitle}>Date</h2>
      {recent.length > 0 && (
        <ul className={styles.dateStrip} aria-label="Today and the previous 14 days">
          {recent.map(d => (
            <li key={d.date}>
              <button
                type="button"
                className={`${styles.dateChip} elf-focus-ring`}
                aria-pressed={d.date === selectedDate}
                aria-label={`${formatLongDate(d.date)}${d.today ? " (today)" : ""}${d.saved ? ", attendance saved" : ""}`}
                disabled={disabled}
                onClick={() => onSelect(d.date)}
              >
                <span className={styles.dateChipDay}>{today ? relativeDayLabel(d.date, today) : ""}</span>
                <span className={styles.dateChipDate}>{formatMonthDay(d.date)}</span>
                <span className={styles.dateChipSaved} aria-hidden="true">{d.saved ? "● Saved" : " "}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.dateInputRow}>
        <label htmlFor={inputId}>
          <CalendarDays size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Another date
        </label>
        <input
          // Re-created when the selected date changes (e.g. from a chip),
          // so it always shows the date on screen.
          key={selectedDate ?? "none"}
          id={inputId}
          type="date"
          className={styles.input}
          defaultValue={selectedDate ?? ""}
          max={today ?? undefined}
          disabled={disabled}
          aria-describedby={`${inputId}-help${dateError ? ` ${inputId}-err` : ""}`}
          onChange={e => {
            // Only a complete date; partial typing in some browsers is "".
            if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onSelect(e.target.value);
          }}
        />
      </div>
      {dateError && (
        <p id={`${inputId}-err`} className={styles.errorText} role="alert">
          {dateError === "future" ? "Attendance can't be taken for a future date." : "That isn't a valid date."}
        </p>
      )}
      <p id={`${inputId}-help`} className={styles.muted}>{today ? editableWindowText(today) : "Loading the team's date…"}</p>
    </section>
  );
}

// ── Summary ───────────────────────────────────────────────────────────────

export function SummaryPanel({ summary }: { summary: AttendanceSummaryView }) {
  const titleId = useId();
  if (summary.kind === "none") return null;
  if (summary.kind === "no_data") {
    return (
      <section className={styles.card} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.cardTitle}>Summary</h2>
        <p className={styles.muted}>
          {summary.reason === "not_recorded" ? "No attendance was recorded for this date."
            : summary.reason === "future" ? "Attendance can't be taken for a future date."
            : "There are no athletes on the roster."}
        </p>
      </section>
    );
  }
  const t = summary.totals;
  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.cardTitle}>
        Summary{summary.source === "draft" ? <span className={styles.srOnly}> (including unsaved changes)</span> : null}
      </h2>
      <dl className={styles.summaryGrid}>
        <div className={`${styles.stat} ${styles.statWide}`}>
          <dt>Attendance</dt>
          <dd aria-live="polite">{t.presentPercent === null ? "—" : `${t.presentPercent}%`}</dd>
        </div>
        <div className={styles.stat}><dt>Athletes</dt><dd>{t.total}</dd></div>
        <div className={styles.stat}><dt>Present</dt><dd>{t.present}</dd></div>
        <div className={styles.stat}><dt>Absent</dt><dd>{t.absent}</dd></div>
        <div className={styles.stat}><dt>Excused</dt><dd>{t.excused}</dd></div>
        <div className={styles.stat}><dt>Unexcused</dt><dd>{t.unexcused}</dd></div>
        <div className={styles.stat}><dt>Other</dt><dd>{t.other}</dd></div>
      </dl>
      {(t.reasonMissing > 0 || summary.pendingLate > 0 || t.removed > 0) && (
        <ul className={styles.summaryNotes}>
          {t.reasonMissing > 0 && <li>{t.reasonMissing} absent {t.reasonMissing === 1 ? "athlete needs" : "athletes need"} a reason.</li>}
          {summary.pendingLate > 0 && <li>{summary.pendingLate} added after this date {summary.pendingLate === 1 ? "isn't" : "aren't"} counted unless included.</li>}
          {t.removed > 0 && <li>{t.removed} saved {t.removed === 1 ? "record" : "records"} for athletes no longer on the roster (not counted).</li>}
        </ul>
      )}
    </section>
  );
}

// ── History ───────────────────────────────────────────────────────────────

const HISTORY_PAGE = 10;

export function HistoryPanel({
  sessions,
  selectedDate,
  status,
  disabled,
  onSelect,
  onRetry,
}: {
  sessions: AttendanceSessionSummary[];
  selectedDate: string | null;
  status: "loading" | "error" | "ready";
  disabled: boolean;
  onSelect: (date: string) => void;
  onRetry: () => void;
}) {
  const titleId = useId();
  const [shown, setShown] = useState(HISTORY_PAGE);
  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.cardTitle}>Saved attendance</h2>
      {status === "loading" && <p className={styles.muted}>Loading…</p>}
      {status === "error" && (
        <div role="alert">
          <p className={styles.muted}>Saved attendance couldn&apos;t be loaded.</p>
          <button type="button" className={styles.textButton} onClick={onRetry}>Try again</button>
        </div>
      )}
      {status === "ready" && sessions.length === 0 && <p className={styles.muted}>No attendance has been saved in the last year.</p>}
      {status === "ready" && sessions.length > 0 && (
        <>
          <ul className={styles.historyList}>
            {sessions.slice(0, shown).map(s => (
              <li key={s.sessionDate}>
                <button
                  type="button"
                  className={`${styles.historyItem} elf-focus-ring`}
                  aria-current={s.sessionDate === selectedDate ? "date" : undefined}
                  disabled={disabled}
                  onClick={() => onSelect(s.sessionDate)}
                >
                  <span className={styles.historyDate}>
                    {formatShortDate(s.sessionDate)}{" "}
                    <span className={`${styles.badge} ${s.editable ? styles.badgeDraft : styles.badgeReadOnly}`}>{s.editable ? "Draft" : "Read-only"}</span>
                  </span>
                  <span className={styles.historyMeta}>
                    {s.totals.state === "no_data"
                      ? "No athletes counted"
                      : `${s.totals.present} present · ${s.totals.absent} absent · ${s.totals.presentPercent}%`}
                  </span>
                  <span className={styles.historyMeta}>
                    Saved {formatSavedAt(s.updatedAt, s.timeZone)}{s.updatedByName ? ` by ${s.updatedByName}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {sessions.length > shown && (
            <button type="button" className={styles.textButton} onClick={() => setShown(n => n + HISTORY_PAGE)}>
              Show more ({sessions.length - shown} more)
            </button>
          )}
        </>
      )}
    </section>
  );
}

// ── Another coach saved first ─────────────────────────────────────────────

export function MergeNoticePanel({ notice, onDismiss }: { notice: MergeNotice; onDismiss: () => void }) {
  const { title, lines } = mergeNoticeLines(notice);
  return (
    <div className={`${styles.notice} ${notice.lostChangeNames.length > 0 || notice.conflicts > 0 ? styles.noticeWarn : styles.noticeInfo}`} role="status">
      <p className={styles.noticeTitle}>{title}</p>
      <ul className={styles.noticeList}>
        {lines.map(l => <li key={l}>{l}</li>)}
      </ul>
      {notice.conflicts === 0 && (
        <div className={styles.noticeActions}>
          <button type="button" className={styles.textButton} onClick={onDismiss}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

export function ConflictPanel({ draft, editable, onEdit }: { draft: AttendanceDraft; editable: boolean; onEdit: (edit: EditOp) => void }) {
  const titleId = useId();
  const conflicts = Object.values(draft.conflicts);
  if (conflicts.length === 0) return null;
  const byKey = new Map(draft.entries.map(e => [e.key, e]));
  return (
    <section className={`${styles.card}`} aria-labelledby={titleId} style={{ boxShadow: "0 0 0 2px #7c3aed" }}>
      <h2 id={titleId} className={styles.cardTitle}>
        Choose which version to keep ({conflicts.length})
      </h2>
      <p className={styles.muted}>
        You and another coach changed {conflicts.length === 1 ? "this athlete" : "these athletes"} differently. Saving is paused until you choose.
      </p>
      {conflicts.length > 1 && editable && (
        <div className={styles.noticeActions}>
          <button type="button" className={styles.button} onClick={() => onEdit({ op: "resolve_all", choice: "mine" })}>Keep all mine</button>
          <button type="button" className={styles.button} onClick={() => onEdit({ op: "resolve_all", choice: "theirs" })}>Use all latest saved</button>
        </div>
      )}
      <ul className={styles.list} style={{ gap: 0 }}>
        {conflicts.map(c => {
          const entry = byKey.get(c.key);
          const name = entry?.name ?? "Athlete";
          const by = entry?.lastChangedBy;
          return (
            <li key={c.key} className={styles.conflict}>
              <span className={styles.athleteName}>{name}</span>
              <div className={styles.conflictVersions}>
                <div className={styles.version}>
                  <span className={styles.versionLabel}>Your version</span>
                  {entryStateText(c.mine)}
                  {c.mine.included && c.mine.mark.status === "absent" && c.mine.mark.note ? <><br />Note: {c.mine.mark.note}</> : null}
                </div>
                <div className={styles.version}>
                  <span className={styles.versionLabel}>Latest saved{by ? ` (${by})` : ""}</span>
                  {entryStateText(c.theirs)}
                  {c.theirs.included && c.theirs.mark.status === "absent" && c.theirs.mark.note ? <><br />Note: {c.theirs.mark.note}</> : null}
                </div>
              </div>
              {editable && (
                <div className={styles.lateActions} role="group" aria-label={`Choose a version for ${name}`}>
                  <button type="button" className={styles.button} onClick={() => onEdit({ op: "resolve", key: c.key, choice: "mine" })}>Keep mine</button>
                  <button type="button" className={styles.button} onClick={() => onEdit({ op: "resolve", key: c.key, choice: "theirs" })}>Use latest saved</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Stay / Discard ────────────────────────────────────────────────────────

export function leaveDialogText(pending: PendingLeave, dateLabel: string | null): { title: string; body: string } {
  const where = pending.kind === "date" ? `switch to ${formatLongDate(pending.date)}`
    : pending.kind === "reload" ? "reload this date"
    : "leave this page";
  return {
    title: "Discard unsaved attendance?",
    body: `You have attendance changes${dateLabel ? ` for ${dateLabel}` : ""} that haven't been saved. If you ${where}, they'll be lost.`,
  };
}

export function LeaveDialog({ pending, dateLabel, onStay, onDiscard }: {
  pending: PendingLeave;
  dateLabel: string | null;
  onStay: () => void;
  onDiscard: () => void;
}) {
  const titleId = useId();
  const stayRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const { title, body } = leaveDialogText(pending, dateLabel);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    stayRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onStay(); return; }
      if (e.key === "Tab") {
        // Keep focus on the dialog's two buttons.
        e.preventDefault();
        (document.activeElement === stayRef.current ? discardRef : stayRef).current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onStay]);
  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onStay(); }}>
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={`${titleId}-body`}>
        <h2 id={titleId} className={styles.dialogTitle}>{title}</h2>
        <p id={`${titleId}-body`} className={styles.muted}>{body}</p>
        <div className={styles.dialogActions}>
          <button ref={stayRef} type="button" className={`${styles.button} elf-focus-ring`} onClick={onStay}>Stay</button>
          <button ref={discardRef} type="button" className={`${styles.button} ${styles.buttonDanger} elf-focus-ring`} onClick={onDiscard}>Discard changes</button>
        </div>
      </div>
    </div>
  );
}
