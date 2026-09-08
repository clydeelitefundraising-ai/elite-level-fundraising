import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedLogoMimeType, ALLOWED_LOGO_MIME_TYPES, MAX_LOGO_BYTES, buildLogoUpdatePayload } from "./logoValidation.ts";

test("isAllowedLogoMimeType: accepts PNG, JPEG, WEBP", () => {
  assert.equal(isAllowedLogoMimeType("image/png"), true);
  assert.equal(isAllowedLogoMimeType("image/jpeg"), true);
  assert.equal(isAllowedLogoMimeType("image/webp"), true);
});

test("isAllowedLogoMimeType: rejects SVG and other non-image types", () => {
  assert.equal(isAllowedLogoMimeType("image/svg+xml"), false);
  assert.equal(isAllowedLogoMimeType("application/pdf"), false);
  assert.equal(isAllowedLogoMimeType("text/html"), false);
  assert.equal(isAllowedLogoMimeType(""), false);
});

test("MAX_LOGO_BYTES is 5MB", () => {
  assert.equal(MAX_LOGO_BYTES, 5 * 1024 * 1024);
});

test("ALLOWED_LOGO_MIME_TYPES has exactly the three supported input formats", () => {
  assert.equal(ALLOWED_LOGO_MIME_TYPES.size, 3);
});

test("buildLogoUpdatePayload: writes ONLY logo_url — never branding_customized", () => {
  const payload = buildLogoUpdatePayload("https://example.com/logo.png");
  assert.deepEqual(payload, { logo_url: "https://example.com/logo.png" });
  assert.equal(Object.keys(payload).length, 1);
  assert.ok(!("branding_customized" in payload));
  assert.ok(!("primary_color" in payload));
  assert.ok(!("secondary_color" in payload));
});
