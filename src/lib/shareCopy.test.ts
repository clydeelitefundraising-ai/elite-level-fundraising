import test from "node:test";
import assert from "node:assert/strict";
import { buildShareText, buildAthleteShareUrl, buildCampaignMetadata, resolveTeamLogoUrl, buildCoachShareUrl, buildCoachShareText } from "./shareCopy.ts";

test("buildShareText combines athlete, school, and sport dynamically", () => {
  assert.equal(
    buildShareText("Hannah", "Monroe Valley", "Track & Field"),
    "Support Hannah and Monroe Valley Track & Field this season! Every donation helps the team.",
  );
});

test("buildShareText falls back cleanly when school/sport are missing", () => {
  assert.equal(buildShareText("Hannah", "", ""), "Support Hannah this season! Every donation helps.");
});

test("buildShareText never emits the old generic wording", () => {
  const text = buildShareText("Hannah", "Monroe Valley", "Track & Field");
  assert.ok(!text.includes("reach their fundraising goal"));
});

test("buildAthleteShareUrl points to the public campaign page, not the internal team route", () => {
  const url = buildAthleteShareUrl("https://app.elitelevelfundraising.com", "monroe-valley", "athlete-123");
  assert.equal(url, "https://app.elitelevelfundraising.com/campaign/monroe-valley?athlete=athlete-123");
  assert.ok(!url.includes("/team/"));
});

test("buildCampaignMetadata: athlete-specific title/description names the athlete and team", () => {
  const { title, description } = buildCampaignMetadata({
    athleteName: "Hannah Cooper",
    teamLabel:   "Monroe Valley Wolves Track & Field",
    schoolName:  "Monroe Valley",
    sportName:   "Track & Field",
  });
  assert.equal(title, "Support Hannah Cooper — Monroe Valley Wolves Track & Field");
  assert.equal(description, "Support Hannah and Monroe Valley Track & Field this season! Every donation helps the team.");
});

test("buildCampaignMetadata: team-wide (no athlete) falls back to a team-level title/description", () => {
  const { title, description } = buildCampaignMetadata({
    athleteName: null,
    teamLabel:   "Monroe Valley Wolves Track & Field",
    schoolName:  "Monroe Valley",
    sportName:   "Track & Field",
  });
  assert.equal(title, "Support Monroe Valley Wolves Track & Field | Elite Level Fundraising");
  assert.equal(description, "Support Monroe Valley Wolves Track & Field this season! Every donation helps the team.");
});

test("buildCampaignMetadata: never falls back to a generic/no-name title even with empty team data", () => {
  const { title } = buildCampaignMetadata({ athleteName: null, teamLabel: "", schoolName: "", sportName: "" });
  assert.equal(title, "Support Our Team | Elite Level Fundraising");
});

// A: custom team logo (Platform-Admin-set team_photo) wins, matching
// TeamHeader/DesktopSidebar's own team_photo-over-logo_url precedence.
test("resolveTeamLogoUrl: prefers team_photo over logo_url, same as the header", () => {
  const url = resolveTeamLogoUrl({
    team_photo: "https://storage.example.com/team-photos/monroe-valley.png",
    logo_url:   "https://storage.example.com/logos/monroe-valley-old.png",
  });
  assert.equal(url, "https://storage.example.com/team-photos/monroe-valley.png");
});

// B: an athlete-specific share resolves the logo from the same campaign
// `settings` object as a team-wide share (the athlete never carries its
// own logo) — so a coach-uploaded logo_url with no team_photo set still
// resolves correctly for either kind of share link.
test("resolveTeamLogoUrl: falls back to logo_url when no team_photo is set", () => {
  const url = resolveTeamLogoUrl({ team_photo: null, logo_url: "https://storage.example.com/logos/monroe-valley.png" });
  assert.equal(url, "https://storage.example.com/logos/monroe-valley.png");
});

test("resolveTeamLogoUrl: treats an empty-string logo_url as unset, same as the header's falsy check", () => {
  const url = resolveTeamLogoUrl({ team_photo: "", logo_url: "" });
  assert.equal(url, null);
});

// C: no logo configured at all -> null, signaling callers (e.g. /api/og)
// to use the same initials-badge fallback the header uses, not an ELF logo.
test("resolveTeamLogoUrl: returns null when neither team_photo nor logo_url is set", () => {
  assert.equal(resolveTeamLogoUrl({ team_photo: null, logo_url: null }), null);
  assert.equal(resolveTeamLogoUrl({}), null);
  assert.equal(resolveTeamLogoUrl(null), null);
  assert.equal(resolveTeamLogoUrl(undefined), null);
});

// ── Phase A35: coach fundraising share copy ─────────────────────────────

test("buildCoachShareUrl points to the public campaign page with ?coach=, not an internal team route", () => {
  const url = buildCoachShareUrl("https://app.elitelevelfundraising.com", "monroe-valley", "coach-123");
  assert.equal(url, "https://app.elitelevelfundraising.com/campaign/monroe-valley?coach=coach-123");
  assert.ok(!url.includes("/team/"));
});

test("buildCoachShareText uses the coach's last name and never hardcodes a school/pronoun", () => {
  assert.equal(
    buildCoachShareText("Mike Owens", "Monroe Valley", "Track & Field"),
    "Support Coach Owens and Monroe Valley Track & Field this season! Every donation helps the program.",
  );
});

test("buildCoachShareText falls back to the full name when there's only one word", () => {
  assert.equal(
    buildCoachShareText("Prefontaine", "Monroe Valley", "Track & Field"),
    "Support Coach Prefontaine and Monroe Valley Track & Field this season! Every donation helps the program.",
  );
});

test("buildCoachShareText falls back cleanly when school/sport are missing", () => {
  assert.equal(
    buildCoachShareText("Mike Owens", "", ""),
    "Support Coach Owens this season! Every donation helps the program.",
  );
});

test("buildCampaignMetadata: coach-specific title/description names the coach and team", () => {
  const { title, description } = buildCampaignMetadata({
    athleteName: null,
    coachName:   "Mike Owens",
    teamLabel:   "Monroe Valley Wolves Track & Field",
    schoolName:  "Monroe Valley",
    sportName:   "Track & Field",
  });
  assert.equal(title, "Support Coach Mike Owens — Monroe Valley Wolves Track & Field");
  assert.equal(description, "Support Coach Owens and Monroe Valley Track & Field this season! Every donation helps the program.");
});

test("buildCampaignMetadata: athleteName takes precedence over coachName if somehow both are passed", () => {
  const { title } = buildCampaignMetadata({
    athleteName: "Hannah Cooper",
    coachName:   "Mike Owens",
    teamLabel:   "Monroe Valley Wolves Track & Field",
    schoolName:  "Monroe Valley",
    sportName:   "Track & Field",
  });
  assert.equal(title, "Support Hannah Cooper — Monroe Valley Wolves Track & Field");
});
