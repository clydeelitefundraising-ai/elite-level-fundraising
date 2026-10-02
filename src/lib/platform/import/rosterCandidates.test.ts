import test from "node:test";
import assert from "node:assert/strict";
import { mapHeaders, buildCandidates, annotateDuplicates, NoNameColumnError, type ExistingAthleteInfo } from "./rosterCandidates.ts";
import { parseCsv } from "./csvParse.ts";

const REAL_ROSTER_CSV =
  "Gender,Athlete,Event Group,Year,Source\n" +
  "Women,Nicole Alfred,Distance,FR,https://example.com\n" +
  "Women,Santia Ali,Jumps,FR,https://example.com\n" +
  "Women,Camryn Alo,Throws,JR,https://example.com\n" +
  "Women,Makayla Anderson,Distance,RS SO,https://example.com";

function existing(partial: Partial<ExistingAthleteInfo> & Pick<ExistingAthleteInfo, "id" | "name">): ExistingAthleteInfo {
  return { class_year: null, event: null, linked: false, hasFundraisingHistory: false, ...partial };
}

// ── Header mapping / aliases ─────────────────────────────────────────────

test("mapHeaders: plain Name/Class/Event header row", () => {
  const mapping = mapHeaders(["Name", "Class", "Event"]);
  const [c] = buildCandidates([["Mason Brooks", "Freshman", "Sprints"]], mapping);
  assert.equal(c.name, "Mason Brooks");
  assert.equal(c.class_year, "Freshman");
  assert.equal(c.event, "Sprints");
  assert.equal(c.status, "ready");
});

test("mapHeaders: First Name + Last Name columns are concatenated", () => {
  const mapping = mapHeaders(["First Name", "Last Name", "Grade"]);
  const [c] = buildCandidates([["Mason", "Brooks", "9"]], mapping);
  assert.equal(c.name, "Mason Brooks");
  assert.equal(c.class_year, "Freshman");
});

test("mapHeaders: 'Last, First' single column is reordered into 'First Last'", () => {
  const mapping = mapHeaders(["Last, First", "Grade Level"]);
  const [c] = buildCandidates([["Brooks, Mason", "10"]], mapping);
  assert.equal(c.name, "Mason Brooks");
  assert.equal(c.class_year, "Sophomore");
});

test("mapHeaders: a 'Last, First' value with no comma passes through unchanged rather than guessing", () => {
  const mapping = mapHeaders(["Last, First", "Grade"]);
  const [c] = buildCandidates([["Mason Brooks", "11"]], mapping);
  assert.equal(c.name, "Mason Brooks");
});

test("mapHeaders: Student / Student Name / Athlete Name aliases all map to name", () => {
  for (const header of ["Student", "Student Name", "Athlete Name"]) {
    const mapping = mapHeaders([header, "Class"]);
    const [c] = buildCandidates([["Abby Cooper", "Junior"]], mapping);
    assert.equal(c.name, "Abby Cooper");
  }
});

test("mapHeaders: Class/Class Year/Grade/Grade Level/Graduation Year all map to class", () => {
  for (const header of ["Class", "Class Year", "Grade", "Grade Level", "Graduation Year"]) {
    const mapping = mapHeaders(["Name", header]);
    const [c] = buildCandidates([["Abby Cooper", "Senior"]], mapping);
    assert.equal(c.class_year, "Senior");
  }
});

test("mapHeaders: Event/Group/Position all map to event", () => {
  for (const header of ["Event", "Group", "Position"]) {
    const mapping = mapHeaders(["Name", "Class", header]);
    const [c] = buildCandidates([["Abby Cooper", "Senior", "Discus"]], mapping);
    assert.equal(c.event, "Discus");
  }
});

test("mapHeaders: header matching is case-insensitive and whitespace-normalized", () => {
  const mapping = mapHeaders(["  name  ", "CLASS YEAR"]);
  const [c] = buildCandidates([["Abby Cooper", "Senior"]], mapping);
  assert.equal(c.name, "Abby Cooper");
  assert.equal(c.class_year, "Senior");
});

