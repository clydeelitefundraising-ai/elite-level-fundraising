import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

// communityPartners.ts imports real (non-type-only) runtime values from
// "./_client" (extensionless) — needs the shared loader to resolve that
// under plain `node --test`, same reason every file in this pattern
// registers it (see organization.test.ts for the identical rationale).
// Only the pure validation functions are exercised here; the DB-backed
// list/get/create/update functions are covered by the route tests instead.
register(new URL("../testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { isValidHttpsUrl, validateCommunityPartnerFields, listActiveCommunityPartners } = await import("./communityPartners.ts");

// ── isValidHttpsUrl ─────────────────────────────────────────────────────────

test("isValidHttpsUrl: accepts a well-formed https URL", () => {
  assert.equal(isValidHttpsUrl("https://example.com"), true);
});

test("isValidHttpsUrl: rejects http (not https)", () => {
  assert.equal(isValidHttpsUrl("http://example.com"), false);
});

test("isValidHttpsUrl: rejects a non-URL string", () => {
  assert.equal(isValidHttpsUrl("not a url"), false);
});

test("isValidHttpsUrl: rejects other schemes (ftp, javascript, data)", () => {
  assert.equal(isValidHttpsUrl("ftp://example.com"), false);
  assert.equal(isValidHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isValidHttpsUrl("data:text/html,hi"), false);
});

test("isValidHttpsUrl: rejects blank/whitespace-only input", () => {
  assert.equal(isValidHttpsUrl(""), false);
  assert.equal(isValidHttpsUrl("   "), false);
});

test("isValidHttpsUrl: tolerates surrounding whitespace in an otherwise valid URL", () => {
  assert.equal(isValidHttpsUrl("  https://example.com  "), true);
});

// ── validateCommunityPartnerFields — create (requireName: true) ───────────

test("create: valid business_name alone is accepted", () => {
  const result = validateCommunityPartnerFields({ business_name: "Acme Co" }, { requireName: true });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.business_name, "Acme Co");
});

test("create: missing business_name is rejected", () => {
  const result = validateCommunityPartnerFields({}, { requireName: true });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.business_name);
});

test("create: whitespace-only business_name is rejected", () => {
  const result = validateCommunityPartnerFields({ business_name: "   " }, { requireName: true });
  assert.equal(result.ok, false);
});

test("create: business_name and short_description are both trimmed", () => {
  const result = validateCommunityPartnerFields(
    { business_name: "  Acme Co  ", short_description: "  Great partner  " },
    { requireName: true },
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.business_name, "Acme Co");
    assert.equal(result.value.short_description, "Great partner");
  }
});

test("create: blank short_description normalizes to null, not an empty string", () => {
  const result = validateCommunityPartnerFields({ business_name: "Acme Co", short_description: "   " }, { requireName: true });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.short_description, null);
});

// ── website_url ──────────────────────────────────────────────────────────

test("a non-https website_url is rejected, with a field-specific error", () => {
  const result = validateCommunityPartnerFields({ business_name: "Acme Co", website_url: "http://example.com" }, { requireName: true });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.website_url);
});

test("a blank website_url is accepted and normalizes to null (field is optional)", () => {
  const result = validateCommunityPartnerFields({ business_name: "Acme Co", website_url: "" }, { requireName: true });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.website_url, null);
});

test("a well-formed https website_url is accepted and trimmed", () => {
  const result = validateCommunityPartnerFields({ business_name: "Acme Co", website_url: "  https://acme.example.com  " }, { requireName: true });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.website_url, "https://acme.example.com");
});

// ── update (requireName: false) — partial-field semantics ─────────────────

test("update: an empty body validates ok with no fields set (caller rejects 'nothing to update' separately)", () => {
  const result = validateCommunityPartnerFields({}, { requireName: false });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(Object.keys(result.value), []);
});

test("update: only fields present in the input are returned — absent fields are never defaulted or clobbered", () => {
  const result = validateCommunityPartnerFields({ is_active: true }, { requireName: false });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { is_active: true });
  }
});

test("update: is_featured can be toggled independently of is_active", () => {
  const result = validateCommunityPartnerFields({ is_featured: true }, { requireName: false });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.is_featured, true);
    assert.equal("is_active" in result.value, false);
  }
});

