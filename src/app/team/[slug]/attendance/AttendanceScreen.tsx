"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";
import { attendanceRuleMessage } from "@/lib/teamAttendance";
import { draftChanges, type AttendanceEntry } from "@/lib/teamAttendanceDraft";
import GradeTabs, { gradeTabId, gradeTabPanelId } from "../team/GradeTabs";
import { rosterPath } from "../team/takeAttendance";
import {
  ATTENDANCE_FILTERS,
  attendanceListView,
  attendanceMode,
  attendanceSummary,
  canEdit,
  entryProblems,
  recentDates,
  saveAvailability,
  serverIssueCodesFor,
  type EditorState,
} from "./attendanceEditor";
import {
  formatLongDate,
  formatSavedAt,
  modeLabel,
  readFailureText,
  readOnlyReasonText,
  saveStatusText,
} from "./attendanceFormat";
import { AttendanceRow, LateAthleteRow, ReadOnlyRow } from "./AttendanceRow";
import { ConflictPanel, DatePanel, HistoryPanel, LeaveDialog, MergeNoticePanel, SummaryPanel } from "./AttendancePanels";
import type { AttendanceEditorActions } from "./useAttendanceEditor";
import styles from "./Attendance.module.css";

// Team Management Phase 5-4 — the coach attendance screen (presentation
// only: everything it shows comes from the editor state; every change goes
// through `actions`). Coach-only: the page renders this only for Head
// Coaches, Assistant Coaches and platform admins, and every API it calls
// re-checks that on the server.

/** Rows rendered at once; more on request ("Show all"), never silently cut. */
export const ROW_RENDER_LIMIT = 400;

const CLASS_TABS = "att-class";

/** Class groups cut to the first `limit` rows overall (in display order). */
function groupsWithin(groups: { label: string; entries: AttendanceEntry[] }[], limit: number) {
  let left = limit;
  return groups.flatMap(g => {
    if (left <= 0) return [];
    const entries = g.entries.slice(0, left);
    left -= entries.length;
    return [{ label: g.label, total: g.entries.length, entries }];
  });
}