test("mapHeaders: throws NoNameColumnError when no name column exists", () => {
  assert.throws(() => mapHeaders(["Class", "Event"]), NoNameColumnError);
});

// ── Phase 1 compatibility patch: "Athlete" / "Event Group" / "Year" aliases ──

test("mapHeaders: 'Athlete' is a recognized name alias, identical to Name/Athlete Name/Student/Student Name", () => {
  const mapping = mapHeaders(["Athlete", "Year", "Event Group"]);
  const [c] = buildCandidates([["Mason Brooks", "FR", "Sprints"]], mapping);
  assert.equal(c.name, "Mason Brooks");
});

test("mapHeaders: 'Event Group' is a recognized event alias, identical to Event/Group/Position", () => {
  const mapping = mapHeaders(["Name", "Class", "Event Group"]);
  const [c] = buildCandidates([["Mason Brooks", "Freshman", "Distance"]], mapping);
  assert.equal(c.event, "Distance");
});

test("mapHeaders: 'Year' is a recognized class alias", () => {
  const mapping = mapHeaders(["Name", "Year"]);
  const [c] = buildCandidates([["Mason Brooks", "FR"]], mapping);
  assert.equal(c.class_year, "Freshman");
});

// ── FR/SO/JR/SR abbreviation normalization ───────────────────────────────

test("buildCandidates: FR/SO/JR/SR abbreviations normalize deterministically to Freshman..Senior", () => {
  const mapping = mapHeaders(["Name", "Year"]);
  const rows = [["A", "FR"], ["B", "SO"], ["C", "JR"], ["D", "SR"]];
  const candidates = buildCandidates(rows, mapping);
  assert.deepEqual(candidates.map(c => c.class_year), ["Freshman", "Sophomore", "Junior", "Senior"]);
  assert.ok(candidates.every(c => c.status === "ready"));
});

test("buildCandidates: abbreviation matching is case-insensitive and whitespace-normalized", () => {
  const mapping = mapHeaders(["Name", "Year"]);
  const [c] = buildCandidates([["Mason Brooks", "  fr "]], mapping);
  assert.equal(c.class_year, "Freshman");
  assert.equal(c.status, "ready");
});

// ── Redshirt variants: expanded but flagged, never silently collapsed ────

test("buildCandidates: 'RS SO' expands the grade but keeps the RS marker, and is flagged Needs Review", () => {
  const mapping = mapHeaders(["Name", "Year"]);
  const [c] = buildCandidates([["Makayla Anderson", "RS SO"]], mapping);
  assert.equal(c.class_year, "RS Sophomore", "the redshirt designation must not be silently dropped");
  assert.equal(c.status, "needs_review");
  assert.ok(c.issues.some(i => i.includes("redshirt")));
});

test("buildCandidates: all four redshirt variants (RS FR/SO/JR/SR) expand correctly", () => {
  const mapping = mapHeaders(["Name", "Year"]);
  const rows = [["A", "RS FR"], ["B", "RS SO"], ["C", "RS JR"], ["D", "RS SR"]];
  const candidates = buildCandidates(rows, mapping);
  assert.deepEqual(candidates.map(c => c.class_year), ["RS Freshman", "RS Sophomore", "RS Junior", "RS Senior"]);
  assert.ok(candidates.every(c => c.status === "needs_review"));
});

test("buildCandidates: redshirt matching is case-insensitive and whitespace-tolerant", () => {
  const mapping = mapHeaders(["Name", "Year"]);
  const [c] = buildCandidates([["Makayla Anderson", "  rs   so  "]], mapping);
  assert.equal(c.class_year, "RS Sophomore");
  assert.equal(c.status, "needs_review");
});

// ── End-to-end: the exact production roster shape that was rejected ─────

