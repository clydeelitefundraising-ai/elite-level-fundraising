// Header mapping, field normalization, validation, and duplicate annotation
// for roster import candidates. Pure functions only — no network/DB access
// here, so the caller (the parse route) supplies existing-athlete data and
// this module never reaches outside the row data it's given.
//
// Reuses the exact same name-normalization and fuzzy-similarity logic
// createAthlete()/findPossibleDuplicates() already use, so an imported
// roster is judged by identical duplicate rules as the rest of admin tools.
import { normalizeName, nameSimilarity } from "../athletes.ts";

export type CandidateStatus = "ready" | "possible_duplicate" | "needs_review" | "invalid";

export type ExistingAthleteInfo = {
  id:                    string;
  name:                  string;
  class_year:            string | null;
  event:                 string | null;
  linked:                boolean;
  hasFundraisingHistory: boolean;
};

export type ImportCandidate = {
  rowNumber:          number; // 1-based, counting data rows only (header excluded)
  name:               string;
  class_year:         string;
  event:              string;
  status:             CandidateStatus;
  issues:             string[];
  existingMatch:      ExistingAthleteInfo | null;
  duplicateRowNumber: number | null;
};

export class NoNameColumnError extends Error {}

type ColumnMapping = {
  nameMode:       "single" | "last_first_single" | "first_last";
  nameCol:        number | null; // used for "single" / "last_first_single"
  firstCol:       number | null; // used for "first_last"
  lastCol:        number | null; // used for "first_last"
  classCol:       number | null;
  eventCol:       number | null;
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

const NAME_SINGLE_ALIASES = ["name", "athlete name", "student", "student name", "athlete"];
const NAME_LASTFIRST_ALIASES = ["last, first", "last,first", "lastname, firstname", "last name, first name"];
const FIRST_ALIASES = ["first name", "first"];
const LAST_ALIASES = ["last name", "last"];
const CLASS_ALIASES = ["class", "class year", "grade", "grade level", "graduation year", "year"];
const EVENT_ALIASES = ["event", "group", "position", "event group"];

function findCol(headers: string[], aliases: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    if (aliases.includes(normHeader(headers[i]))) return i;
  }
  return null;
}

// Throws NoNameColumnError when no recognizable name column (or first+last
// pair) exists — that's a structural problem with the file, not a per-row
// validation issue, so the caller should surface it as an upload-level error
// rather than producing hundreds of "Invalid" rows with blank names.
export function mapHeaders(headerRow: string[]): ColumnMapping {
  const lastFirstCol = findCol(headerRow, NAME_LASTFIRST_ALIASES);
  const singleCol    = lastFirstCol === null ? findCol(headerRow, NAME_SINGLE_ALIASES) : null;
  const firstCol     = findCol(headerRow, FIRST_ALIASES);
  const lastCol      = findCol(headerRow, LAST_ALIASES);
  const classCol      = findCol(headerRow, CLASS_ALIASES);
  const eventCol       = findCol(headerRow, EVENT_ALIASES);

  if (lastFirstCol !== null) {
    return { nameMode: "last_first_single", nameCol: lastFirstCol, firstCol: null, lastCol: null, classCol, eventCol };
  }
  if (singleCol !== null) {
    return { nameMode: "single", nameCol: singleCol, firstCol: null, lastCol: null, classCol, eventCol };
  }
  if (firstCol !== null && lastCol !== null) {
    return { nameMode: "first_last", nameCol: null, firstCol, lastCol, classCol, eventCol };
  }

  throw new NoNameColumnError(
    "Could not find a Name column. Expected a header like \"Name\", \"Athlete Name\", \"Student\", " +
    "\"Student Name\", \"Last, First\", or separate \"First Name\"/\"Last Name\" columns.",
  );
}

function extractName(cells: string[], mapping: ColumnMapping): string {
  if (mapping.nameMode === "first_last") {
    const first = (mapping.firstCol != null ? cells[mapping.firstCol] : "")?.trim() ?? "";
    const last  = (mapping.lastCol  != null ? cells[mapping.lastCol]  : "")?.trim() ?? "";
    return [first, last].filter(Boolean).join(" ");
  }
  const raw = (mapping.nameCol != null ? cells[mapping.nameCol] : "")?.trim() ?? "";
  if (mapping.nameMode === "last_first_single") {
    const commaIdx = raw.indexOf(",");
    if (commaIdx === -1) return raw; // not actually "Last, First" shaped — pass through rather than guess
    const last  = raw.slice(0, commaIdx).trim();
    const first = raw.slice(commaIdx + 1).trim();
    return [first, last].filter(Boolean).join(" ");
  }
  return raw;
}

const CANONICAL_CLASSES = ["Freshman", "Sophomore", "Junior", "Senior"] as const;

// Same four labels CampaignControlCenter.tsx's ATHLETE_CLASS_OPTIONS already
// uses — numeric US grade levels and the standard FR/SO/JR/SR abbreviations
// map onto them deterministically (this is fixed, universal terminology, not
// a guess). A 4-digit year is deliberately NOT reinterpreted as a class
// standing — ELF's class_year field means grade level, not graduation year,
// and converting one to the other requires knowing "what grade is a 2027
// grad in *this* school year," which is ambiguous and must go to the admin
// instead of being silently assumed.
const CLASS_ABBREVIATION_MAP: Record<string, typeof CANONICAL_CLASSES[number]> = {
  "9": "Freshman", "09": "Freshman", "9th": "Freshman", "9th grade": "Freshman", "grade 9": "Freshman", "fr": "Freshman",
  "10": "Sophomore", "10th": "Sophomore", "10th grade": "Sophomore", "grade 10": "Sophomore", "so": "Sophomore",
  "11": "Junior", "11th": "Junior", "11th grade": "Junior", "grade 11": "Junior", "jr": "Junior",
  "12": "Senior", "12th": "Senior", "12th grade": "Senior", "grade 12": "Senior", "sr": "Senior",
};

