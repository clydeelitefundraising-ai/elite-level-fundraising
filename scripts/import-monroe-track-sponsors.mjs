#!/usr/bin/env node
// One-time bulk sponsor import for Monroe Valley High School Track and
// Field, 2027 Season (campaign_slug: monroe-valley-track-and-field-2027,
// team_id: 1a22fd17-de3e-47ec-8534-fd084aa70b3e).
//
// Schema discovery (see conversation record): this app has TWO separate
// sponsor systems. `sponsors` is the campaign-specific table that actually
// renders on the public campaign page (tier enum: title/platinum/gold/
// silver/bronze/community_partner). The separate Sponsor CRM
// (sponsor_businesses/sponsor_activities/sponsor_relationships) is an
// internal business-development pipeline entirely decoupled from the public
// display — writing fictional demo sponsors into it would inject fake
// prospects into a real sales-pipeline tool, so this script deliberately
// does NOT touch it. Per approval, an `industry` column was added to
// `sponsors` itself (phase_a24_sponsor_industry.sql) rather than folding
// industry into `description` or using the CRM.
//
// Auth: unlike calendar events, a real ADMIN-authenticated creation route
// already exists for sponsors — POST /api/admin/sponsors (elf_admin cookie)
// — and was extended (2-line, additive, backward-compatible) to also accept
// optional `description`/`industry`, both of which the underlying
// addSponsor() service already supported. This script authenticates via the
// real POST /api/admin/login and creates sponsors via the real
// POST /api/admin/sponsors route — no business logic is reproduced.
// Logos are uploaded via the real POST /api/admin/sponsors/logo route
// (multipart, admin-gated) and backfilled onto existing rows via the real
// PUT /api/admin/sponsors/[id] route. Both already call logAuditEvent
// automatically per row — no extra audit call needed here for those.
//
// Logo files: I cannot generate images. The script looks for
// scripts/assets/sponsor-logos/{slug}.png for each sponsor and uploads
// whichever exist; missing files are reported (not treated as failures) and
// can be backfilled later by re-running once supplied.
//
// Idempotency: matches existing `sponsors` rows by (campaign_slug,
// normalized name) — the safest key, since sponsors has no DB-level
// uniqueness constraint. Exact matches (same tier + url) are left
// untouched; a match with a different tier/url is reported as a conflict
// and left unchanged. Logos are never re-uploaded if logo_url is already
// set (reused, not duplicated).
//
// Side effects: no CRM records, no Stripe, no invitation emails, no push
// notifications — none of those exist in the sponsor-creation code path to
// begin with (confirmed by reading the routes).
//
// Usage:
//   1. Set ADMIN_PASSWORD in .env.local, `npm run dev`.
//   2. Apply supabase/migrations/phase_a24_sponsor_industry.sql in the
//      Supabase SQL editor (required before a REAL import).
//   3. (Optional) place PNG logos at scripts/assets/sponsor-logos/{slug}.png
//   4. Dry run (no writes):  node scripts/import-monroe-track-sponsors.mjs --dry-run
//   5. Real import:          node scripts/import-monroe-track-sponsors.mjs
//   Optional: APP_BASE=http://localhost:3000 (default) to point at a different origin.

import { readFileSync, existsSync } from "node:fs";

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnv(new URL("../.env.local", import.meta.url));
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = env.ADMIN_PASSWORD;
const APP_BASE = process.env.APP_BASE || "http://localhost:3000";
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPA_URL || !SUPA_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const TARGET_SLUG = "monroe-valley-track-and-field-2027";
const TARGET_TEAM_ID = "1a22fd17-de3e-47ec-8534-fd084aa70b3e";
const EXPECTED = { school_name: "Monroe Valley High School", sport_name: "Track and Field", season: "2027 Season" };

const VALID_TIERS = new Set(["title", "platinum", "gold", "silver", "bronze", "community_partner"]);
const LOGO_DIR = new URL("./assets/sponsor-logos/", import.meta.url);

// ── Sponsor data ─────────────────────────────────────────────────────────
const SPONSORS = [
  { slug: "summit-ridge-construction", name: "Summit Ridge Construction", tier: "gold",
    url: "https://www.summitridgebuild.com", industry: "General Contractor",
    description: "Family-owned commercial and residential construction company supporting local schools and youth athletics." },
  { slug: "falcon-fuel-coffee", name: "Falcon Fuel Coffee", tier: "gold",
    url: "https://www.falconfuelcoffee.com", industry: "Coffee Shop",
    description: "Local coffee and breakfast café supporting Monroe Valley athletes and community programs." },
  { slug: "apex-auto-care", name: "Apex Auto Care", tier: "silver",
    url: "https://www.apexautocareaz.com", industry: "Automotive Repair",
    description: "Full-service automotive repair shop serving local families and businesses." },
  { slug: "peak-performance-physical-therapy", name: "Peak Performance Physical Therapy", tier: "silver",
    url: "https://www.peakperformancept.com", industry: "Sports Medicine",
    description: "Physical therapy and sports-performance clinic focused on helping athletes recover and perform at their best." },
  { slug: "evergreen-wealth-partners", name: "Evergreen Wealth Partners", tier: "bronze",
    url: "https://www.evergreenwealthpartners.com", industry: "Financial Services",
    description: "Financial-planning firm providing retirement, investment, and family financial guidance." },
];

