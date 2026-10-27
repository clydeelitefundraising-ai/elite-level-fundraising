// Team file names keep their extension (teamFileName.ts) — the iPhone
// "Type: data" To-Do attachment bug: a PDF renamed to "All Around Schedule"
// downloaded with no extension, so iOS couldn't tell what it was. Pure
// helper tests plus structural checks on the three places that use it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeMimeType,
  teamFileContentDisposition,
  teamFileExtensionForMime,
  teamFileMimeFromRow,
  withTeamFileExtension,
} from "./teamFileName.ts";
import { TEAM_FILES_ALLOWED_MIME } from "./teamFileUpload.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const route        = read("../app/api/team/[slug]/files/[id]/route.ts");
const fileDownload = read("../app/team/[slug]/_components/fileDownload.ts");
const filesView    = read("../app/team/[slug]/files/FilesView.tsx");

const PDF  = "application/pdf";
const PNG  = "image/png";
const JPEG = "image/jpeg";
const DOC  = "application/msword";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ── The reported bug ──────────────────────────────────────────────────────

test("the reported file: a PDF renamed to 'All Around Schedule' downloads as 'All Around Schedule.pdf'", () => {
  assert.equal(withTeamFileExtension("All Around Schedule", PDF), "All Around Schedule.pdf");
  assert.equal(withTeamFileExtension("All Around Schedule", teamFileMimeFromRow("pdf", "team-x/1730000000000-abc123.pdf")), "All Around Schedule.pdf");
});

// ── Missing extensions, every allowed type ────────────────────────────────

test("missing extension is added for PDF, PNG, JPEG, DOC and DOCX", () => {
  assert.equal(withTeamFileExtension("Schedule", PDF), "Schedule.pdf");
  assert.equal(withTeamFileExtension("Team Photo", PNG), "Team Photo.png");
  assert.equal(withTeamFileExtension("Team Photo", JPEG), "Team Photo.jpg");
  assert.equal(withTeamFileExtension("Permission Slip", DOC), "Permission Slip.doc");
  assert.equal(withTeamFileExtension("Permission Slip", DOCX), "Permission Slip.docx");
});

test("every upload-allowed type has an extension (stays in step with teamFileUpload.ts)", () => {
  for (const mime of Object.keys(TEAM_FILES_ALLOWED_MIME)) {
    assert.ok(teamFileExtensionForMime(mime), mime);
  }
});

// ── Existing valid names are untouched ────────────────────────────────────

test("names that already have the right extension are unchanged, in any case", () => {
  for (const [name, mime] of [
    ["Schedule.pdf", PDF], ["SCHEDULE.PDF", PDF], ["photo.png", PNG], ["photo.jpg", JPEG], ["photo.JPEG", JPEG],
    ["Form.doc", DOC], ["Form.docx", DOCX], ["Spring 2027 Meet Schedule (final).pdf", PDF],
  ] as const) {
    assert.equal(withTeamFileExtension(name, mime), name);
  }
});

// ── Incorrect extensions ──────────────────────────────────────────────────

test("a wrong document extension is replaced, not stacked", () => {
  assert.equal(withTeamFileExtension("Schedule.docx", PDF), "Schedule.pdf");
  assert.equal(withTeamFileExtension("Schedule.pdf", DOCX), "Schedule.docx");
  assert.equal(withTeamFileExtension("photo.png", JPEG), "photo.jpg");
  assert.equal(withTeamFileExtension("photo.jpeg", PNG), "photo.png");
  assert.equal(withTeamFileExtension("Form.doc", DOCX), "Form.docx");
});

test("a dot that isn't a document extension is kept and the right one added", () => {
  assert.equal(withTeamFileExtension("Schedule v2.1", PDF), "Schedule v2.1.pdf");
  assert.equal(withTeamFileExtension("St. Mary's Invite", PDF), "St. Mary's Invite.pdf");
  assert.equal(withTeamFileExtension("report.final", DOCX), "report.final.docx");
});

test("trailing dots and spaces are trimmed before the extension is added", () => {
  assert.equal(withTeamFileExtension("Schedule.", PDF), "Schedule.pdf");
  assert.equal(withTeamFileExtension("  Schedule  ", PDF), "Schedule.pdf");
});

// ── Spaces and header safety ──────────────────────────────────────────────

test("Content-Disposition: spaces are %20 in filename* (never '+'), and kept in the plain filename", () => {
  const header = teamFileContentDisposition("All Around Schedule.pdf", "attachment");
  assert.equal(header, `attachment; filename="All Around Schedule.pdf"; filename*=UTF-8''All%20Around%20Schedule.pdf`);
  assert.ok(!header.includes("+"));
  assert.match(teamFileContentDisposition("A B.pdf", "inline"), /^inline; /);
});

test("Content-Disposition: quotes, backslashes, line breaks and non-ASCII can't break the header", () => {
  const header = teamFileContentDisposition('Bad"\\\r\nname é.pdf', "attachment");
  assert.ok(!/[\r\n]/.test(header));
  const plain = header.match(/filename="([^"]*)"/)![1];
  assert.equal(plain, "Bad____name _.pdf");
  assert.match(header, /filename\*=UTF-8''Bad%22%5C%0D%0Aname%20%C3%A9\.pdf$/);
  assert.match(teamFileContentDisposition("Coach's (copy).pdf", "attachment"), /filename\*=UTF-8''Coach%27s%20%28copy%29\.pdf$/);
});