// "RS FR"/"RS SO"/"RS JR"/"RS SR" — a common college/HS roster convention for
// a redshirt athlete. The redshirt designation is meaningful source
// information (it's not the same thing as the grade alone), and ELF's
// class_year is a free-text column with no enum constraint at the write
// contract (POST /api/admin/athletes only requires it non-empty) — so it can
// hold "RS Freshman" losslessly. Rather than guess whether the admin wants
// the RS marker kept or dropped, this expands the abbreviation but keeps the
// prefix and flags the row for review, so the admin decides.
const REDSHIRT_RE = /^rs\s+(fr|so|jr|sr)$/;

const GRAD_YEAR_RE = /^(19|20)\d{2}$/;

function normalizeClass(raw: string): { value: string; issue: string | null } {
  const trimmed = raw.trim();
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");

  const canonical = (CANONICAL_CLASSES as readonly string[]).find(c => c.toLowerCase() === key);
  if (canonical) return { value: canonical, issue: null };

  const mapped = CLASS_ABBREVIATION_MAP[key];
  if (mapped) return { value: mapped, issue: null };

  const redshirt = key.match(REDSHIRT_RE);
  if (redshirt) {
    const expanded = CLASS_ABBREVIATION_MAP[redshirt[1]];
    return {
      value: `RS ${expanded}`,
      issue: `Class value "${trimmed}" is a redshirt designation — please confirm class placement.`,
    };
  }

  if (GRAD_YEAR_RE.test(trimmed)) {
    return { value: trimmed, issue: `Class value "${trimmed}" looks like a graduation year, not a grade — please confirm.` };
  }

  return { value: trimmed, issue: `Class value "${trimmed}" doesn't match Freshman/Sophomore/Junior/Senior — please confirm.` };
}

export function buildCandidates(dataRows: string[][], mapping: ColumnMapping): ImportCandidate[] {
  return dataRows.map((cells, idx): ImportCandidate => {
    const rowNumber = idx + 1;
    const name  = extractName(cells, mapping);
    const event = ((mapping.eventCol != null ? cells[mapping.eventCol] : "") ?? "").trim();

    const issues: string[] = [];
    let status: CandidateStatus = "ready";
    let classValue = "";

    if (!name) { issues.push("Name is required."); status = "invalid"; }

    if (mapping.classCol === null) {
      issues.push("No Class/Grade column found in file.");
      status = "invalid";
    } else {
      const rawClass = (cells[mapping.classCol] ?? "").trim();
      if (!rawClass) {
        issues.push("Class is required.");
        status = "invalid";
      } else {
        const norm = normalizeClass(rawClass);
        classValue = norm.value;
        if (norm.issue) {
          issues.push(norm.issue);
          if (status !== "invalid") status = "needs_review";
        }
      }
    }

    return { rowNumber, name, class_year: classValue, event, status, issues, existingMatch: null, duplicateRowNumber: null };
  });
}

// Duplicate detection: exact match (same normalization as createAthlete's
// collision check) first against earlier rows in this same upload, then
// against existing campaign athletes; fuzzy match (same 0.6–1.0 band as
// findPossibleDuplicates) only against existing campaign athletes. Never
// changes an already-"invalid" row, and never clears a "needs_review" class
// warning — duplicate status simply takes precedence when both apply.
export function annotateDuplicates(
  candidates: ImportCandidate[],
  existing: ExistingAthleteInfo[],
): ImportCandidate[] {
  const seenAt = new Map<string, number>(); // normalized name -> index of first non-invalid occurrence

  return candidates.map((c, idx) => {
    if (c.status === "invalid") return c;
    const normalized = normalizeName(c.name);

    const firstIdx = seenAt.get(normalized);
    if (firstIdx !== undefined) {
      return {
        ...c,
        status: "possible_duplicate",
        duplicateRowNumber: candidates[firstIdx].rowNumber,
        issues: [...c.issues, `Same name as row ${candidates[firstIdx].rowNumber} in this file.`],
      };
    }
    seenAt.set(normalized, idx);

    const exact = existing.find(a => normalizeName(a.name) === normalized);
    if (exact) {
      return {
        ...c,
        status: "possible_duplicate",
        existingMatch: exact,
        issues: [...c.issues, `Matches existing athlete "${exact.name}" already on this roster.`],
      };
    }

    let bestMatch: ExistingAthleteInfo | null = null;
    let bestScore = 0;
    for (const a of existing) {
      const score = nameSimilarity(normalized, normalizeName(a.name));
      if (score >= 0.6 && score < 1 && score > bestScore) { bestScore = score; bestMatch = a; }
    }
    if (bestMatch) {
      return {
        ...c,
        status: "possible_duplicate",
        existingMatch: bestMatch,
        issues: [...c.issues, `Similar to existing athlete "${bestMatch.name}" — please confirm this is a different person.`],
      };
    }

    return c;
  });
}