function normalize(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function sbHeaders(extra = {}) {
  return { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", ...extra };
}

function validateRow(row) {
  const errors = [];
  if (!row.name?.trim()) errors.push("missing name");
  if (!row.url?.trim()) errors.push("missing url");
  if (!VALID_TIERS.has(row.tier)) errors.push(`invalid tier "${row.tier}"`);
  return errors;
}

function logoPathFor(slug) {
  return new URL(`${slug}.png`, LOGO_DIR);
}

async function resolveTargetCampaign() {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(TARGET_SLUG)}&select=campaign_slug,team_id,school_name,sport_name,season,archived,is_demo,status`,
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`campaign_settings lookup failed: ${await res.text()}`);
  const rows = await res.json();
  if (rows.length !== 1) throw new Error(`Expected exactly 1 campaign for slug "${TARGET_SLUG}", found ${rows.length}. Aborting.`);
  const c = rows[0];
  if (c.school_name !== EXPECTED.school_name || c.sport_name !== EXPECTED.sport_name || c.season !== EXPECTED.season) {
    throw new Error(`Campaign "${TARGET_SLUG}" does not match expected identity (got ${c.school_name} / ${c.sport_name} / ${c.season}). Aborting.`);
  }
  if (c.team_id !== TARGET_TEAM_ID) throw new Error(`team_id mismatch: expected ${TARGET_TEAM_ID}, got ${c.team_id}. Aborting.`);
  if (c.is_demo) throw new Error(`Campaign "${TARGET_SLUG}" is flagged is_demo=true. Aborting.`);
  if (c.archived) throw new Error(`Campaign "${TARGET_SLUG}" is archived. Aborting.`);
  return c;
}

async function getExistingSponsors(slug) {
  // Direct REST read (not the admin GET route) so invisible rows aren't
  // missed for dedup purposes — the admin GET route filters visible=eq.true.
  const res = await fetch(
    `${SUPA_URL}/rest/v1/sponsors?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,url,tier,logo_url,description`,
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`sponsors lookup failed: ${await res.text()}`);
  return res.json();
}

async function adminLogin() {
  if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD is not set in .env.local — required for the real import run.");
  const res = await fetch(`${APP_BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Admin login failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.match(/elf_admin=([^;]+)/)?.[1];
  if (!cookie) throw new Error("No elf_admin cookie in login response.");
  return cookie;
}

async function uploadLogo(cookie, slug, filePath) {
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append("logo", new Blob([buf], { type: "image/png" }), `${slug}.png`);
  form.append("slug", TARGET_SLUG);
  const res = await fetch(`${APP_BASE}/api/admin/sponsors/logo`, {
    method: "POST",
    headers: { Cookie: `elf_admin=${cookie}` },
    body: form,
  });
  if (!res.ok) throw new Error(`logo upload failed (${res.status}): ${await res.text()}`);
  const { url } = await res.json();
  return url;
}

async function createSponsor(cookie, row, logoUrl) {
  const res = await fetch(`${APP_BASE}/api/admin/sponsors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `elf_admin=${cookie}` },
    body: JSON.stringify({
      campaign_slug: TARGET_SLUG,
      name: row.name, url: row.url, tier: row.tier,
      description: row.description, industry: row.industry,
      logo_url: logoUrl ?? null,
    }),
  });
  if (!res.ok) throw new Error(`(${res.status}) ${await res.text()}`);
  return res.json();
}

async function patchSponsorLogo(cookie, id, logoUrl) {
  const res = await fetch(`${APP_BASE}/api/admin/sponsors/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: `elf_admin=${cookie}` },
    body: JSON.stringify({ logo_url: logoUrl }),
  });
  if (!res.ok) throw new Error(`logo backfill failed (${res.status}): ${await res.text()}`);
}