// ── Unknown / other types are left alone ──────────────────────────────────

test("types outside the upload allowlist are never renamed (CSV exports, unknown)", () => {
  assert.equal(withTeamFileExtension("roster", "text/csv"), "roster");
  assert.equal(withTeamFileExtension("roster.csv", "text/csv; charset=utf-8"), "roster.csv");
  assert.equal(withTeamFileExtension("page", "text/html"), "page");
  assert.equal(withTeamFileExtension("file", ""), "file");
  assert.equal(withTeamFileExtension("file", null), "file");
  assert.equal(withTeamFileExtension("", PDF), "");
});

test("MIME types are matched case-insensitively and without parameters", () => {
  assert.equal(normalizeMimeType("Application/PDF; charset=binary"), "application/pdf");
  assert.equal(withTeamFileExtension("Schedule", "Application/PDF; charset=binary"), "Schedule.pdf");
});

// ── Type from the stored row (rename route) ───────────────────────────────

test("stored row → type: file_type narrowed by the server-generated storage path", () => {
  assert.equal(teamFileMimeFromRow("pdf", "s/1-a.pdf"), PDF);
  assert.equal(teamFileMimeFromRow("pdf", "s/1-a.scan"), PDF, "a PDF is a PDF whatever its path");
  assert.equal(teamFileMimeFromRow("image", "s/1-a.png"), PNG);
  assert.equal(teamFileMimeFromRow("image", "s/1-a.JPEG"), JPEG);
  assert.equal(teamFileMimeFromRow("image", "s/1-a.jpg"), JPEG);
  assert.equal(teamFileMimeFromRow("doc", "s/1-a.doc"), DOC);
  assert.equal(teamFileMimeFromRow("doc", "s/1-a.docx"), DOCX);
  assert.equal(teamFileMimeFromRow("image", "s/1-a.bin"), null, "ambiguous → leave the name alone");
  assert.equal(teamFileMimeFromRow("doc", "s/1-a"), null);
  assert.equal(teamFileMimeFromRow("video", "s/1-a.mp4"), null);
});

// ── Download route (files/[id]/route.ts GET) ──────────────────────────────

test("download route: filename gets the type's extension; stored name is not changed", () => {
  assert.match(route, /select=storage_path,name,file_type&limit=1/);
  assert.match(route, /const fileMime = teamFileExtensionForMime\(contentType\) \? contentType : teamFileMimeFromRow\(file_type, storage_path\);/);
  assert.match(route, /const filename = withTeamFileExtension\(name, fileMime\);/);
  assert.match(route, /"Content-Disposition":\s+teamFileContentDisposition\(filename, disposition\)/);
  assert.ok(!route.includes('replace(/%20/g, "+")'), "no '+' for spaces");
});

test("download route: nosniff added; content type, caching and inline/attachment unchanged", () => {
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.match(route, /"Content-Type":\s+contentType/);
  assert.match(route, /"Cache-Control":\s+"private, max-age=1800"/);
  assert.match(route, /const disposition = inline \? "inline" : "attachment";/);
});

test("download route: authorization and team scoping unchanged", () => {
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function PUT"));
  assert.match(get, /if \(actor\.kind === "public"\) \{\s+return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);/);
  assert.match(get, /team_files\?id=eq\.\$\{encodeURIComponent\(id\)\}&campaign_slug=eq\.\$\{encodeURIComponent\(slug\)\}/);
});

// ── Rename route (files/[id]/route.ts PUT) ────────────────────────────────

test("rename route: keeps the file's own extension, from its stored type", () => {
  const put = route.slice(route.indexOf("export async function PUT"), route.indexOf("export async function DELETE"));
  assert.match(put, /select=storage_path,file_type&limit=1/);
  assert.match(put, /const finalName = withTeamFileExtension\(name\.trim\(\), teamFileMimeFromRow\(rows\[0\]\.file_type, rows\[0\]\.storage_path\)\);/);
  assert.match(put, /body: JSON\.stringify\(\{ name: finalName \}\)/);
  assert.match(put, /return NextResponse\.json\(\{ ok: true, name: finalName \}\);/);
  assert.match(put, /if \(!rows\.length\) return NextResponse\.json\(\{ error: "File not found\." \}, \{ status: 404 \}\);/);
});

test("rename route: staff-only, season-locked and team-scoped as before", () => {
  const put = route.slice(route.indexOf("export async function PUT"), route.indexOf("export async function DELETE"));
  assert.match(put, /const seasonBlocked = await seasonWriteBlocked\(slug\);/);
  assert.match(put, /if \(!isStaff\(actor\)\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);/);
  assert.equal((put.match(/&campaign_slug=eq\.\$\{encodeURIComponent\(slug\)\}/g) ?? []).length, 2, "lookup and update both scoped to this team");
});

test("Files page shows the name the server saved after a rename", () => {
  assert.match(filesView, /name: data\.name \?\? editName\.trim\(\)/);
});

// ── Download helper (To-Do, Files) ────────────────────────────────────────

test("download helper: the shared file is named with the response type's extension", () => {
  assert.match(fileDownload, /import \{ withTeamFileExtension \} from "@\/lib\/teamFileName";/);
  assert.match(fileDownload, /const finalName = withTeamFileExtension\(filenameHint \?\? filename \?\? "download", blob\.type\);/);
  assert.match(fileDownload, /new File\(\[blob\], finalName, \{ type: blob\.type \|\| "application\/octet-stream" \}\)/);
});
