import test from "node:test";
import assert from "node:assert/strict";
import { dayIndex, entryPhotoForOffset, ENTRY_PHOTO_OFFSET, ELF_ENTRY_PHOTOS } from "./entryPhotos.ts";

const SAME_DAY_MORNING = new Date("2026-03-05T01:00:00.000Z");
const SAME_DAY_NIGHT   = new Date("2026-03-05T23:59:59.999Z");
const NEXT_DAY         = new Date("2026-03-06T00:00:00.000Z");

test("dayIndex: identical for any two timestamps within the same UTC calendar day", () => {
  assert.equal(dayIndex(SAME_DAY_MORNING), dayIndex(SAME_DAY_NIGHT));
});

test("dayIndex: increments by exactly 1 for the next calendar day", () => {
  assert.equal(dayIndex(NEXT_DAY), dayIndex(SAME_DAY_MORNING) + 1);
});

test("entryPhotoForOffset: deterministic — same date and offset always yields the same photo", () => {
  const a = entryPhotoForOffset(ENTRY_PHOTO_OFFSET.login, SAME_DAY_MORNING);
  const b = entryPhotoForOffset(ENTRY_PHOTO_OFFSET.login, SAME_DAY_NIGHT);
  assert.deepEqual(a, b);
});

test("entryPhotoForOffset: never uses Math.random — repeated calls with the same inputs are identical", () => {
  const results = new Set(
    Array.from({ length: 10 }, () => entryPhotoForOffset(ENTRY_PHOTO_OFFSET.teams, SAME_DAY_MORNING).src),
  );
  assert.equal(results.size, 1);
});

test("entryPhotoForOffset: consecutive screen offsets wrap correctly with 3 photos", () => {
  const len = ELF_ENTRY_PHOTOS.length;
  assert.equal(len, 3, "this test's wrap assertions assume exactly 3 approved photos");

  const login          = entryPhotoForOffset(ENTRY_PHOTO_OFFSET.login, SAME_DAY_MORNING);
  const teams           = entryPhotoForOffset(ENTRY_PHOTO_OFFSET.teams, SAME_DAY_MORNING);
  const forgotPassword  = entryPhotoForOffset(ENTRY_PHOTO_OFFSET.forgotPassword, SAME_DAY_MORNING);
  const resetPassword   = entryPhotoForOffset(ENTRY_PHOTO_OFFSET.resetPassword, SAME_DAY_MORNING);
  const enterCode       = entryPhotoForOffset(ENTRY_PHOTO_OFFSET.enterCode, SAME_DAY_MORNING);
  const joinError       = entryPhotoForOffset(ENTRY_PHOTO_OFFSET.joinError, SAME_DAY_MORNING);

  // Offset 3 wraps to the same photo as offset 0, offset 4 to offset 1, etc.
  assert.deepEqual(resetPassword, login);
  assert.deepEqual(enterCode, teams);
  assert.deepEqual(joinError, forgotPassword);
});

test("entryPhotoForOffset: negative or huge offsets still resolve to a valid in-range photo", () => {
  const photo = entryPhotoForOffset(-1, SAME_DAY_MORNING);
  assert.ok(ELF_ENTRY_PHOTOS.includes(photo));
});

test("ELF_ENTRY_PHOTOS: every entry has a non-empty src, sport, and alt", () => {
  for (const photo of ELF_ENTRY_PHOTOS) {
    assert.ok(photo.src.startsWith("/auth/"));
    assert.ok(photo.sport.length > 0);
    assert.ok(photo.alt.length > 10);
  }
});
