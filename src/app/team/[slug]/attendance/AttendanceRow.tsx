"use client";

import { memo, useId, useState } from "react";
import {
  ABSENCE_REASONS,
  ABSENCE_REASON_LABELS,
  ATTENDANCE_NOTE_MAX,
  attendanceRuleMessage,
  noteCharactersRemaining,
  type AttendanceMark,
  type AttendanceRuleCode,
} from "@/lib/teamAttendance";
import type { AttendanceEntry, EntryState } from "@/lib/teamAttendanceDraft";
import type { EditOp, EntryProblem } from "./attendanceEditor";
import { problemText } from "./attendanceFormat";
import styles from "./Attendance.module.css";

// Team Management Phase 5-4 — one athlete on the attendance screen.
// Native radio buttons (keyboard and screen-reader friendly) under large
// labels as the touch targets. Edits go through the Phase 5-2 draft
// functions via onEdit; this component holds no attendance state of its
// own except whether an empty note field is open.

export function markText(mark: AttendanceMark): string {
  if (mark.status === "present") return "Present";
  return mark.absenceReason ? `Absent · ${ABSENCE_REASON_LABELS[mark.absenceReason]}` : "Absent · no reason chosen";
}

export function entryStateText(state: EntryState): string {
  return state.included ? markText(state.mark) : "Not included in this session";
}

function classLabel(classYear: string | null): string {
  return classYear ? classYear : "No grade set";
}

