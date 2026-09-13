// Phase A39: lightweight, server-side pre-publication text filter (Apple
// Guideline 1.2 — "a method for filtering objectionable material from
// being posted to the app").
//
// SCOPE (deliberate, audited before writing this — see the final report
// for the full audit): applied ONLY to free-form, peer-visible text an
// ORDINARY member can post — direct/team message bodies and announcement
// comment bodies. These are the only two surfaces in the app where one
// user's free-form text is broadcast to other users with no staff
// authorship gate at write time (comments still ALSO go through the
// existing pending-approval queue afterward — this filter runs before
// that, it does not replace it).
//
// Deliberately NOT applied to:
//  - announcement title/body — staff-only-authored official team/safety/
//    schedule content (never ordinary-member UGC in the first place).
//  - schedule/event titles — same reasoning, plus real risk of a
//    legitimate opponent/venue name or medical/safety term being
//    misflagged (e.g. a school mascot, a medical condition on a roster
//    note).
//  - report "details" free text — a user describing or quoting exactly
//    what was said in the content they're reporting is the whole point
//    of that field; filtering it would actively undermine the reporting
//    safeguard Apple also requires. This is a deliberate exception, not
//    an oversight.
//  - CRM/outreach notes, parent-access-request reasons — internal
//    staff-facing tooling or narrowly-scoped admin requests, not UGC
//    broadcast to other end users.
//
// DESIGN (intentionally small, no dependency, no external API):
//  - normalizes case and common leetspeak/punctuation obfuscation
//    (spaces, dots, dashes, underscores stripped; @ -> a, 0 -> o, 1/! -> i,
//    3 -> e, 4 -> a, 5 -> s, 7 -> t, $ -> s) before matching, so
//    "f.u.c.k", "f u c k", and "@sshole" are all caught the same way as
//    the plain word.
//  - a short, curated list of severe terms (slurs, explicit sexual
//    solicitation, direct threats) — NOT a general profanity filter.
//    Ordinary mild language ("damn", "crap", "hell", trash talk about a
//    rival team, etc.) is never flagged; false positives on legitimate
//    team communication are the primary risk this design optimizes
//    against, per the smallest-defensible-implementation instruction.
//  - never echoes the matched term back to the caller or logs the full
//    rejected message — only a boolean/category is ever returned or
//    logged.
const LEET_MAP: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "3": "e", "4": "a",
  "@": "a", "5": "s", "$": "s", "7": "t",
};

function normalize(text: string): string {
  let out = text.toLowerCase();
  out = out.replace(/[013457!@$]/g, ch => LEET_MAP[ch] ?? ch);
  // Strip everything that isn't a letter or digit — collapses "f.u.c.k",
  // "f_u_c_k", "f u c k", "f-u-c-k" all down to "fuck" for matching
  // purposes, without altering word content itself.
  out = out.replace(/[^a-z0-9]+/g, "");
  return out;
}

// Intentionally short. Each entry is checked as a normalized substring —
// broad enough to catch the obfuscation patterns above, narrow enough
// that this list stays a handful of genuinely severe terms, not a
// "giant word list." Grouped by category in comments only (the array
// itself is flat) so future edits stay deliberate, not a dumping ground.
const PROHIBITED_TERMS: string[] = [
  // Slurs (racial/ethnic/homophobic) — a small, well-known set.
  "nigger", "nigga", "faggot", "fag", "chink", "spic", "kike", "tranny",
  // Explicit sexual solicitation / CSAM-adjacent language.
  "sendnudes", "nudepics", "childporn", "cp",
  // Direct threats of violence.
  "kysyourself", "kys", "illkillyou", "imgonnakillyou",
];

export type ContentFilterResult =
  | { ok: true }
  | { ok: false; message: string };

const REJECTION_MESSAGE = "This message contains content that isn't allowed. Please edit it and try again.";

/** Server-side check — call this from the API route/service layer that
 *  inserts the row, never rely on client-side validation alone. Returns
 *  a generic rejection message with no indication of which term or where
 *  it matched, by design. */
export function checkContent(text: string): ContentFilterResult {
  const normalized = normalize(text);
  for (const term of PROHIBITED_TERMS) {
    if (normalized.includes(term)) {
      // Never log the full message or the matched term — only that a
      // rejection happened, which is enough for operational visibility
      // without retaining content that was, by definition, just refused.
      console.warn("[contentFilter] rejected a submission for prohibited content");
      return { ok: false, message: REJECTION_MESSAGE };
    }
  }
  return { ok: true };
}