test("real-world roster shape: Gender/Athlete/Event Group/Year/Source header row imports correctly, unrelated columns ignored", () => {
  const mapping = mapHeaders(["Gender", "Athlete", "Event Group", "Year", "Source"]);
  const rows = [
    ["Women", "Nicole Alfred",    "Distance", "FR",    "https://example.com"],
    ["Women", "Santia Ali",       "Jumps",    "FR",    "https://example.com"],
    ["Women", "Camryn Alo",       "Throws",   "JR",    "https://example.com"],
    ["Women", "Makayla Anderson", "Distance", "RS SO", "https://example.com"],
  ];
  const candidates = buildCandidates(rows, mapping);

  assert.equal(candidates[0].name, "Nicole Alfred");
  assert.equal(candidates[0].event, "Distance");
  assert.equal(candidates[0].class_year, "Freshman");
  assert.equal(candidates[0].status, "ready");

  assert.equal(candidates[1].class_year, "Freshman");
  assert.equal(candidates[2].class_year, "Junior");

  assert.equal(candidates[3].name, "Makayla Anderson");
  assert.equal(candidates[3].event, "Distance");
  assert.equal(candidates[3].class_year, "RS Sophomore");
  assert.equal(candidates[3].status, "needs_review");

  // "Gender" and "Source" have no alias match and must never surface as
  // name/class/event — confirmed structurally: nothing in this candidate
  // set can originate from columns 0 or 4.
  for (const c of candidates) {
    assert.notEqual(c.name, "Women");
    assert.notEqual(c.class_year, "https://example.com");
    assert.notEqual(c.event, "https://example.com");
  }
});

test("real-world roster shape, CSV-derived: parseCsv -> mapHeaders -> buildCandidates end to end", () => {
  const rows = parseCsv(REAL_ROSTER_CSV);
  const [headerRow, ...dataRows] = rows;
  const mapping = mapHeaders(headerRow);
  const candidates = buildCandidates(dataRows, mapping);

  assert.equal(candidates.length, 4);
  assert.equal(candidates[0].name, "Nicole Alfred");
  assert.equal(candidates[0].class_year, "Freshman");
  assert.equal(candidates[0].event, "Distance");
  assert.equal(candidates[3].class_year, "RS Sophomore");
  assert.equal(candidates[3].status, "needs_review");
});

// ── Required-field validation ────────────────────────────────────────────

test("buildCandidates: a missing name is Invalid", () => {
  const mapping = mapHeaders(["Name", "Class"]);
  const [c] = buildCandidates([["", "Freshman"]], mapping);
  assert.equal(c.status, "invalid");
  assert.ok(c.issues.some(i => i.includes("Name")));
});

test("buildCandidates: a missing class is Invalid, never silently defaulted", () => {
  const mapping = mapHeaders(["Name", "Class"]);
  const [c] = buildCandidates([["Mason Brooks", ""]], mapping);
  assert.equal(c.status, "invalid");
  assert.equal(c.class_year, "");
});

test("buildCandidates: no Class column at all marks every row Invalid rather than guessing", () => {
  const mapping = mapHeaders(["Name"]);
  const [c] = buildCandidates([["Mason Brooks"]], mapping);
  assert.equal(c.status, "invalid");
});

test("buildCandidates: a blank Event is fine — Event is optional", () => {
  const mapping = mapHeaders(["Name", "Class", "Event"]);
  const [c] = buildCandidates([["Mason Brooks", "Freshman", ""]], mapping);
  assert.equal(c.status, "ready");
  assert.equal(c.event, "");
});

// ── Class normalization ──────────────────────────────────────────────────

test("buildCandidates: numeric grades 9/10/11/12 map deterministically to Freshman..Senior", () => {
  const mapping = mapHeaders(["Name", "Grade"]);
  const rows = [["A", "9"], ["B", "10"], ["C", "11"], ["D", "12"]];
  const candidates = buildCandidates(rows, mapping);
  assert.deepEqual(candidates.map(c => c.class_year), ["Freshman", "Sophomore", "Junior", "Senior"]);
  assert.ok(candidates.every(c => c.status === "ready"));
});

test("buildCandidates: a canonical class label already matches, case-insensitively", () => {
  const mapping = mapHeaders(["Name", "Class"]);
  const [c] = buildCandidates([["Mason Brooks", "freshman"]], mapping);
  assert.equal(c.class_year, "Freshman");
  assert.equal(c.status, "ready");
});

