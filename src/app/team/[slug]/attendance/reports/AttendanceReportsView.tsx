"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download, FileText } from "lucide-react";
import { addCalendarDays } from "@/lib/teamAttendance";
import { CELL_LABELS, formatPercent, sortAthleteRows, type AttendanceReport, type CellStatus, type Counts } from "@/lib/attendanceReport";
import { attendancePath } from "../../team/takeAttendance";
import { reportApiUrl, reportsPagePath, type ReportQuery, type ReportSortKey } from "./reportQuery";
import styles from "./AttendanceReports.module.css";

// Attendance Reports — client screen. Everything shown comes from one
// response of /api/team/[slug]/attendance/report for the current filters;
// the download links are the same request in another format, so a file
// always matches the screen.

type ReportResponse = {
  team: { schoolName: string; sportName: string; season: string };
  today: string;
  from: string;
  to: string;
  defaultFrom: string;
  firstSessionDate: string | null;
  maxRangeDays: number;
  percentDefinition: string;
  roster: { id: string; name: string }[];
  report: AttendanceReport;
};

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ReportResponse };

const SESSIONS_PAGE = 20;

const SORT_LABELS: Record<ReportSortKey, string> = { name: "Name", percent: "Attendance %", absences: "Absences" };

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

const STATUS_CLASS: Record<CellStatus, string> = {
  present: styles.sPresent,
  excused: styles.sExcused,
  unexcused: styles.sUnexcused,
  other: styles.sOther,
  unmarked: styles.sUnmarked,
  not_on_roster: styles.sNa,
};