test("update: display_order accepts a finite number and truncates a fractional value", () => {
  const result = validateCommunityPartnerFields({ display_order: 3.7 }, { requireName: false });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.display_order, 3);
});

test("update: a non-numeric display_order is silently ignored (treated as absent), never crashes", () => {
  const result = validateCommunityPartnerFields({ display_order: "not a number" }, { requireName: false });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal("display_order" in result.value, false);
});

test("update: a non-boolean is_active is silently ignored (treated as absent)", () => {
  const result = validateCommunityPartnerFields({ is_active: "yes" }, { requireName: false });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal("is_active" in result.value, false);
});

test("update: business_name can be cleared-to-invalid only if explicitly sent — omitting it never requires it", () => {
  const okOmitted = validateCommunityPartnerFields({ is_active: true }, { requireName: false });
  assert.equal(okOmitted.ok, true);

  const rejectedWhenSentBlank = validateCommunityPartnerFields({ business_name: "" }, { requireName: false });
  assert.equal(rejectedWhenSentBlank.ok, false);
});

test("update: logo_url normalizes a blank value to null and trims a real URL", () => {
  const result = validateCommunityPartnerFields({ logo_url: "  https://cdn.example.com/logo.png  " }, { requireName: false });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.logo_url, "https://cdn.example.com/logo.png");
});

test("update: multiple invalid fields are all reported together", () => {
  const result = validateCommunityPartnerFields({ business_name: "", website_url: "http://nope.com" }, { requireName: false });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.business_name);
    assert.ok(result.errors.website_url);
  }
});

// ── listActiveCommunityPartners (Phase 2.2C — the Team App's only read) ───
// Unlike the create/update/list-all functions above, this one IS exercised
// directly here rather than via a route test — it has no API route of its
// own (sponsors/page.tsx, a server component, calls it directly), so this
// is its only coverage. Mocks global.fetch directly rather than the fuller
// fake-Supabase-table harness the route tests use, since there's only one
// query shape to verify.

test("listActiveCommunityPartners: queries only is_active=true rows, never the full table", async () => {
  const realFetch = globalThis.fetch;
  let capturedUrl = "";
  globalThis.fetch = (async (url: string) => {
    capturedUrl = url;
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;

  try {
    await listActiveCommunityPartners();
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.ok(capturedUrl.includes("is_active=eq.true"), `expected an is_active=eq.true filter, got: ${capturedUrl}`);
});

test("listActiveCommunityPartners: selects only the public-safe column subset — no admin-only metadata", async () => {
  const realFetch = globalThis.fetch;
  let capturedUrl = "";
  globalThis.fetch = (async (url: string) => {
    capturedUrl = url;
    return new Response(JSON.stringify([]), { status: 200 });
  }) as typeof fetch;

  try {
    await listActiveCommunityPartners();
  } finally {
    globalThis.fetch = realFetch;
  }

  const selectParam = new URL(capturedUrl.replace(/^[^?]*\?/, "http://x/?")).searchParams.get("select") ?? "";
  const selected = selectParam.split(",");
  assert.deepEqual(
    new Set(selected),
    new Set(["id", "business_name", "short_description", "website_url", "logo_url", "is_featured"]),
  );
  assert.ok(!selected.includes("created_at"), "created_at is admin-only metadata and must never be selected here");
  assert.ok(!selected.includes("display_order"), "display_order is admin-only metadata and must never be selected here");
});

test("listActiveCommunityPartners: returns [] when the query yields no rows, never throws", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify([]), { status: 200 })) as typeof fetch;

  let result;
  try {
    result = await listActiveCommunityPartners();
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.deepEqual(result, []);
});

test("listActiveCommunityPartners: returns only what the query gave it, in order", async () => {
  const rows = [
    { id: "cp-1", business_name: "Acme Co", short_description: null, website_url: "https://acme.example.com", logo_url: null, is_featured: false },
    { id: "cp-2", business_name: "Beta LLC", short_description: "Great partner", website_url: null, logo_url: "https://cdn.example.com/b.png", is_featured: true },
  ];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(rows), { status: 200 })) as typeof fetch;

  let result;
  try {
    result = await listActiveCommunityPartners();
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.deepEqual(result, rows);
});
