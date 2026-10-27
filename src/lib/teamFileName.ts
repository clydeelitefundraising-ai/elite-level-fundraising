// Team file names (team_files) — keeps a document's file extension in step
// with its validated type, so phones and computers know what it is.
//
// Root cause this fixes: Rename could save a name without its extension
// ("All Around Schedule" for a PDF). Downloads then handed iOS a file with
// no extension, which it can only show as generic "data". The stored type
// is the source of truth — only the five upload types allowed by
// teamFileUpload.ts — never an extension typed by a user. Pure and
// dependency-free: shared by the download helper (browser), the download
// route and the rename route (server).

// Upload allowlist (teamFileUpload.ts TEAM_FILES_ALLOWED_MIME) → the
// extensions accepted for it; the first is the one added when missing.
const EXTENSIONS_BY_MIME: Record<string, readonly string[]> = {
  "application/pdf": ["pdf"],
  "image/png":       ["png"],
  "image/jpeg":      ["jpg", "jpeg"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
};

// Extensions treated as a (wrong) document extension to replace, rather
// than ordinary text to keep: "Schedule.docx" for a PDF → "Schedule.pdf",
// but "Schedule v2.1" for a PDF → "Schedule v2.1.pdf".
const KNOWN_EXTENSIONS = new Set(Object.values(EXTENSIONS_BY_MIME).flat());

/** "application/pdf; charset=binary" → "application/pdf". */
export function normalizeMimeType(mimeType: string | null | undefined): string {
  return (mimeType ?? "").split(";")[0].trim().toLowerCase();
}

/** The extension (no dot) for an allowed team-file type, or null for any
 *  other type (CSV exports etc. are left alone). */
export function teamFileExtensionForMime(mimeType: string | null | undefined): string | null {
  return EXTENSIONS_BY_MIME[normalizeMimeType(mimeType)]?.[0] ?? null;
}

/** `name` with the right extension for `mimeType`:
 *  - already correct (any case, "jpeg" or "jpg") → unchanged;
 *  - missing → added;
 *  - another document extension (.pdf/.png/.jpg/.jpeg/.doc/.docx) → replaced.
 *  Unknown types and empty names are returned unchanged. */
export function withTeamFileExtension(name: string, mimeType: string | null | undefined): string {
  const accepted = EXTENSIONS_BY_MIME[normalizeMimeType(mimeType)];
  const trimmed = name.trim().replace(/[.\s]+$/, "");
  if (!accepted || !trimmed) return name;
  const dot = trimmed.lastIndexOf(".");
  const current = dot > 0 ? trimmed.slice(dot + 1).toLowerCase() : "";
  if (accepted.includes(current)) return trimmed;
  const base = KNOWN_EXTENSIONS.has(current) ? trimmed.slice(0, dot) : trimmed;
  return `${base}.${accepted[0]}`;
}

/** The validated type of a stored team file, from its team_files row:
 *  file_type ("pdf" | "image" | "doc") narrowed by the extension of its
 *  server-generated storage_path (png vs jpg, doc vs docx). Null when the
 *  two don't agree — callers then leave the name as it is. */
export function teamFileMimeFromRow(fileType: string, storagePath: string): string | null {
  const ext = (storagePath.split(".").pop() ?? "").toLowerCase();
  if (fileType === "pdf") return "application/pdf";
  if (fileType === "image") {
    if (ext === "png") return "image/png";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    return null;
  }
  if (fileType === "doc") {
    if (ext === "doc") return "application/msword";
    if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return null;
  }
  return null;
}

/** Content-Disposition value for a download. `filename*` carries the exact
 *  UTF-8 name (spaces as %20 — "+" would be read literally); the plain
 *  `filename` is an ASCII-only fallback. Neither can contain a quote,
 *  backslash or line break, so the header can't be broken out of. */
export function teamFileContentDisposition(name: string, disposition: "inline" | "attachment"): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
