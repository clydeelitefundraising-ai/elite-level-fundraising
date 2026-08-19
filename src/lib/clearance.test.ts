import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeClearanceUrl,
  validateClearanceInput,
  sortClearanceResources,
  ClearanceValidationError,
} from "./clearance.ts";

// ── normalizeClearanceUrl ─────────────────────────────────────────────────

test("normalizeClearanceUrl: accepts https URLs", () => {
  assert.equal(normalizeClearanceUrl("https://registermyathlete.com/x"), "https://registermyathlete.com/x");
});

test("normalizeClearanceUrl: accepts http URLs", () => {
  assert.equal(normalizeClearanceUrl("http://example.com"), "http://example.com/");
});

test("normalizeClearanceUrl: empty/null/undefined all normalize to null", () => {
  assert.equal(normalizeClearanceUrl(""), null);
  assert.equal(normalizeClearanceUrl("   "), null);
  assert.equal(normalizeClearanceUrl(null), null);
  assert.equal(normalizeClearanceUrl(undefined), null);
});

test("normalizeClearanceUrl: rejects javascript: scheme", () => {
  assert.throws(() => normalizeClearanceUrl("javascript:alert(1)"), ClearanceValidationError);
});

test("normalizeClearanceUrl: rejects data: scheme", () => {
  assert.throws(() => normalizeClearanceUrl("data:text/html,hi"), ClearanceValidationError);
});

test("normalizeClearanceUrl: rejects file: scheme", () => {
  assert.throws(() => normalizeClearanceUrl("file:///etc/passwd"), ClearanceValidationError);
});

test("normalizeClearanceUrl: rejects webcal: scheme", () => {
  assert.throws(() => normalizeClearanceUrl("webcal://example.com/cal.ics"), ClearanceValidationError);
});

test("normalizeClearanceUrl: rejects unparseable garbage", () => {
  assert.throws(() => normalizeClearanceUrl("not a url"), ClearanceValidationError);
});

// ── validateClearanceInput ────────────────────────────────────────────────

test("validateClearanceInput: title is required", () => {
  assert.throws(() => validateClearanceInput({ title: "", url: "https://example.com" }), ClearanceValidationError);
  assert.throws(() => validateClearanceInput({ title: "   ", url: "https://example.com" }), ClearanceValidationError);
});

test("validateClearanceInput: requires url or attachment_id", () => {
  assert.throws(() => validateClearanceInput({ title: "Physical Form" }), ClearanceValidationError);
});

test("validateClearanceInput: url-only is valid", () => {
  const v = validateClearanceInput({ title: "Register My Athlete", url: "https://registermyathlete.com" });
  assert.equal(v.url, "https://registermyathlete.com/");
  assert.equal(v.attachment_id, null);
});

test("validateClearanceInput: attachment-only is valid", () => {
  const v = validateClearanceInput({ title: "2027 Physical Form", attachment_id: "file-123" });
  assert.equal(v.url, null);
  assert.equal(v.attachment_id, "file-123");
});

test("validateClearanceInput: both url and attachment is valid", () => {
  const v = validateClearanceInput({ title: "Concussion Training", url: "https://example.com/video", attachment_id: "file-456" });
  assert.equal(v.url, "https://example.com/video");
  assert.equal(v.attachment_id, "file-456");
});

test("validateClearanceInput: rejects invalid scheme even when attachment also present", () => {
  assert.throws(
    () => validateClearanceInput({ title: "x", url: "javascript:alert(1)", attachment_id: "file-1" }),
    ClearanceValidationError,
  );
});

test("validateClearanceInput: description is optional, trims to null when blank", () => {
  const v = validateClearanceInput({ title: "x", url: "https://example.com", description: "   " });
  assert.equal(v.description, null);
});

test("validateClearanceInput: title is trimmed", () => {
  const v = validateClearanceInput({ title: "  Physical Form  ", url: "https://example.com" });
  assert.equal(v.title, "Physical Form");
});

// ── sortClearanceResources ────────────────────────────────────────────────

function row(id: string, sort_order: number, created_at: string) {
  return { id, sort_order, created_at };
}

test("sortClearanceResources: orders by sort_order ascending", () => {
  const rows = [row("c", 2, "2026-01-01"), row("a", 0, "2026-01-01"), row("b", 1, "2026-01-01")];
  assert.deepEqual(sortClearanceResources(rows).map(r => r.id), ["a", "b", "c"]);
});

test("sortClearanceResources: ties broken by created_at ascending", () => {
  const rows = [
    row("later", 0, "2026-01-02T00:00:00Z"),
    row("earlier", 0, "2026-01-01T00:00:00Z"),
  ];
  assert.deepEqual(sortClearanceResources(rows).map(r => r.id), ["earlier", "later"]);
});

test("sortClearanceResources: does not mutate the input array", () => {
  const rows = [row("b", 1, "2026-01-01"), row("a", 0, "2026-01-01")];
  const originalOrder = rows.map(r => r.id);
  sortClearanceResources(rows);
  assert.deepEqual(rows.map(r => r.id), originalOrder);
});