test("buildCandidates: a 4-digit graduation year is NOT reinterpreted as a class standing — flagged for review instead", () => {
  const mapping = mapHeaders(["Name", "Graduation Year"]);
  const [c] = buildCandidates([["Mason Brooks", "2027"]], mapping);
  assert.equal(c.class_year, "2027");
  assert.equal(c.status, "needs_review");
});

test("buildCandidates: an unrecognized class value is kept as-is and flagged, never guessed", () => {
  const mapping = mapHeaders(["Name", "Class"]);
  const [c] = buildCandidates([["Mason Brooks", "Varsity"]], mapping);
  assert.equal(c.class_year, "Varsity");
  assert.equal(c.status, "needs_review");
});

// ── Duplicate detection ───────────────────────────────────────────────────

test("annotateDuplicates: exact match against an existing campaign athlete", () => {
  const mapping = mapHeaders(["Name", "Class"]);
  const candidates = buildCandidates([["Mason Brooks", "Freshman"]], mapping);
  const result = annotateDuplicates(candidates, [existing({ id: "a1", name: "Mason Brooks" })]);
  assert.equal(result[0].status, "possible_duplicate");
  assert.equal(result[0].existingMatch?.id, "a1");
});

test("annotateDuplicates: capitalization/whitespace differences still count as an exact match", () => {
  const mapping = mapHeaders(["Name", "Class"]);
  const candidates = buildCandidates([["  mason   brooks ", "Freshman"]], mapping);
  const result = annotateDuplicates(candidates, [existing({ id: "a1", name: "Mason Brooks" })]);
  assert.equal(result[0].status, "possible_duplicate");
});

test("annotateDuplicates: a fuzzy near-match against an existing athlete is advisory, not exact", () => {
  const mapping = mapHeaders(["Name", "Class"]);
  const candidates = buildCandidates([["Mason Brook", "Freshman"]], mapping); // one letter off
  const result = annotateDuplicates(candidates, [existing({ id: "a1", name: "Mason Brooks" })]);
  assert.equal(result[0].status, "possible_duplicate");
  assert.equal(result[0].existingMatch?.id, "a1");
});

test("annotateDuplicates: a genuinely different name is never flagged", () => {
  const mapping = mapHeaders(["Name", "Class"]);
  const candidates = buildCandidates([["Zoe Washington", "Freshman"]], mapping);
  const result = annotateDuplicates(candidates, [existing({ id: "a1", name: "Mason Brooks" })]);
  assert.equal(result[0].status, "ready");
  assert.equal(result[0].existingMatch, null);
});

test("annotateDuplicates: two identical names within the same upload — the second is flagged against the first", () => {
  const mapping = mapHeaders(["Name", "Class"]);
  const candidates = buildCandidates([["Mason Brooks", "Freshman"], ["Mason Brooks", "Freshman"]], mapping);
  const result = annotateDuplicates(candidates, []);
  assert.equal(result[0].status, "ready");
  assert.equal(result[1].status, "possible_duplicate");
  assert.equal(result[1].duplicateRowNumber, 1);
});

test("annotateDuplicates: an Invalid row is never upgraded to possible_duplicate", () => {
  const mapping = mapHeaders(["Name", "Class"]);
  const candidates = buildCandidates([["", "Freshman"]], mapping);
  const result = annotateDuplicates(candidates, [existing({ id: "a1", name: "" })]);
  assert.equal(result[0].status, "invalid");
});

test("annotateDuplicates: surfaces linked/fundraising-history indicators without exposing account IDs", () => {
  const mapping = mapHeaders(["Name", "Class"]);
  const candidates = buildCandidates([["Mason Brooks", "Freshman"]], mapping);
  const result = annotateDuplicates(candidates, [
    existing({ id: "a1", name: "Mason Brooks", linked: true, hasFundraisingHistory: true }),
  ]);
  assert.equal(result[0].existingMatch?.linked, true);
  assert.equal(result[0].existingMatch?.hasFundraisingHistory, true);
  assert.ok(!("account_id" in (result[0].existingMatch as object)));
});