async function main() {
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Import target: ${TARGET_SLUG}\n`);

  const campaign = await resolveTargetCampaign();
  console.log(`Resolved campaign: ${campaign.school_name} — ${campaign.sport_name} — ${campaign.season} (team_id=${campaign.team_id}, status=${campaign.status})\n`);

  const existing = await getExistingSponsors(TARGET_SLUG);
  const existingByName = new Map(existing.map(s => [normalize(s.name), s]));

  let cookie = null;
  if (!DRY_RUN) cookie = await adminLogin();

  const results = [];
  const totals = { sponsor_created: 0, sponsor_reused: 0, conflict: 0, failed: 0, logo_uploaded: 0, logo_reused: 0, logo_missing: 0 };

  for (const row of SPONSORS) {
    const errors = validateRow(row);
    if (errors.length > 0) {
      results.push({ label: row.name, status: "failed", reason: errors.join("; ") });
      totals.failed++;
      continue;
    }

    const logoFile = logoPathFor(row.slug);
    const logoFileExists = existsSync(logoFile);
    const key = normalize(row.name);
    const match = existingByName.get(key);

    if (match) {
      const conflicting = match.tier !== row.tier || match.url !== row.url;
      if (conflicting) {
        results.push({
          label: row.name, status: "conflict",
          reason: `existing row has tier="${match.tier}" url="${match.url}" — differs from spec, left unchanged`,
        });
        totals.conflict++;
        continue;
      }

      totals.sponsor_reused++;
      let logoNote = "no logo file supplied yet";
      if (match.logo_url) {
        totals.logo_reused++;
        logoNote = "logo already set — reused";
      } else if (logoFileExists) {
        if (DRY_RUN) {
          logoNote = "would upload + backfill logo";
        } else {
          try {
            const url = await uploadLogo(cookie, row.slug, logoFile);
            await patchSponsorLogo(cookie, match.id, url);
            totals.logo_uploaded++;
            logoNote = "logo uploaded + backfilled";
          } catch (err) {
            logoNote = `logo backfill failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
      } else {
        totals.logo_missing++;
      }
      results.push({ label: row.name, status: "already_existed", reason: logoNote });
      continue;
    }

    // No existing sponsor with this name — create.
    if (DRY_RUN) {
      results.push({
        label: row.name, status: "would_create",
        reason: logoFileExists ? "would upload logo" : "no logo file supplied yet",
      });
      totals.sponsor_created++;
      if (logoFileExists) totals.logo_uploaded++; else totals.logo_missing++;
      continue;
    }

    try {
      let logoUrl = null;
      let logoNote = "no logo file supplied yet";
      if (logoFileExists) {
        try {
          logoUrl = await uploadLogo(cookie, row.slug, logoFile);
          totals.logo_uploaded++;
          logoNote = "logo uploaded";
        } catch (err) {
          logoNote = `logo upload failed: ${err instanceof Error ? err.message : String(err)}`;
          totals.logo_missing++;
        }
      } else {
        totals.logo_missing++;
      }
      await createSponsor(cookie, row, logoUrl);
      results.push({ label: row.name, status: "created", reason: logoNote });
      totals.sponsor_created++;
    } catch (err) {
      results.push({ label: row.name, status: "failed", reason: err instanceof Error ? err.message : String(err) });
      totals.failed++;
    }
  }

  console.log("Row-level results:");
  for (const r of results) {
    const bits = [r.status];
    if (r.reason) bits.push(r.reason);
    console.log(`  ${r.label.padEnd(36)} ${bits.join(" — ")}`);
  }

  console.log("\nTotals:");
  console.log(`  ${DRY_RUN ? "would create" : "sponsors created"}: ${totals.sponsor_created}`);
  console.log(`  sponsors reused:  ${totals.sponsor_reused}`);
  console.log(`  conflicts:        ${totals.conflict}`);
  console.log(`  failed:           ${totals.failed}`);
  console.log(`  logos uploaded${DRY_RUN ? " (would)" : ""}: ${totals.logo_uploaded}`);
  console.log(`  logos reused:     ${totals.logo_reused}`);
  console.log(`  logos missing:    ${totals.logo_missing}`);
  console.log(`  total rows:       ${SPONSORS.length}`);

  if (!DRY_RUN && totals.failed === 0) {
    // Single summary audit entry, in addition to the per-row logAuditEvent
    // calls already made by the real routes above.
    const summary =
      `Bulk sponsor import for ${TARGET_SLUG} (team ${TARGET_TEAM_ID}): ` +
      `${totals.sponsor_created} created, ${totals.sponsor_reused} reused, ${totals.conflict} conflicts, ${totals.failed} failed. ` +
      `Logos — uploaded: ${totals.logo_uploaded}, reused: ${totals.logo_reused}, missing: ${totals.logo_missing}. ` +
      `No CRM records, Stripe objects, invitation emails, or push notifications were created for this bulk demo-data import.`;
    const res = await fetch(`${SUPA_URL}/rest/v1/audit_logs`, {
      method: "POST",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        action: "sponsor.bulk_import",
        entity_type: "sponsor",
        entity_id: null,
        campaign_slug: TARGET_SLUG,
        summary,
        new_value: { campaign_slug: TARGET_SLUG, team_id: TARGET_TEAM_ID, ...totals },
        admin_identifier: "admin",
        ip_address: null,
        user_agent: null,
      }),
    });
    if (!res.ok) console.error(`  (warning) summary audit_logs insert failed: ${await res.text()}`);
    else console.log("\nSummary audit_logs entry written.");
  }

  process.exit(totals.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("\nFatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
