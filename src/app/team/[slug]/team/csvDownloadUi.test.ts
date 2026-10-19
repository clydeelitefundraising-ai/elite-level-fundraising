// Phase 4-2 — CSV download buttons on the coach completion dashboard.
// Source scans (like completionDashboard.test.ts); behaviour of the
// download module is in reportDownload.test.ts, the APIs in
// api/team/[slug]/todo/completion/completion.route.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const view = src("./TaskCompletionView.tsx");
const button = src("./ReportDownloadButton.tsx");
const todo = src("./TodoListView.tsx");
const has = (hay: string, needle: string) => assert.ok(hay.includes(needle), needle);

const summary = view.slice(view.indexOf("export function CompletionSummaryView"), view.indexOf("// ── One task"));
const taskView = view.slice(view.indexOf("export function TaskCompletionDetailView"));

test("visibility: the dashboard (and so the buttons) is coach-only; the export APIs enforce it too", () => {
  has(todo, `const completionOpen = showTasks && isCoachView && data.available && viewParam === "completion";`);
  // Buttons only ever render inside the two completion views.
  assert.equal(view.match(/<ReportDownloadButton/g)?.length, 2);
  assert.doesNotMatch(todo, /ReportDownloadButton|\/export/);
});

test("team summary: Download All Tasks CSV only once loaded and when there are active tasks", () => {
  assert.match(summary, /actions=\{state\.kind === "ready" && state\.value\.tasks\.length > 0 \? \(\s*<ReportDownloadButton\s*url=\{`\/api\/team\/\$\{slug\}\/todo\/completion\/export`\}\s*label="Download All Tasks CSV"/);
});

test("one task: Download CSV only once that task has loaded (never for archived, missing or failed)", () => {
  assert.match(taskView, /actions=\{state\.kind === "ready" \? \(\s*<ReportDownloadButton\s*url=\{`\/api\/team\/\$\{slug\}\/todo\/completion\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/export`\}\s*label="Download CSV"/);
  // Archived/missing tasks are error states (409/404) — no "ready", so no button.
  has(view, `409: "This task was archived, so it's no longer a current requirement."`);
});

test("filters never reach the export: fixed URLs with no grade/search/status; note shown", () => {
  for (const url of view.match(/url=\{`[^`]*`\}/g) ?? []) {
    assert.doesNotMatch(url, /\?|grade|filter|search|activeGrade/, url);
  }
  has(button, `export const ALL_ATHLETES_NOTE = "Includes all athletes, not just the filtered view.";`);
  assert.match(button, /\{ALL_ATHLETES_NOTE\}/);
});

test("next to Refresh, in the header's action row", () => {
  assert.match(view, /\{actions && \(\s*<div[^>]*flexWrap: "wrap"[^>]*>\s*\{actions\}\s*\{onRefresh && \(\s*<button[^>]*>Refresh<\/button>/);
  has(view, "{onRefresh && !actions && ("); // views without a download keep Refresh where it was
});

test("loading, error, ready and double-tap states", () => {
  // One report at a time: repeated taps while preparing do nothing.
  assert.match(button, /const run = async \(task: \(\) => Promise<void>\) => \{\s*if \(busy\.current\) return;[\s\S]*?busy\.current = true;[\s\S]*?finally \{\s*busy\.current = false;/);
  assert.match(button, /disabled=\{preparing\}\s*aria-busy=\{preparing\}/);
  has(button, `{preparing ? "Preparing CSV…" : label}`);
  assert.match(button, /state\.kind === "error" && \(\s*<p role="alert"[^>]*>\{state\.message\}<\/p>/);
  // Errors are plain messages; anything unexpected gets a generic one.
  has(button, `message: err instanceof ReportDownloadError ? err.message : REPORT_MESSAGES.unexpected`);
});

test("iOS second tap: the finished file is kept and offered as 'Report ready — Save CSV'", () => {
  assert.match(button, /if \(result === "needs_tap"\) \{\s*update\(\{ kind: "ready", file, message: secondTap \? REPORT_MESSAGES\.stillNeedsTap : undefined \}\);/);
  assert.match(button, /state\.kind === "ready" \? \(\s*<button type="button" onClick=\{\(\) => saveReady\(state\.file\)\}[\s\S]*?Report ready — Save CSV/);
  has(button, `const saveReady = (file: File) => run(() => deliver(file, true));`);
});

test("resources: the file is dropped once delivered or the view closes; no state updates after unmount", () => {
  assert.match(button, /\} else \{\s*update\(\{ kind: "idle" \}\); \/\/ delivered/);
  assert.match(button, /return \(\) => \{ mounted\.current = false; \};/);
  assert.match(button, /const update = \(next: State\) => \{ if \(mounted\.current\) setState\(next\); \};/);
  // Desktop downloads release their object URL (reportDownload.ts).
  has(src("./reportDownload.ts"), "setTimeout(() => URL.revokeObjectURL(url), 2000);");
});

test("existing downloads untouched: shareFileOrFallback / downloadViaFetch unchanged; new helper is separate", () => {
  const share = src("../_components/nativeFileShare.ts");
  has(share, "export async function shareFileOrFallback(file: File, fallback: () => void): Promise<void> {");
  has(share, "export async function shareFileWithOutcome(file: File): Promise<ShareOutcome> {");
  const code = src("./reportDownload.ts").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /downloadViaFetch|shareFileOrFallback/);
});