export default function AttendanceScreen({
  slug,
  teamName,
  state,
  dirty,
  actions,
}: {
  slug: string;
  teamName: string;
  state: EditorState;
  dirty: boolean;
  actions: AttendanceEditorActions;
}) {
  const [renderAll, setRenderAll] = useState(false);
  const draft = state.draft;
  const mode = attendanceMode(state);
  const editing = canEdit(state);
  const list = attendanceListView(state);
  const summary = attendanceSummary(state);
  const availability = saveAvailability(state);
  const today = state.clock?.today ?? null;
  const timeZone = state.clock?.timeZone ?? draft?.timeZone ?? "America/Phoenix";
  const session = state.meta?.session ?? null;
  const changes = draft ? draftChanges(draft) : null;
  const saving = state.save.kind === "saving";
  const dateLabel = state.selectedDate ? formatLongDate(state.selectedDate) : null;
  const statusText = saveStatusText(state.save, timeZone);
  const statusOk = state.save.kind === "saved" || state.save.kind === "saved_needs_reload";
  const generalIssues = state.serverIssues.filter(i => i.athleteId === null);
  const showList = !!draft && state.load.kind === "ready"
    && state.meta?.editability !== "date_in_future"
    && (draft.editability.editable || draft.exists);
  const readOnly = !!draft && !draft.editability.editable;

  const visible = list?.visible ?? [];
  const rendered = renderAll ? visible : visible.slice(0, ROW_RENDER_LIMIT);

  const renderRow = (e: AttendanceEntry) => (readOnly
    // Read-only: saved marks only ("Not recorded" otherwise — never a
    // draft default). If the date became read-only during a save, the
    // coach's unsaved marks stay visible (and the save status says they
    // weren't saved).
    ? <ReadOnlyRow key={e.key} entry={e} recorded={e.savedInSession || dirty} />
    : (
      <AttendanceRow
        key={e.key}
        entry={e}
        editable={editing && !draft!.conflicts[e.key]}
        problems={entryProblems(draft!, e, state.serverIssues)}
        serverCodes={serverIssueCodesFor(e, state.serverIssues)}
        showProblems={state.attempted}
        onEdit={actions.edit}
      />
    ));

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        {/* Back to this team's roster (where Take Attendance is). A normal
            link, so the unsaved-changes guard still asks first. */}
        <Link href={rosterPath(slug)} className={`${styles.backLink} elf-focus-ring`}>
          <ChevronLeft size={16} aria-hidden="true" />
          Roster
        </Link>
        <p className={styles.teamName}>{teamName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Attendance</h1>
          {mode.kind !== "loading" && (
            <span className={`${styles.badge} ${mode.kind === "draft" ? styles.badgeDraft : styles.badgeReadOnly}`}>
              {modeLabel(mode)}
            </span>
          )}
        </div>
        {dateLabel && (
          <p className={styles.dateLine}>
            {dateLabel}{state.selectedDate === today ? " (today)" : ""}
          </p>
        )}
        {mode.kind === "read_only" && <p className={styles.muted}>{readOnlyReasonText(mode.reason)}</p>}
        {session && (
          <p className={styles.muted}>
            Last saved {formatSavedAt(session.updatedAt, session.timeZone)}{session.updatedByName ? ` by ${session.updatedByName}` : ""}.
          </p>
        )}
        <div className={styles.headerActions}>
          <button type="button" className={styles.textButton} onClick={actions.reload} disabled={saving || !state.selectedDate}>
            Reload
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.sideTop}>
          <DatePanel
            today={today}
            selectedDate={state.selectedDate}
            recent={recentDates(state)}
            dateError={state.dateError}
            disabled={saving}
            onSelect={actions.selectDate}
          />
          {showList && <SummaryPanel summary={summary} />}
        </div>

        <div className={styles.main}>
          {state.merge && <MergeNoticePanel notice={state.merge} onDismiss={actions.dismissMerge} />}

          {draft && Object.keys(draft.conflicts).length > 0 && (
            <ConflictPanel draft={draft} editable={editing} onEdit={actions.edit} />
          )}

          {state.attempted && list && list.problems > 0 && (
            <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
              <p className={styles.noticeTitle}>
                {list.problems} {list.problems === 1 ? "athlete needs" : "athletes need"} attention before saving.
              </p>
              {list.hiddenProblems > 0 && (
                <p style={{ margin: 0 }}>{list.hiddenProblems} of them {list.hiddenProblems === 1 ? "is" : "are"} hidden by your search or filter.</p>
              )}
              {(list.hiddenProblems > 0 || state.filter !== "attention") && (
                <div className={styles.noticeActions}>
                  <button type="button" className={styles.button} onClick={actions.showAttention}>Show athletes that need attention</button>
                </div>
              )}
            </div>
          )}
          {generalIssues.length > 0 && (
            <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
              {[...new Set(generalIssues.map(i => attendanceRuleMessage(i.code)))].map(m => <p key={m} style={{ margin: 0 }}>{m}</p>)}
            </div>
          )}

          {state.load.kind === "idle" && state.list.kind === "error" && (
            // The team's date comes from the server; without it no date is opened.
            <div className={`${styles.card} ${styles.empty}`} role="alert">
              <p className={styles.emptyTitle}>Attendance couldn&apos;t be loaded</p>
              <p className={styles.muted}>{readFailureText(state.list.failure)}</p>
              <div className={styles.noticeActions} style={{ justifyContent: "center" }}>
                <button type="button" className={styles.button} onClick={actions.retryList}>Try again</button>
              </div>
            </div>
          )}

          {(state.load.kind === "loading" || (state.load.kind === "idle" && state.list.kind === "loading")) && (
            <div aria-busy="true" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
              <span className={styles.srOnly}>Loading attendance…</span>
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
            </div>
          )}

          {state.load.kind === "error" && (
            <div className={`${styles.card} ${styles.empty}`} role="alert">
              <p className={styles.emptyTitle}>Attendance couldn&apos;t be loaded</p>
              <p className={styles.muted}>{readFailureText(state.load.failure)}</p>
              <div className={styles.noticeActions} style={{ justifyContent: "center" }}>
                <button type="button" className={styles.button} onClick={actions.reload}>Try again</button>
              </div>
            </div>
          )}

          {state.load.kind === "ready" && draft && state.meta?.editability === "date_in_future" && (
            <div className={`${styles.card} ${styles.empty}`}>
              <p className={styles.emptyTitle}>This date hasn&apos;t happened yet</p>
              <p className={styles.muted}>Attendance can&apos;t be taken for a future date.</p>
            </div>
          )}

          {state.load.kind === "ready" && draft && readOnly && !draft.exists && state.meta?.editability !== "date_in_future" && (
            <div className={`${styles.card} ${styles.empty}`}>
              <p className={styles.emptyTitle}>No Attendance Recorded</p>
              <p className={styles.muted}>Attendance wasn&apos;t saved for this date, and it&apos;s too long ago to add now.</p>
            </div>
          )}

          {showList && list && list.inSession > 0 && (
            // The Team/Roster screen's own class tabs (unchanged component).
            <GradeTabs tabs={list.tabs} value={list.grade} onChange={actions.grade} idPrefix={CLASS_TABS} label="Show athletes by class" />
          )}

          {showList && list && (
            <div
              className={styles.classPanel}
              {...(list.inSession > 0 ? { id: gradeTabPanelId(CLASS_TABS), role: "tabpanel", "aria-labelledby": gradeTabId(CLASS_TABS, list.grade) } : {})}
            >
              {editing && list.pendingLate.length > 0 && (
                <section className={styles.card} aria-labelledby="att-late-title">
                  <h2 id="att-late-title" className={styles.cardTitle}>Added after this date ({list.pendingLate.length})</h2>
                  <p className={styles.muted} style={{ marginBottom: ".5rem" }}>
                    These athletes joined the roster after {state.selectedDate ? formatLongDate(state.selectedDate) : "this date"}. They aren&apos;t counted unless you include them.
                  </p>
                  <ul className={styles.list}>
                    {list.pendingLate.map(e => <LateAthleteRow key={e.key} entry={e} editable={editing} onEdit={actions.edit} />)}
                  </ul>
                </section>
              )}

              {list.inSession > 0 && (
                <div className={styles.toolbar}>
                  <div className={styles.searchWrap}>
                    <Search size={16} aria-hidden="true" />
                    <label htmlFor="att-search" className={styles.srOnly}>Search athletes</label>
                    <input
                      id="att-search"
                      type="search"
                      className={`${styles.input} ${styles.searchInput}`}
                      placeholder="Search athletes"
                      value={state.search}
                      autoComplete="off"
                      onChange={e => actions.search(e.target.value)}
                    />
                  </div>
                  <div className={styles.filters} role="group" aria-label="Show athletes">
                    {ATTENDANCE_FILTERS.map(f => (
                      <button
                        key={f.key}
                        type="button"
                        className={`${styles.filterButton} elf-focus-ring`}
                        aria-pressed={state.filter === f.key}
                        onClick={() => actions.filter(f.key)}
                      >
                        {f.label} <span className={styles.filterCount}>{list.counts[f.key]}</span>
                      </button>
                    ))}
                  </div>
                  {list.filtered && (
                    <p className={styles.muted} role="status">
                      Showing {visible.length} of {list.inSession} athletes. Filters only change what&apos;s shown — Save Draft always saves every athlete.
                    </p>
                  )}
                </div>
              )}

              {list.inSession === 0 && !readOnly && (
                <div className={`${styles.card} ${styles.empty}`}>
                  <p className={styles.emptyTitle}>No athletes to take attendance for</p>
                  <p className={styles.muted}>
                    {list.pendingLate.length > 0 ? "Include an athlete above to take attendance for this date." : "Add athletes to the roster first."}
                  </p>
                </div>
              )}

              {list.inSession > 0 && visible.length === 0 && (
                <p className={styles.muted}>No athletes match.</p>
              )}

              {list.groups ? (
                // All Athletes: under class headings, in the roster's class order.
                groupsWithin(list.groups, renderAll ? Infinity : ROW_RENDER_LIMIT).map((g, i) => (
                  <section key={g.label} aria-labelledby={`att-class-${i}`}>
                    <h3 id={`att-class-${i}`} className={styles.classHeading}>
                      {g.label} <span className={styles.classHeadingCount}>({g.total})</span>
                    </h3>
                    <ul className={styles.list}>{g.entries.map(renderRow)}</ul>
                  </section>
                ))
              ) : rendered.length > 0 && (
                <ul className={styles.list} aria-label="Athletes">{rendered.map(renderRow)}</ul>
              )}
              {!renderAll && visible.length > ROW_RENDER_LIMIT && (
                <div>
                  <p className={styles.muted}>Showing the first {ROW_RENDER_LIMIT} of {visible.length} athletes.</p>
                  <button type="button" className={styles.button} onClick={() => setRenderAll(true)}>Show all {visible.length}</button>
                </div>
              )}

              {list.removed.length > 0 && (
                <section aria-labelledby="att-removed-title">
                  <h2 id="att-removed-title" className={styles.cardTitle} style={{ marginTop: ".5rem" }}>
                    No longer on the roster ({list.removed.length})
                  </h2>
                  <p className={styles.muted} style={{ marginBottom: ".5rem" }}>
                    Saved attendance for athletes who have since left the roster. Shown for the record; not counted and not changed by saving.
                  </p>
                  <ul className={styles.list}>
                    {list.removed.map(e => <ReadOnlyRow key={e.key} entry={e} recorded removed />)}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        <div className={styles.sideBottom}>
          <HistoryPanel
            sessions={state.list.kind === "ready" ? state.list.value.sessions : []}
            selectedDate={state.selectedDate}
            status={state.list.kind}
            disabled={saving}
            onSelect={actions.selectDate}
            onRetry={actions.retryList}
          />

          {draft && state.load.kind === "ready" && (editing || dirty || statusText) && (
            <div className={styles.saveBar}>
              <div className={styles.saveRow}>
                <div className={styles.saveInfo}>
                  {dirty && changes
                    ? <strong>Unsaved changes{changes.changed.length > 0 ? ` (${changes.changed.length} ${changes.changed.length === 1 ? "athlete" : "athletes"})` : ""}</strong>
                    : changes?.isNew && editing ? <strong>Not saved yet</strong>
                    : <span>No unsaved changes</span>}
                  {availability.reason === "conflicts" && <div>Choose a version for each conflict to save.</div>}
                </div>
                {(state.save.kind === "saved_needs_reload" || state.save.kind === "reload_failed") ? (
                  <button type="button" className={`${styles.button} ${styles.buttonPrimary} elf-focus-ring`} onClick={state.save.kind === "reload_failed" ? actions.save : actions.reload}>
                    {state.save.kind === "reload_failed" ? "Try again" : "Reload"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonPrimary} elf-focus-ring`}
                    onClick={actions.save}
                    disabled={!availability.enabled}
                    aria-describedby="att-save-status"
                  >
                    {saving ? "Saving…" : "Save Draft"}
                  </button>
                )}
              </div>
              <p
                id="att-save-status"
                className={`${styles.saveStatus} ${statusOk ? styles.saveStatusOk : styles.saveStatusBad}`}
                role="status"
                aria-live="polite"
              >
                {statusText ?? ""}
              </p>
            </div>
          )}
        </div>
      </div>

      {state.pending && (
        <LeaveDialog pending={state.pending} dateLabel={dateLabel} onStay={actions.stay} onDiscard={actions.discard} />
      )}
    </div>
  );
}
