import test from "node:test";
import assert from "node:assert/strict";
import { desktopFollowUpStatusLabel } from "./followUpsFormat.ts";

// desktopFollowUpStatusLabel is presentation-only — it must never change
// src/lib/followUps.ts's own followUpStatusLabel()/FOLLOW_UP_STATUS_LABEL
// (still what the CSV/print report and the mobile card use), only add a
// truthful desktop-specific phrase for the null/no-outreach case.

test("desktopFollowUpStatusLabel: no outreach record -> 'No outreach logged' (not 'Not Started', not a bare dash)", () => {
  assert.equal(desktopFollowUpStatusLabel(null), "No outreach logged");
});

test("desktopFollowUpStatusLabel: 'contacted' -> 'Contacted'", () => {
  assert.equal(desktopFollowUpStatusLabel("contacted"), "Contacted");
});

test("desktopFollowUpStatusLabel: 'needs_follow_up' -> 'Needs Follow Up' (existing terminology preserved verbatim)", () => {
  assert.equal(desktopFollowUpStatusLabel("needs_follow_up"), "Needs Follow Up");
});

test("desktopFollowUpStatusLabel: 'resolved' -> 'Resolved'", () => {
  assert.equal(desktopFollowUpStatusLabel("resolved"), "Resolved");
});