export const AttendanceRow = memo(function AttendanceRow({
  entry,
  editable,
  problems,
  serverCodes,
  showProblems,
  onEdit,
}: {
  entry: AttendanceEntry;
  /** Editing allowed now (date editable, not saving, no open conflict). */
  editable: boolean;
  problems: EntryProblem[];
  serverCodes: AttendanceRuleCode[];
  /** A save was attempted: problems are errors, not hints. */
  showProblems: boolean;
  onEdit: (edit: EditOp) => void;
}) {
  const uid = useId();
  const [noteOpen, setNoteOpen] = useState(false);
  const id = entry.athleteId as string;
  const mark = entry.state.mark;
  const absent = mark.status === "absent";
  const conflict = problems.includes("conflict");
  const reasonMissing = problems.includes("reason_required");
  const noteTooLong = problems.includes("note_too_long");
  const hasProblem = problems.some(p => p !== "conflict");
  const noteText = absent ? mark.note ?? "" : "";
  const remaining = noteCharactersRemaining(noteText);
  const errId = `${uid}-err`;
  const noteId = `${uid}-note`;
  const noteCountId = `${uid}-count`;
  const rowClass = [styles.row, conflict ? styles.rowConflict : hasProblem && (showProblems || noteTooLong) ? styles.rowProblem : ""].filter(Boolean).join(" ");
  const late = entry.kind === "late_included" || entry.kind === "late_pending";

  const messages: string[] = [];
  if (reasonMissing) messages.push(problemText("reason_required"));
  if (noteTooLong) messages.push(problemText("note_too_long"));
  for (const code of serverCodes) {
    if (code !== "reason_required" && code !== "note_too_long") messages.push(attendanceRuleMessage(code));
  }

  return (
    <li className={rowClass} data-athlete-row={entry.key} aria-labelledby={`${uid}-name`}>
      <div className={styles.rowHead}>
        <span id={`${uid}-name`} className={styles.athleteName}>{entry.name}</span>
        <span className={styles.athleteClass}>{classLabel(entry.classYear)}</span>
        {late && <span className={`${styles.tag} ${styles.tagLate}`}>Added after this date</span>}
        {entry.newSinceLastSave && <span className={`${styles.tag} ${styles.tagNew}`}>New since last save</span>}
        {conflict && <span className={`${styles.tag} ${styles.tagConflict}`}>Changed by another coach</span>}
      </div>

      <fieldset className={styles.fieldset} disabled={!editable}>
        <legend className={styles.srOnly}>Attendance for {entry.name}</legend>
        <div className={styles.segmented}>
          <label className={`${styles.choice} ${styles.choicePresent}`}>
            <input
              type="radio"
              name={`${uid}-status`}
              value="present"
              checked={!absent}
              onChange={() => onEdit({ op: "present", athleteId: id })}
            />
            Present
          </label>
          <label className={`${styles.choice} ${styles.choiceAbsent}`}>
            <input
              type="radio"
              name={`${uid}-status`}
              value="absent"
              checked={absent}
              onChange={() => onEdit({ op: "absent", athleteId: id })}
              aria-describedby={messages.length ? errId : undefined}
            />
            Absent
          </label>
        </div>
      </fieldset>

      {absent && (
        <fieldset className={styles.fieldset} disabled={!editable} aria-describedby={reasonMissing ? errId : undefined}>
          <legend className={styles.legend}>Reason (required)</legend>
          <div className={styles.reasons}>
            {ABSENCE_REASONS.map(reason => (
              <label key={reason} className={`${styles.choice} ${styles.choiceSmall} ${styles.choiceReason}`}>
                <input
                  type="radio"
                  name={`${uid}-reason`}
                  value={reason}
                  checked={mark.absenceReason === reason}
                  onChange={() => onEdit({ op: "reason", athleteId: id, reason })}
                />
                {ABSENCE_REASON_LABELS[reason]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {messages.length > 0 && (
        <p id={errId} className={`${showProblems || noteTooLong ? styles.errorText : styles.warnText} ${styles.rowFull}`} role={showProblems ? "alert" : undefined}>
          {messages.join(" ")}
        </p>
      )}

      {absent && (noteOpen || noteText !== "") && (
        <div className={`${styles.noteBlock} ${styles.rowNote}`}>
          <div className={styles.noteLabelRow}>
            <label htmlFor={noteId}>Note (optional)</label>
            <span id={noteCountId} className={`${styles.noteCount} ${remaining < 0 ? styles.noteCountOver : ""}`}>
              {ATTENDANCE_NOTE_MAX - remaining} / {ATTENDANCE_NOTE_MAX}
            </span>
          </div>
          <textarea
            id={noteId}
            className={`${styles.input} ${styles.textarea}`}
            value={noteText}
            disabled={!editable}
            rows={2}
            autoComplete="off"
            aria-describedby={noteCountId}
            aria-invalid={noteTooLong ? true : undefined}
            onChange={e => onEdit({ op: "note", athleteId: id, note: e.target.value })}
          />
        </div>
      )}
      {absent && !noteOpen && noteText === "" && editable && (
        <div className={styles.rowNote}>
          <button type="button" className={styles.textButton} onClick={() => setNoteOpen(true)}>
            Add note
          </button>
        </div>
      )}

      {entry.kind === "late_pending" && entry.state.included && editable && (
        <div className={styles.rowFull}>
          <button type="button" className={styles.textButton} onClick={() => onEdit({ op: "exclude_late", athleteId: id })}>
            Don&apos;t include in this session
          </button>
        </div>
      )}
    </li>
  );
});

/** A saved mark, shown without controls (read-only dates, removed athletes). */
export function ReadOnlyRow({ entry, recorded, removed = false }: { entry: AttendanceEntry; recorded: boolean; removed?: boolean }) {
  const mark = entry.state.mark;
  return (
    <li className={styles.row} data-athlete-row={entry.key}>
      <div className={styles.rowHead}>
        <span className={styles.athleteName}>{entry.name}</span>
        <span className={styles.athleteClass}>{classLabel(entry.classYear)}</span>
        {removed && <span className={`${styles.tag} ${styles.tagRemoved}`}>No longer on roster</span>}
        {!removed && (entry.kind === "late_included" || entry.kind === "late_pending") && (
          <span className={`${styles.tag} ${styles.tagLate}`}>Added after this date</span>
        )}
      </div>
      <span className={styles.readOnlyMark}>{recorded ? markText(mark) : "Not recorded"}</span>
      {recorded && mark.status === "absent" && mark.note && (
        <p className={`${styles.readOnlyNote} ${styles.rowNote}`}><span className={styles.srOnly}>Note: </span>{mark.note}</p>
      )}
    </li>
  );
}

/** An athlete who joined the roster after this date: the coach decides. */
export function LateAthleteRow({ entry, editable, onEdit }: { entry: AttendanceEntry; editable: boolean; onEdit: (edit: EditOp) => void }) {
  const id = entry.athleteId as string;
  return (
    <li className={styles.row} data-athlete-row={entry.key}>
      <div className={styles.rowHead}>
        <span className={styles.athleteName}>{entry.name}</span>
        <span className={styles.athleteClass}>{classLabel(entry.classYear)}</span>
        <span className={`${styles.tag} ${styles.tagLate}`}>Added after this date</span>
      </div>
      <p className={`${styles.muted} ${styles.rowFull}`}>Not in this session. Include them only if they were part of the team on this date.</p>
      {editable && (
        <div className={`${styles.lateActions} ${styles.rowFull}`}>
          <button type="button" className={styles.button} onClick={() => onEdit({ op: "include_late", athleteId: id, status: "present" })}>
            Include as Present
          </button>
          <button type="button" className={styles.button} onClick={() => onEdit({ op: "include_late", athleteId: id, status: "absent" })}>
            Include as Absent
          </button>
        </div>
      )}
    </li>
  );
}