export default function AttendanceReportsView({ slug, teamName, initial }: { slug: string; teamName: string; initial: ReportQuery }) {
  const [query, setQuery] = useState<ReportQuery>(initial);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [sessionsShown, setSessionsShown] = useState(SESSIONS_PAGE);
  const [attempt, setAttempt] = useState(0);
  // Dates being typed; applied when both are valid.
  const [draftFrom, setDraftFrom] = useState(initial.from ?? "");
  const [draftTo, setDraftTo] = useState(initial.to ?? "");

  // Sorting is applied here as well as by the server, so changing it is
  // instant; the downloads carry it too.
  const fetchKey = JSON.stringify({ from: query.from, to: query.to, athlete: query.athlete, attempt });

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new request starts
    setLoad({ kind: "loading" });
    fetch(reportApiUrl(slug, { ...query, sort: "name" }, "json"), { cache: "no-store" })
      .then(async res => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body?.report) {
          setLoad({ kind: "error", message: body?.error ?? "The report couldn't be loaded. Please try again." });
          return;
        }
        const data = body as ReportResponse;
        setLoad({ kind: "ready", data });
        setDraftFrom(data.from);
        setDraftTo(data.to);
        setSessionsShown(SESSIONS_PAGE);
      })
      .catch(() => { if (!cancelled) setLoad({ kind: "error", message: "Network error. Please try again." }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchKey is the request identity
  }, [slug, fetchKey]);

  // Keep the filters in the address bar (refresh / share keeps them).
  useEffect(() => {
    try { window.history.replaceState(null, "", reportsPagePath(slug, query)); } catch { /* ignore */ }
  }, [slug, query]);

  const data = load.kind === "ready" ? load.data : null;
  const athletes = useMemo(() => (data ? sortAthleteRows(data.report.athletes, query.sort) : []), [data, query.sort]);
  const order = useMemo(() => new Map(athletes.map((a, i) => [a.athleteId, i])), [athletes]);
  const nameOf = useMemo(() => new Map((data?.report.athletes ?? []).map(a => [a.athleteId, a.name])), [data]);

  const rangeError = (() => {
    if (!draftFrom || !draftTo) return "Choose a start and end date.";
    if (draftFrom > draftTo) return "The start date must be on or before the end date.";
    if (data && addCalendarDays(draftFrom, data.maxRangeDays) < draftTo) return "Choose a date range of up to one year.";
    return null;
  })();

  const applyDates = (from: string, to: string) => {
    setDraftFrom(from);
    setDraftTo(to);
    if (from && to && from <= to && (!data || addCalendarDays(from, data.maxRangeDays) >= to)) {
      setQuery(q => ({ ...q, from, to }));
    }
  };

  const presets = data ? [
    { label: "Season to date", from: seasonStart(data), to: data.today },
    { label: "Last 30 days", from: addCalendarDays(data.today, -29), to: data.today },
    { label: "Last 7 days", from: addCalendarDays(data.today, -6), to: data.today },
  ] : [];

  const report = data?.report ?? null;
  // Downloads name the dates actually shown (the server's defaults included).
  const shown: ReportQuery = data ? { ...query, from: data.from, to: data.to } : query;
  const filteredAthlete = query.athlete && data ? data.roster.find(a => a.id === query.athlete)?.name ?? null : null;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <Link href={attendancePath(slug)} className={`${styles.backLink} elf-focus-ring`}>
          <ChevronLeft size={16} aria-hidden="true" />
          Attendance
        </Link>
        <p className={styles.teamName}>{teamName}{data?.team.season ? ` · ${data.team.season}` : ""}</p>
        <h1 className={styles.title}>Attendance Reports</h1>
        {data && (
          <p className={styles.dateLine}>
            {shortDate(data.from)} – {shortDate(data.to)}{filteredAthlete ? ` · ${filteredAthlete}` : ""}
          </p>
        )}
      </header>

      {/* ── Filters ── */}
      <section className={styles.card} aria-label="Report filters">
        <div className={styles.filterGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>From</span>
            <input type="date" className={`${styles.input} elf-focus-ring`} value={draftFrom} max={data?.today}
              onChange={e => applyDates(e.target.value, draftTo)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>To</span>
            <input type="date" className={`${styles.input} elf-focus-ring`} value={draftTo} max={data?.today}
              onChange={e => applyDates(draftFrom, e.target.value)} />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Athlete</span>
            <select className={`${styles.input} elf-focus-ring`} value={query.athlete ?? ""}
              onChange={e => setQuery(q => ({ ...q, athlete: e.target.value || null }))} disabled={!data}>
              <option value="">All athletes</option>
              {(data?.roster ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        {presets.length > 0 && (
          <div className={styles.presets}>
            {presets.map(p => (
              <button key={p.label} type="button" className={`${styles.chip} ${draftFrom === p.from && draftTo === p.to ? styles.chipActive : ""} elf-focus-ring`}
                onClick={() => applyDates(p.from, p.to)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
        {rangeError && draftFrom !== "" && draftTo !== "" && <p className={styles.fieldError} role="alert">{rangeError}</p>}
        <p className={styles.hint}>All attendance sessions are included — sessions don&rsquo;t have separate event types.</p>
      </section>

      {load.kind === "loading" && <div className={styles.card}><p className={styles.muted}>Loading report…</p></div>}
      {load.kind === "error" && (
        <div className={styles.card} role="alert">
          <p className={styles.errorText}>{load.message}</p>
          <button type="button" className={`${styles.secondaryBtn} elf-focus-ring`} onClick={() => setAttempt(n => n + 1)}>Try again</button>
        </div>
      )}

      {report && data && (
        <>
          {/* ── Summary ── */}
          <section className={styles.summary} aria-label="Summary">
            <div className={styles.rateCard}>
              <span className={styles.rateLabel}>{filteredAthlete ? "Attendance" : "Team attendance"}</span>
              <span className={styles.rateValue}>{formatPercent(report.totals.percent)}</span>
              <span className={styles.rateSub}>
                {report.totals.present} present of {report.totals.marked} marked
              </span>
            </div>
            <div className={styles.statGrid}>
              <Stat label="Athletes" value={report.athleteCount} />
              <Stat label="Sessions" value={report.sessionCount} />
              <Stat label="Present" value={report.totals.present} tone="present" />
              <Stat label="Absent" value={report.totals.absent} tone="absent" />
              <Stat label="Excused" value={report.totals.excused} />
              <Stat label="Unexcused" value={report.totals.unexcused} />
              <Stat label="Other" value={report.totals.other} />
              <Stat label="Unmarked" value={report.totals.unmarked} />
              <Stat label="Not on roster yet" value={report.totals.notOnRoster} />
            </div>
          </section>
          <p className={styles.definition}>{data.percentDefinition}</p>
          {report.removedRecords > 0 && (
            <p className={styles.definition}>
              {report.removedRecords} saved record{report.removedRecords === 1 ? "" : "s"} for athletes no longer on the roster {report.removedRecords === 1 ? "is" : "are"} not included.
            </p>
          )}

          {/* ── Downloads ── */}
          <section className={styles.downloads} aria-label="Download report">
            <a className={`${styles.downloadBtn} elf-focus-ring`} href={reportApiUrl(slug, shown, "pdf")} download>
              <FileText size={16} aria-hidden="true" /> PDF report
            </a>
            <a className={`${styles.downloadBtn} elf-focus-ring`} href={reportApiUrl(slug, shown, "csv-athletes")} download>
              <Download size={16} aria-hidden="true" /> CSV · Athletes
            </a>
            <a className={`${styles.downloadBtn} elf-focus-ring`} href={reportApiUrl(slug, shown, "csv-sessions")} download>
              <Download size={16} aria-hidden="true" /> CSV · Sessions
            </a>
          </section>

          {/* ── Athletes ── */}
          <section className={styles.card} aria-labelledby="athletes-heading">
            <div className={styles.sectionHead}>
              <h2 id="athletes-heading" className={styles.cardTitle}>Athletes</h2>
              <div className={styles.sortGroup} role="group" aria-label="Sort athletes by">
                {(Object.keys(SORT_LABELS) as ReportSortKey[]).map(s => (
                  <button key={s} type="button" aria-pressed={query.sort === s}
                    className={`${styles.chip} ${query.sort === s ? styles.chipActive : ""} elf-focus-ring`}
                    onClick={() => setQuery(q => ({ ...q, sort: s }))}>
                    {SORT_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            {athletes.length === 0 ? (
              <p className={styles.muted}>No athletes are on the roster.</p>
            ) : (
              <>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Athlete</th>
                      <th scope="col" className={styles.num}>Present</th>
                      <th scope="col" className={styles.num}>Absent</th>
                      <th scope="col" className={styles.num}>Excused</th>
                      <th scope="col" className={styles.num}>Unexcused</th>
                      <th scope="col" className={styles.num}>Other</th>
                      <th scope="col" className={styles.num}>Unmarked</th>
                      <th scope="col" className={styles.num}>Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {athletes.map(a => (
                      <tr key={a.athleteId}>
                        <th scope="row">
                          <span className={styles.athleteName}>{a.name}</span>
                          {a.classYear && <span className={styles.grade}>{a.classYear}</span>}
                        </th>
                        <td className={styles.num}>{a.present}</td>
                        <td className={styles.num}>{a.absent}</td>
                        <td className={styles.num}>{a.excused}</td>
                        <td className={styles.num}>{a.unexcused}</td>
                        <td className={styles.num}>{a.other}</td>
                        <td className={styles.num}>{a.unmarked}</td>
                        <td className={`${styles.num} ${styles.pct}`}>{formatPercent(a.percent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className={styles.athleteCards}>
                  {athletes.map(a => <AthleteCard key={a.athleteId} a={a} />)}
                </ul>
              </>
            )}
          </section>

          {/* ── Sessions ── */}
          <section className={styles.card} aria-labelledby="sessions-heading">
            <h2 id="sessions-heading" className={styles.cardTitle}>Sessions</h2>
            {report.sessions.length === 0 ? (
              <p className={styles.muted}>No attendance was taken in this date range.</p>
            ) : (
              <>
                <ul className={styles.sessionList}>
                  {report.sessions.slice(0, sessionsShown).map(s => {
                    const cells = [...s.cells].sort((x, y) => order.get(x.athleteId)! - order.get(y.athleteId)!);
                    const notPresent = cells.filter(c => c.status !== "present");
                    const present = cells.filter(c => c.status === "present");
                    return (
                      <li key={s.sessionId} className={styles.session}>
                        <details>
                          <summary className={`${styles.sessionSummary} elf-focus-ring`}>
                            <span className={styles.sessionDate}>{longDate(s.date)}</span>
                            <span className={styles.sessionCounts}>
                              {query.athlete && cells[0]
                                ? <span className={`${styles.status} ${STATUS_CLASS[cells[0].status]}`}>{CELL_LABELS[cells[0].status]}</span>
                                : <>
                                    <span>{s.counts.present} present</span>
                                    <span>{s.counts.absent} absent</span>
                                    {s.counts.unmarked > 0 && <span>{s.counts.unmarked} unmarked</span>}
                                    <span className={styles.pct}>{formatPercent(s.counts.percent)}</span>
                                  </>}
                            </span>
                          </summary>
                          <ul className={styles.cellList}>
                            {notPresent.map(c => (
                              <li key={c.athleteId} className={styles.cell}>
                                <span className={styles.cellName}>{nameOf.get(c.athleteId)}</span>
                                <span className={`${styles.status} ${STATUS_CLASS[c.status]}`}>{CELL_LABELS[c.status]}</span>
                              </li>
                            ))}
                            {present.length > 0 && (
                              <li className={styles.presentLine}>
                                <span className={`${styles.status} ${styles.sPresent}`}>Present</span>{" "}
                                {present.map(c => nameOf.get(c.athleteId)).join(", ")}
                              </li>
                            )}
                          </ul>
                        </details>
                      </li>
                    );
                  })}
                </ul>
                {report.sessions.length > sessionsShown && (
                  <button type="button" className={`${styles.secondaryBtn} elf-focus-ring`} onClick={() => setSessionsShown(n => n + SESSIONS_PAGE)}>
                    Show more sessions ({report.sessions.length - sessionsShown} more)
                  </button>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** First session (at most one year back) → today; today when there are none. */
function seasonStart(d: ReportResponse): string {
  if (!d.firstSessionDate || d.firstSessionDate > d.today) return d.today;
  const earliest = addCalendarDays(d.today, -d.maxRangeDays);
  return d.firstSessionDate < earliest ? earliest : d.firstSessionDate;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "present" | "absent" }) {
  return (
    <div className={`${styles.stat} ${tone === "present" ? styles.statPresent : tone === "absent" ? styles.statAbsent : ""}`}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function AthleteCard({ a }: { a: Counts & { athleteId: string; name: string; classYear: string | null } }) {
  return (
    <li className={styles.athleteCard}>
      <div className={styles.athleteCardHead}>
        <span className={styles.athleteName}>{a.name}</span>
        <span className={styles.pct}>{formatPercent(a.percent)}</span>
      </div>
      {a.classYear && <span className={styles.grade}>{a.classYear}</span>}
      <dl className={styles.miniStats}>
        <div><dt>Present</dt><dd>{a.present}</dd></div>
        <div><dt>Absent</dt><dd>{a.absent}</dd></div>
        <div><dt>Excused</dt><dd>{a.excused}</dd></div>
        <div><dt>Unexcused</dt><dd>{a.unexcused}</dd></div>
        <div><dt>Other</dt><dd>{a.other}</dd></div>
        <div><dt>Unmarked</dt><dd>{a.unmarked}</dd></div>
      </dl>
    </li>
  );
}
