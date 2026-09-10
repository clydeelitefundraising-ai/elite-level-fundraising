import test from "node:test";
import assert from "node:assert/strict";
import { buildShareText, buildAthleteShareUrl, buildCampaignMetadata } from "./shareCopy.ts";

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
