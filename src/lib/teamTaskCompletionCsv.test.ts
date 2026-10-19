// Team Management Phase 4 — pure completion CSV builder.
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPLETION_CSV_HEADERS,
  CompletionCsvError,
  MAX_COMPLETION_CSV_BYTES,
  buildCompletionCsv,
  buildCompletionCsvRows,
  completionCsvFilename,
  csvCell,
  csvDate,
  exportDate,
  neutralizeFormula,
  type CompletionCsvInput,
} from "./teamTaskCompletionCsv.ts";
import type { CompletionEntry, CompletionState, CompletionTask } from "./teamTaskCompletion.ts";

const BS = String.fromCharCode(92);
const ch = (code: number) => String.fromCharCode(code);
const BOM = ch(0xFEFF);

/** Minimal RFC 4180 parser for assertions (handles quotes, CR/LF in cells). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const task = (id: string, title: string, audience: string, revision = 1): CompletionTask => ({ id, title, audience, revision });
const e = (requirement: "athlete" | "parent", state: CompletionState, acknowledgedAt: string | null = null): CompletionEntry => ({ requirement, state, acknowledgedAt });
const ath = (id: string, name: string, class_year: string | null = null) => ({ id, name, class_year, jersey_number: null });

test("exactly the 11 approved columns, in order", () => {
  assert.deepEqual([...COMPLETION_CSV_HEADERS], [
    "Grade", "Athlete Name", "Task", "Task Revision", "Task Audience", "Athlete Acknowledgment", "Athlete Acknowledged On",
    "Parent/Guardian Acknowledgment", "Parent/Guardian Acknowledged On", "Overall Status", "Outstanding Reason",
  ]);
});

test("escaping: commas, quotes, CR, LF and CRLF are quoted; quotes doubled; numbers as-is", () => {
  assert.equal(csvCell("Ava Smith"), "Ava Smith");
  assert.equal(csvCell("O'Brien, Kate"), `"O'Brien, Kate"`);
  assert.equal(csvCell('Say "hi"'), `"Say ""hi"""`);
  assert.equal(csvCell("line1\nline2"), `"line1\nline2"`);
  assert.equal(csvCell("line1\r\nline2"), `"line1\r\nline2"`);
  assert.equal(csvCell("a\rb"), `"a\rb"`);
  assert.equal(csvCell(2), "2");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(""), "");
});

test("formula injection: neutralised, including leading whitespace, control and invisible characters", () => {
  const attacks = [
    "=SUM(A1:A2)", "+1+1", "-1+1", "@SUM(A1)", "=HYPERLINK(\"http://x\",\"click\")",
    " =1+1", "   @x", "\t=1+1", "\r=1+1", "\n=1+1", ch(0) + "=1", ch(1) + "abc",
    ch(0xA0) + "=1+1", ch(0x200B) + "@SUM(A1)", ch(0xFEFF) + "=1", ch(0x2028) + "=1", ch(0x3000) + "=1",
    ch(0xFF1D) + "1+1", ch(0xFF0B) + "1", ch(0xFF0D) + "1", ch(0xFF20) + "x", " " + ch(0xFF1D) + "1",
  ];
  for (const a of attacks) {
    const out = neutralizeFormula(a);
    assert.ok(out.startsWith("'"), JSON.stringify(a));
    assert.equal(out.slice(1), a, "original text kept");
  }
  for (const safe of ["Ava Smith", "O'Brien", "Smith-Jones", "5K Run", "Team (A)", "a=b", "", "Physical Forms"]) {
    assert.equal(neutralizeFormula(safe), safe, JSON.stringify(safe));
  }
  // Neutralised AND escaped together.
  assert.equal(csvCell('=HYPERLINK("x","y")'), `"'=HYPERLINK(""x"",""y"")"`);
  assert.equal(csvCell("\t=cmd|' /C calc'!A0"), "'\t=cmd|' /C calc'!A0");
  assert.ok(BS.length === 1);
});

test("dates: YYYY-MM-DD in America/Phoenix (UTC-7, no DST)", () => {
  assert.equal(csvDate("2026-10-18T00:27:25.083433+00:00"), "2026-10-17");
  assert.equal(csvDate("2026-10-18T07:00:00Z"), "2026-10-18");
  assert.equal(csvDate("2026-01-01T06:59:59Z"), "2025-12-31");
  assert.equal(csvDate("2026-07-01T06:59:59Z"), "2026-06-30"); // summer: still UTC-7
  for (const bad of [null, "", "not a date"]) assert.equal(csvDate(bad), "");
  assert.equal(exportDate(new Date("2026-10-20T03:00:00Z")), "2026-10-19");
});

const inputs = (): CompletionCsvInput[] => [
  { task: task("t-both", "Physical Forms", "both", 1), athletes: [
    { athlete: ath("a1", "Ava Smith", "Senior"),  entries: [e("athlete", "complete", "2026-10-18T00:27:25Z"), e("parent", "complete", "2026-10-18T15:00:00Z")] },
    { athlete: ath("a2", "Jake Jones", "Junior"), entries: [e("athlete", "not_joined"), e("parent", "complete", "2026-10-11T10:00:00Z")] },
    { athlete: ath("a3", "Lone Rider", null),     entries: [e("athlete", "not_joined"), e("parent", "no_parent_linked")] },
  ] },
  { task: task("t-par", "Parent Consent", "parent", 2), athletes: [
    { athlete: ath("a1", "Ava Smith", "Senior"),  entries: [e("parent", "needs_update")] },
    { athlete: ath("a2", "Jake Jones", "Junior"), entries: [e("parent", "outstanding")] },
    { athlete: ath("a3", "Lone Rider", null),     entries: [e("parent", "no_parent_linked")] },
  ] },
  { task: task("t-ath", "Athlete Waiver", "athlete", 3), athletes: [
    { athlete: ath("a1", "Ava Smith", "Senior"),  entries: [e("athlete", "outstanding")] },
    { athlete: ath("a2", "Jake Jones", "Junior"), entries: [e("athlete", "complete", "2026-10-12T19:30:00Z")] },
    { athlete: ath("a3", "Lone Rider", null),     entries: [e("athlete", "not_joined")] },
  ] },
];

test("rows: every audience, Not Required, blank dates when incomplete, revision, overall and reason", () => {
  const csv = buildCompletionCsv(buildCompletionCsvRows(inputs()));
  assert.ok(csv.startsWith(BOM), "UTF-8 BOM");
  assert.ok(csv.endsWith("\r\n"));
  assert.ok(!/[^\r]\n/.test(csv), "CRLF only");
  const [header, ...rows] = parseCsv(csv.slice(1));
  assert.deepEqual(header, [...COMPLETION_CSV_HEADERS]);
  assert.deepEqual(rows, [
    // Junior before Senior; "No grade set" last. Within an athlete: task title A-Z.
    ["Junior", "Jake Jones", "Athlete Waiver", "3", "Athlete", "Acknowledged", "2026-10-12", "Not Required", "", "Complete", ""],
    ["Junior", "Jake Jones", "Parent Consent", "2", "Parent", "Not Required", "", "Not Acknowledged", "", "Outstanding", "Parent/guardian has not acknowledged"],
    ["Junior", "Jake Jones", "Physical Forms", "1", "Both", "Not Joined ELF", "", "Acknowledged", "2026-10-11", "Outstanding", "Athlete has not joined ELF"],
    ["Senior", "Ava Smith", "Athlete Waiver", "3", "Athlete", "Not Acknowledged", "", "Not Required", "", "Outstanding", "Athlete has not acknowledged"],
    ["Senior", "Ava Smith", "Parent Consent", "2", "Parent", "Not Required", "", "Needs New Acknowledgment", "", "Outstanding", "Parent/guardian must re-acknowledge (task updated)"],
    ["Senior", "Ava Smith", "Physical Forms", "1", "Both", "Acknowledged", "2026-10-17", "Acknowledged", "2026-10-18", "Complete", ""],
    ["No grade set", "Lone Rider", "Athlete Waiver", "3", "Athlete", "Not Joined ELF", "", "Not Required", "", "Outstanding", "Athlete has not joined ELF"],
    ["No grade set", "Lone Rider", "Parent Consent", "2", "Parent", "Not Required", "", "No Parent Linked", "", "Outstanding", "No parent/guardian linked"],
    ["No grade set", "Lone Rider", "Physical Forms", "1", "Both", "Not Joined ELF", "", "No Parent Linked", "", "Outstanding", "Athlete has not joined ELF; No parent/guardian linked"],
  ]);
  // Never an id in the file.
  assert.ok(!/\ba[123]\b|t-both|t-par|t-ath/.test(csv));
});

test("a Both task is Complete only when athlete AND parent are acknowledged", () => {
  const rows = buildCompletionCsvRows([{ task: task("t", "Forms", "both"), athletes: [
    { athlete: ath("x", "X"), entries: [e("athlete", "complete", "2026-10-18T12:00:00Z"), e("parent", "outstanding")] },
    { athlete: ath("y", "Y"), entries: [e("athlete", "outstanding"), e("parent", "complete", "2026-10-18T12:00:00Z")] },
    { athlete: ath("z", "Z"), entries: [e("athlete", "complete", "2026-10-18T12:00:00Z"), e("parent", "complete", "2026-10-18T12:00:00Z")] },
  ] }]);
  assert.deepEqual(rows.map(r => [r.athleteName, r.overall]), [["X", "Outstanding"], ["Y", "Outstanding"], ["Z", "Complete"]]);
});

test("sorting: ELF grade order (non-standard after, none last), name, task; deterministic for any input order", () => {
  const grades = ["Senior", null, "RS Sophomore", "Freshman", "Other", "7th Grade", "Junior"];
  const names = ["bob", "Bob", "alice", "Álvaro", "Zed"];
  const all: CompletionCsvInput[] = [task("t2", "b task", "athlete"), task("t1", "A task", "athlete")].map(t => ({
    task: t,
    athletes: grades.flatMap((g, gi) => names.map((n, ni) => ({ athlete: ath(`a${gi}-${ni}`, n, g), entries: [e("athlete", "outstanding")] }))),
  }));
  const key = (rs: ReturnType<typeof buildCompletionCsvRows>) => rs.map(r => `${r.grade}|${r.athleteName}|${r.athleteId}|${r.task.title}`);
  const sorted = key(buildCompletionCsvRows(all));
  assert.deepEqual([...new Set(sorted.map(k => k.split("|")[0]))], ["7th Grade", "Freshman", "Junior", "Senior", "Other", "RS Sophomore", "No grade set"]);
  assert.deepEqual(sorted.slice(0, 10).map(k => k.split("|").slice(1, 2)[0] + "/" + k.split("|")[3]),
    ["alice/A task", "alice/b task", "Álvaro/A task", "Álvaro/b task", "Bob/A task", "Bob/b task", "bob/A task", "bob/b task", "Zed/A task", "Zed/b task"]);
  // Shuffled input -> identical output.
  for (let i = 0; i < 5; i++) {
    const shuffled = all.map(x => ({ ...x, athletes: [...x.athletes].sort(() => Math.random() - 0.5) })).reverse();
    assert.deepEqual(key(buildCompletionCsvRows(shuffled)), sorted);
  }
});

test("refuses unverifiable data: unknown state, wrong/missing/extra requirements, duplicates, bad audience", () => {
  const bad: [string, CompletionCsvInput[]][] = [
    ["unknown state", [{ task: task("t", "T", "both"), athletes: [{ athlete: ath("a", "A"), entries: [e("athlete", "unknown"), e("parent", "complete")] }] }]],
    ["unrecognised state", [{ task: task("t", "T", "athlete"), athletes: [{ athlete: ath("a", "A"), entries: [e("athlete", "toString" as CompletionState)] }] }]],
    ["missing requirement", [{ task: task("t", "T", "both"), athletes: [{ athlete: ath("a", "A"), entries: [e("athlete", "complete")] }] }]],
    ["requirement not asked", [{ task: task("t", "T", "athlete"), athletes: [{ athlete: ath("a", "A"), entries: [e("parent", "complete")] }] }]],
    ["out of order", [{ task: task("t", "T", "both"), athletes: [{ athlete: ath("a", "A"), entries: [e("parent", "complete"), e("athlete", "complete")] }] }]],
    ["duplicate athlete", [{ task: task("t", "T", "athlete"), athletes: [{ athlete: ath("a", "A"), entries: [e("athlete", "complete")] }, { athlete: ath("a", "A"), entries: [e("athlete", "complete")] }] }]],
    ["duplicate task", [{ task: task("t", "T", "athlete"), athletes: [] }, { task: task("t", "T", "athlete"), athletes: [] }]],
    ["bad audience", [{ task: task("t", "T", "coach"), athletes: [] }]],
  ];
  for (const [label, input] of bad) {
    assert.throws(() => buildCompletionCsvRows(input), (err: unknown) => err instanceof CompletionCsvError && err.reason === "inconsistent", label);
  }
});

test("empty: no tasks or no athletes gives a header-only report", () => {
  for (const input of [[], [{ task: task("t", "T", "both"), athletes: [] }]]) {
    const csv = buildCompletionCsv(buildCompletionCsvRows(input));
    assert.equal(csv, BOM + COMPLETION_CSV_HEADERS.join(",") + "\r\n");
  }
});

test("size limit: a report over 4 MB is refused, not cut off", () => {
  const big = "x".repeat(200);
  const athletes = Array.from({ length: 25_000 }, (_, i) => ({ athlete: ath(`a${i}`, `${big} ${i}`), entries: [e("athlete", "outstanding")] as CompletionEntry[] }));
  const rows = buildCompletionCsvRows([{ task: task("t", "T", "athlete"), athletes }]);
  assert.throws(() => buildCompletionCsv(rows), (err: unknown) => err instanceof CompletionCsvError && err.reason === "too_large");
  assert.ok(MAX_COMPLETION_CSV_BYTES < 4.5 * 1024 * 1024);
  // Just under the limit is fine.
  assert.doesNotThrow(() => buildCompletionCsv(rows.slice(0, 1000)));
});

test("filenames: ASCII, descriptive, sanitised, truncated; team, task and date", () => {
  assert.equal(completionCsvFilename({ schoolName: "St. Mary's", sportName: "Track & Field", slug: "x", taskTitle: "Physical Forms / 2027!!", date: "2026-10-19" }),
    "st-mary-s-track-field-todo-physical-forms-2027-completion-2026-10-19.csv");
  assert.equal(completionCsvFilename({ schoolName: "Monroe Valley High School", sportName: "Track and Field", slug: "x", date: "2026-10-19" }),
    "monroe-valley-high-school-track-and-field-todo-all-tasks-completion-2026-10-19.csv");
  assert.equal(completionCsvFilename({ schoolName: null, sportName: null, slug: "monroe-valley-2027", taskTitle: "=cmd|calc", date: "2026-10-19" }),
    "monroe-valley-2027-todo-cmd-calc-completion-2026-10-19.csv");
  const long = completionCsvFilename({ slug: "s", taskTitle: "a".repeat(200), date: "2026-10-19" });
  assert.equal(long, `s-todo-${"a".repeat(60)}-completion-2026-10-19.csv`);
  assert.equal(completionCsvFilename({ slug: "s", taskTitle: "!!!", date: "2026-10-19" }), "s-todo-task-completion-2026-10-19.csv");
  assert.equal(completionCsvFilename({ slug: "", date: "bad\"; x" }), "team-todo-all-tasks-completion-undated.csv");
  for (const name of [long, completionCsvFilename({ schoolName: "Écoles \"Ü\"", sportName: "日本", slug: "s", taskTitle: "x\r\ny", date: "2026-10-19" })]) {
    assert.match(name, /^[a-z0-9-]+\.csv$/);
  }
});
