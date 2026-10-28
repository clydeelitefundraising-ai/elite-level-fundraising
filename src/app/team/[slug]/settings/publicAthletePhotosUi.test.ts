// Phase T7 — Public Athlete Photos: the Team Settings section, the migration
// and the privacy policy wording (structure; behaviour is covered by
// api/team/[slug]/settings/public-athlete-photos/route.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PUBLIC_PHOTO_CONFIRMATION_TEXT, publicAthletePhotoAllowed, settingChangedBy,
} from "../../../../lib/publicAthletePhotos.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const view = read("./SettingsView.tsx");
const section = read("./PublicAthletePhotosSection.tsx");

test("section is shown to the Head Coach only, inside the completed-season read-only wrapper", () => {
  assert.match(view, /\{coach\.role === "head_coach" && \(\n\s+<>\n[\s\S]*?Public Athlete Photos[\s\S]*?<ReadOnlyFieldset><PublicAthletePhotosSection slug=\{slug\} \/><\/ReadOnlyFieldset>/);
});

test("turning on: confirmation checkbox gates the button; confirm + wording version are sent; turning off sends neither", () => {
  assert.match(section, /disabled=\{!agreed \|\| working\}/);
  assert.match(section, /\{PUBLIC_PHOTO_CONFIRMATION_TEXT\}/);
  assert.match(section, /enabled \? \{ enabled, confirm: true, confirmation_version: state\.confirmation_version \} : \{ enabled \}/);
  assert.match(section, /onClick=\{\(\) => \{ if \(on\) void save\(false\); else \{ setConfirming\(true\);/, "on → confirmation first; off → immediate");
  assert.match(section, /role="switch"[\s\S]*aria-checked=\{on\}/);
});

test("per-athlete hide list: checkbox = shown publicly; status says Hidden / Photo shown / No photo yet", () => {
  assert.match(section, /checked=\{!a\.excluded\}/);
  assert.match(section, /onChange=\{e => void setExcluded\(a, !e\.target\.checked\)\}/);
  assert.match(section, /a\.excluded \? \(a\.inherited \? "Hidden · carried over from last season" : "Hidden"\) : a\.has_photo \? "Photo shown" : "No photo yet"/);
  assert.match(section, /carried\.has\(a\.id\) \? \{ \.\.\.a, excluded: true, inherited: true \}/, "carried-over athletes shown hidden right after turning on");
});

test("the one permission rule: only an explicit true team setting, and the athlete not hidden", () => {
  assert.equal(publicAthletePhotoAllowed(true, false), true);
  assert.equal(publicAthletePhotoAllowed(true, null), true);
  assert.equal(publicAthletePhotoAllowed(true, undefined), true, "athlete column absent → not hidden");
  for (const [team, ex] of [[false, false], [undefined, false], [null, false], ["true", false], [1, false], [true, true]] as const) {
    assert.equal(publicAthletePhotoAllowed(team, ex), false, `${String(team)}/${String(ex)}`);
  }
  assert.equal(settingChangedBy("Hana Head", "coach"), "Hana Head (Head Coach)");
});

test("confirmation wording covers school, program, parent/guardian permission and hiding athletes", () => {
  for (const s of ["school", "media permissions", "publish", "parent or guardian", "public fundraising", "hide any athlete"]) {
    assert.ok(PUBLIC_PHOTO_CONFIRMATION_TEXT.includes(s), s);
  }
});

test("migration: off by default for every existing and new team, nothing backfilled", () => {
  const sql = read("../../../../../supabase/migrations/phase_t7_public_athlete_photos.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS public_athlete_photos\s+boolean NOT NULL DEFAULT false;/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS public_athlete_photos_changed_at timestamptz;/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS public_athlete_photos_changed_by text;/);
  assert.match(sql, /ALTER TABLE athletes ADD COLUMN IF NOT EXISTS public_photo_excluded boolean NOT NULL DEFAULT false;/);
  assert.ok(!/\bUPDATE\b|\bINSERT\b|\bDELETE\b/i.test(sql.replace(/--.*$/gm, "")), "no data changes");
});

test("privacy policy explains public fundraising photo use", () => {
  const policy = read("../../../(marketing)/trust/privacy/page.tsx").replace(/\s+/g, " ");
  assert.match(policy, /<h2>Public fundraising pages<\/h2>/);
  for (const s of ["Head Coach has turned on public athlete photos", "media permissions", "hide any individual athlete", "turning the setting off removes athlete photos", "team logo"]) {
    assert.ok(policy.includes(s), s);
  }
});
