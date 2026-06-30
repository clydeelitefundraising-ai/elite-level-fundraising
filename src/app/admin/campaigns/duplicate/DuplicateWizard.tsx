"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { CampaignOption } from "./page";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;
type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

type SourceDetails = {
  campaign_slug:              string;
  school_name:                string;
  sport_name:                 string;
  mascot:                     string;
  season:                     string;
  location:                   string;
  primary_color:              string;
  secondary_color:            string;
  logo_url:                   string;
  default_athlete_goal_cents: number | null;
  show_leaderboard:           boolean;
  show_program_identity:      boolean;
  show_share_section:         boolean;
  show_fund_uses:             boolean;
  show_recent_donations:      boolean;
  show_sponsors:              boolean;
  show_donation_card:         boolean;
  layout_variant:             "classic" | "premium";
};

type WizardData = {
  // Step 1
  source_slug: string;
  // Step 2 — new campaign identity
  school_name:                  string;
  sport_name:                   string;
  mascot:                       string;
  season:                       string;
  year:                         string;
  location:                     string;
  campaign_slug:                string;
  slug_auto:                    boolean;
  goal_dollars:                 string;
  default_athlete_goal_dollars: string;
  deadline:                     string;
  coach_name:                   string;
  coach_email:                  string;
  coach_password:               string;
  // Step 3 — copy options
  copy_branding:        boolean;
  copy_feature_toggles: boolean;
  copy_fund_uses:       boolean;
  copy_sponsors:        boolean;
  copy_contact_goals:   boolean;
  copy_store_products:  boolean;
  copy_calendar_events: boolean;
};

type CopyResult = {
  ok:          true;
  slug:        string;
  source_slug: string;
  copied: {
    fund_uses:       number;
    sponsors:        number;
    contact_goals:   number;
    store_products:  number;
    calendar_events: number;
  };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const NEXT_YEAR = String(new Date().getFullYear() + 1);
const SLUG_RE   = /^[a-z0-9][a-z0-9-]*$/;
const HEX_RE    = /^#[0-9a-fA-F]{6}$/;

const BLANK: WizardData = {
  source_slug: "", school_name: "", sport_name: "", mascot: "",
  season: "", year: NEXT_YEAR, location: "",
  campaign_slug: "", slug_auto: true,
  goal_dollars: "", default_athlete_goal_dollars: "", deadline: "",
  coach_name: "", coach_email: "", coach_password: "",
  copy_branding: true, copy_feature_toggles: true,
  copy_fund_uses: true, copy_sponsors: true, copy_contact_goals: true,
  copy_store_products: false, copy_calendar_events: false,
};

const STEP_LABELS: Record<Step, string> = {
  1: "Select Source",
  2: "New Campaign",
  3: "Copy Options",
  4: "Review",
};

// ── Slug helpers ──────────────────────────────────────────────────────────────

function suggestSlug(sourceSlug: string, year: string): string {
  const y = year.trim();
  const replaced = sourceSlug.replace(/-\d{4}$/, `-${y}`);
  if (replaced !== sourceSlug) return replaced;
  return `${sourceSlug}-${y}`.slice(0, 60).replace(/-+$/, "");
}

function suggestSeason(sourceSeason: string, year: string): string {
  if (!sourceSeason) return `${year} Season`;
  return sourceSeason.replace(/\d{4}/, year.trim());
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  input:   { padding: ".5rem .75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".875rem", color: "#1d1d1f", background: "#fff", width: "100%", boxSizing: "border-box" as const, outline: "none" },
  label:   { display: "flex" as const, flexDirection: "column" as const, gap: ".35rem", fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase" as const, letterSpacing: ".04em" },
  muted:   { fontSize: ".72rem", color: "#98989d", fontWeight: 400, textTransform: "none" as const, letterSpacing: 0 },
  grid2:   { display: "grid" as const, gridTemplateColumns: "1fr 1fr" as const, gap: "1rem" },
  section: { marginBottom: "1.25rem", paddingBottom: "1rem", borderBottom: "1px solid #f5f5f7" } as React.CSSProperties,
};

// ── Shared components ─────────────────────────────────────────────────────────

function Btn({
  onClick, disabled = false, color = "#0b1e3d", variant = "solid", children, fullWidth = false,
}: {
  onClick?: () => void; disabled?: boolean; color?: string;
  variant?: "solid" | "outline"; children: React.ReactNode; fullWidth?: boolean;
}) {
  const solid = variant === "solid";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: ".5rem 1.1rem",
        background: disabled ? "#e5e7eb" : solid ? color : "transparent",
        color: disabled ? "#9ca3af" : solid ? "#fff" : color,
        border: solid ? "none" : `1.5px solid ${color}`,
        borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
        fontSize: ".82rem", fontWeight: 600, whiteSpace: "nowrap" as const,
        width: fullWidth ? "100%" : undefined,
      }}
    >{children}</button>
  );
}

function FieldNote({ children }: { children: React.ReactNode }) {
  return <span style={T.muted}>{children}</span>;
}

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={T.section}>
      <div style={{ fontSize: ".88rem", fontWeight: 700, color: "#1d1d1f" }}>{title}</div>
      {desc && <div style={{ fontSize: ".75rem", color: "#98989d", marginTop: ".2rem" }}>{desc}</div>}
    </div>
  );
}

function ErrorBanner({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: ".85rem 1.1rem", marginBottom: "1rem" }}>
      {errors.map((e, i) => (
        <div key={i} style={{ fontSize: ".82rem", color: "#dc2626", fontWeight: 500, ...(i > 0 ? { marginTop: ".35rem" } : {}) }}>{e}</div>
      ))}
    </div>
  );
}

function SlugIndicator({ status }: { status: SlugStatus }) {
  if (status === "idle")      return null;
  if (status === "checking")  return <span style={{ fontSize: ".72rem", color: "#98989d" }}>Checking…</span>;
  if (status === "available") return <span style={{ fontSize: ".72rem", color: "#15803d", fontWeight: 600 }}>✓ Available</span>;
  if (status === "taken")     return <span style={{ fontSize: ".72rem", color: "#dc2626", fontWeight: 600 }}>✗ Already in use</span>;
  return <span style={{ fontSize: ".72rem", color: "#d97706" }}>Lowercase letters, numbers, and hyphens only</span>;
}

function ToggleRow({
  label, desc, checked, onChange, defaultBadge,
}: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; defaultBadge?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".6rem 0", borderBottom: "1px solid #f5f5f7" }}>
      <div style={{ flex: 1, marginRight: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <span style={{ fontSize: ".82rem", fontWeight: 500, color: "#1d1d1f" }}>{label}</span>
          {defaultBadge && (
            <span style={{ fontSize: ".62rem", fontWeight: 700, color: defaultBadge === "default" ? "#0b1e3d" : "#98989d", background: defaultBadge === "default" ? "#eff0f3" : "#f3f4f6", padding: ".1rem .4rem", borderRadius: 4, textTransform: "uppercase", letterSpacing: ".03em" }}>
              {defaultBadge === "default" ? "Default On" : "Optional"}
            </span>
          )}
        </div>
        {desc && <div style={{ fontSize: ".68rem", color: "#98989d", marginTop: ".1rem" }}>{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{ width: 44, height: 26, borderRadius: 13, border: "none", background: checked ? "#0b1e3d" : "#d1d5db", position: "relative", cursor: "pointer", transition: "background .15s", flexShrink: 0 }}
      >
        <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
      </button>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: ".45rem 0", borderBottom: "1px solid #f5f5f7", gap: "1rem" }}>
      <span style={{ fontSize: ".72rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: ".82rem", fontWeight: 500, color: "#1d1d1f", textAlign: "right" }}>{value}</span>
    </div>
  );
}

// ── Step 1 — Select Source ────────────────────────────────────────────────────

function Step1({
  campaigns, selectedSlug, onSelect, loadingSource,
}: {
  campaigns:     CampaignOption[];
  selectedSlug:  string;
  onSelect:      (slug: string) => void;
  loadingSource: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = campaigns.filter(c => {
    const q = search.toLowerCase();
    return !q ||
      c.school_name?.toLowerCase().includes(q) ||
      c.sport_name?.toLowerCase().includes(q)  ||
      c.campaign_slug.toLowerCase().includes(q);
  });

  return (
    <div>
      <SectionHeader
        title="Select Source Campaign"
        desc="Choose the campaign to duplicate. Settings, branding, and content will be carried forward based on your copy selections."
      />

      <input
        type="search"
        placeholder="Filter campaigns…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ ...T.input, marginBottom: "1rem" }}
        autoFocus
      />

      {filtered.length === 0 && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#98989d", fontSize: ".875rem" }}>
          No campaigns found.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: ".5rem", maxHeight: 440, overflowY: "auto" }}>
        {filtered.map(c => {
          const selected = c.campaign_slug === selectedSlug;
          return (
            <button
              key={c.campaign_slug}
              type="button"
              onClick={() => onSelect(c.campaign_slug)}
              style={{
                display: "flex", alignItems: "center", gap: "1rem",
                padding: ".85rem 1rem",
                background: selected ? "#eff0f3" : "#f9fafb",
                border: selected ? "2px solid #0b1e3d" : "1.5px solid #e5e7eb",
                borderRadius: 10, cursor: "pointer", textAlign: "left", width: "100%",
                transition: "border-color .1s, background .1s",
              }}
            >
              {/* Color swatch */}
              <div style={{ width: 32, height: 32, borderRadius: 8, background: c.primary_color || "#0b1e3d", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: ".88rem", fontWeight: 600, color: "#1d1d1f", marginBottom: ".1rem" }}>
                  {c.school_name || c.campaign_slug}
                </div>
                <div style={{ fontSize: ".72rem", color: "#6e6e73" }}>
                  {[c.sport_name, c.season].filter(Boolean).join(" · ")}
                  {c.location && ` · ${c.location}`}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: ".3rem", flexShrink: 0 }}>
                {c.archived && (
                  <span style={{ fontSize: ".62rem", fontWeight: 700, color: "#9ca3af", background: "#f3f4f6", padding: ".1rem .4rem", borderRadius: 4, textTransform: "uppercase" }}>Archived</span>
                )}
                {selected && (
                  <span style={{ fontSize: ".72rem", fontWeight: 700, color: "#0b1e3d" }}>✓ Selected</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {loadingSource && (
        <div style={{ marginTop: "1rem", padding: ".75rem", background: "#f9fafb", borderRadius: 8, fontSize: ".78rem", color: "#6e6e73", textAlign: "center" }}>
          Loading campaign details…
        </div>
      )}
    </div>
  );
}

// ── Step 2 — New Campaign Info ────────────────────────────────────────────────

function Step2({
  d, upd, slugStatus,
}: {
  d:          WizardData;
  upd:        (p: Partial<WizardData>) => void;
  slugStatus: SlugStatus;
}) {
  const [showPw, setShowPw] = useState(false);

  return (
    <div>
      <SectionHeader
        title="New Campaign Information"
        desc="Update the identity for this season's campaign. Fields are pre-filled from the source — adjust as needed."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* Team identity */}
        <div>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".75rem" }}>Team Identity</div>
          <div style={T.grid2}>
            <label style={T.label}>
              School Name *
              <input style={T.input} value={d.school_name} autoFocus
                onChange={e => upd({ school_name: e.target.value })}
                placeholder="e.g. Mesa High School" />
            </label>
            <label style={T.label}>
              Sport *
              <input style={T.input} value={d.sport_name}
                onChange={e => upd({ sport_name: e.target.value })}
                placeholder="e.g. Soccer" />
            </label>
            <label style={T.label}>
              Mascot
              <input style={T.input} value={d.mascot}
                onChange={e => upd({ mascot: e.target.value })}
                placeholder="e.g. Jaguars" />
            </label>
            <label style={T.label}>
              Location
              <input style={T.input} value={d.location}
                onChange={e => upd({ location: e.target.value })}
                placeholder="e.g. Mesa, AZ" />
            </label>
            <label style={T.label}>
              Season
              <input style={T.input} value={d.season}
                onChange={e => upd({ season: e.target.value })}
                placeholder={`e.g. ${NEXT_YEAR} Season`} />
            </label>
            <label style={T.label}>
              Year
              <input type="number" style={T.input} value={d.year} min="2020" max="2040"
                onChange={e => {
                  upd({ year: e.target.value });
                  if (d.slug_auto) {
                    upd({ campaign_slug: suggestSlug(d.source_slug, e.target.value) });
                  }
                }}
                placeholder={NEXT_YEAR} />
            </label>
          </div>
        </div>

        {/* Slug */}
        <div style={{ padding: "1.25rem", background: "#f9fafb", borderRadius: 10, border: "1px solid #f0f0f2" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".75rem" }}>Campaign URL</div>
          <label style={{ ...T.label, textTransform: "none", letterSpacing: 0, fontSize: ".82rem", fontWeight: 500, color: "#374151" }}>
            <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
              <span style={{ fontSize: ".82rem", color: "#98989d", flexShrink: 0 }}>/campaign/</span>
              <input
                style={{ ...T.input, fontFamily: "monospace", fontWeight: 600 }}
                value={d.campaign_slug}
                placeholder="your-new-slug"
                onChange={e => {
                  const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                  upd({ campaign_slug: v, slug_auto: false });
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: ".4rem" }}>
              <SlugIndicator status={slugStatus} />
              {!d.slug_auto && (
                <button type="button" onClick={() => upd({ campaign_slug: suggestSlug(d.source_slug, d.year), slug_auto: true })}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", color: "#6366f1", fontWeight: 600, padding: 0, flexShrink: 0 }}>
                  ↺ Auto-suggest
                </button>
              )}
            </div>
          </label>
        </div>

        {/* Fundraising */}
        <div>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".75rem" }}>Fundraising</div>
          <div style={T.grid2}>
            <label style={T.label}>
              Team Goal ($)
              <FieldNote>Optional. Leave blank for no team goal.</FieldNote>
              <input type="number" min="0" step="100" style={T.input}
                value={d.goal_dollars}
                onChange={e => upd({ goal_dollars: e.target.value })}
                placeholder="e.g. 25000" />
            </label>
            <label style={T.label}>
              Default Athlete Goal ($)
              <FieldNote>Per-athlete fundraising target.</FieldNote>
              <input type="number" min="0" step="50" style={T.input}
                value={d.default_athlete_goal_dollars}
                onChange={e => upd({ default_athlete_goal_dollars: e.target.value })}
                placeholder="e.g. 500" />
            </label>
            <label style={{ ...T.label, gridColumn: "1 / -1" }}>
              Campaign Deadline
              <input type="date" style={T.input}
                value={d.deadline}
                onChange={e => upd({ deadline: e.target.value })} />
            </label>
          </div>
        </div>

        {/* Head coach */}
        <div style={{ padding: "1.25rem", background: "#f9fafb", borderRadius: 10, border: "1px solid #f0f0f2" }}>
          <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#1d1d1f", marginBottom: ".25rem" }}>Head Coach Account</div>
          <div style={{ fontSize: ".72rem", color: "#98989d", marginBottom: "1rem" }}>
            Creates new login credentials for this season's team hub. The original coach account is not affected.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
            <div style={T.grid2}>
              <label style={T.label}>
                Coach Name *
                <input style={T.input} value={d.coach_name}
                  onChange={e => upd({ coach_name: e.target.value })}
                  placeholder="Full name" />
              </label>
              <label style={T.label}>
                Email Address *
                <input type="email" style={T.input} value={d.coach_email}
                  onChange={e => upd({ coach_email: e.target.value })}
                  placeholder="coach@school.edu" />
              </label>
            </div>
            <label style={T.label}>
              Temporary Password *
              <FieldNote>Min 8 characters. Share securely after creation.</FieldNote>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  style={{ ...T.input, paddingRight: "2.5rem" }}
                  value={d.coach_password}
                  onChange={e => upd({ coach_password: e.target.value })}
                  placeholder="Min 8 characters"
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  style={{ position: "absolute", right: ".65rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: ".75rem", color: "#9ca3af", padding: 0 }}>
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
              {d.coach_password.length > 0 && d.coach_password.length < 8 && (
                <span style={{ fontSize: ".72rem", color: "#dc2626" }}>
                  {8 - d.coach_password.length} more character{8 - d.coach_password.length !== 1 ? "s" : ""} required
                </span>
              )}
            </label>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Step 3 — Copy Options ─────────────────────────────────────────────────────

function Step3({
  d, upd, sourceDetails,
}: {
  d:             WizardData;
  upd:           (p: Partial<WizardData>) => void;
  sourceDetails: SourceDetails | null;
}) {
  const src = sourceDetails?.school_name
    ? `${sourceDetails.school_name} ${sourceDetails.sport_name || ""}`.trim()
    : d.source_slug;

  return (
    <div>
      <SectionHeader
        title="Copy Options"
        desc={`Choose what to carry forward from ${src} into the new campaign.`}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

        {/* Default-on */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1.1rem 1.25rem" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".25rem" }}>
            Carried Forward by Default
          </div>
          <div style={{ fontSize: ".72rem", color: "#98989d", marginBottom: ".75rem" }}>
            These are enabled by default. Toggle off anything you don't want to bring forward.
          </div>
          <ToggleRow
            label="Branding"
            desc="Team colors and logo"
            checked={d.copy_branding}
            onChange={v => upd({ copy_branding: v })}
            defaultBadge="default"
          />
          <ToggleRow
            label="Feature Toggles & Layout"
            desc="Campaign section visibility and page layout (Classic / Premium)"
            checked={d.copy_feature_toggles}
            onChange={v => upd({ copy_feature_toggles: v })}
            defaultBadge="default"
          />
          <ToggleRow
            label="Fund Uses"
            desc="'Where Your Money Goes' items"
            checked={d.copy_fund_uses}
            onChange={v => upd({ copy_fund_uses: v })}
            defaultBadge="default"
          />
          <ToggleRow
            label="Sponsors"
            desc="Sponsor listings, tiers, and logos"
            checked={d.copy_sponsors}
            onChange={v => upd({ copy_sponsors: v })}
            defaultBadge="default"
          />
          <ToggleRow
            label="Contact Goals"
            desc="Team-level contact collection target"
            checked={d.copy_contact_goals}
            onChange={v => upd({ copy_contact_goals: v })}
            defaultBadge="default"
          />
        </div>

        {/* Optional */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1.1rem 1.25rem" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".25rem" }}>
            Optional
          </div>
          <div style={{ fontSize: ".72rem", color: "#98989d", marginBottom: ".75rem" }}>
            Disabled by default. Enable if you want to carry these over.
          </div>
          <ToggleRow
            label="Team Store Products"
            desc="Product listings and external store links"
            checked={d.copy_store_products}
            onChange={v => upd({ copy_store_products: v })}
            defaultBadge="optional"
          />
          <ToggleRow
            label="Calendar Events"
            desc="Scheduled events — review dates before enabling"
            checked={d.copy_calendar_events}
            onChange={v => upd({ copy_calendar_events: v })}
            defaultBadge="optional"
          />
        </div>

        {/* Never copied */}
        <div style={{ background: "#f9fafb", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1.1rem 1.25rem" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#98989d", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".5rem" }}>
            Never Copied
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
            {["Donations", "Stripe Sessions", "Athlete Registrations", "Messages", "Notifications", "Outreach History", "Analytics", "Push Subscriptions", "Accounts"].map(label => (
              <span key={label} style={{ fontSize: ".72rem", color: "#9ca3af", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: ".2rem .6rem", display: "flex", alignItems: "center", gap: ".35rem" }}>
                <span style={{ color: "#dc2626", fontWeight: 700 }}>✗</span> {label}
              </span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Step 4 — Review ───────────────────────────────────────────────────────────

function Step4({
  d, sourceDetails, launchError, launching, onLaunch,
}: {
  d:             WizardData;
  sourceDetails: SourceDetails | null;
  launchError:   string;
  launching:     boolean;
  onLaunch:      () => void;
}) {
  const newSlug = d.campaign_slug || "your-new-slug";
  const srcName = sourceDetails
    ? [sourceDetails.school_name, sourceDetails.sport_name].filter(Boolean).join(" — ")
    : d.source_slug;
  const newName = [d.school_name, d.sport_name].filter(Boolean).join(" — ") || newSlug;

  const goalStr        = d.goal_dollars ? `$${parseFloat(d.goal_dollars).toLocaleString()}` : "No team goal";
  const athleteGoalStr = d.default_athlete_goal_dollars ? `$${parseFloat(d.default_athlete_goal_dollars).toLocaleString()} per athlete` : "Not set";

  const copyItems: { label: string; on: boolean }[] = [
    { label: "Branding (colors + logo)",      on: d.copy_branding },
    { label: "Feature Toggles & Layout",       on: d.copy_feature_toggles },
    { label: "Fund Uses",                      on: d.copy_fund_uses },
    { label: "Sponsors",                       on: d.copy_sponsors },
    { label: "Contact Goals",                  on: d.copy_contact_goals },
    { label: "Store Products",                 on: d.copy_store_products },
    { label: "Calendar Events",                on: d.copy_calendar_events },
  ];

  return (
    <div>
      <SectionHeader title="Review & Launch" desc="Confirm everything before creating the duplicate campaign." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.5rem", alignItems: "start" }}>

        {/* Left: campaign flow */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Source → New */}
          <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
            {/* Source */}
            <div style={{ background: "#f9fafb", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: ".62rem", fontWeight: 700, color: "#98989d", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".35rem" }}>Source</div>
              <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#1d1d1f" }}>{srcName}</div>
              <code style={{ fontSize: ".72rem", color: "#6e6e73", fontFamily: "monospace" }}>/campaign/{d.source_slug}</code>
            </div>

            {/* Arrow */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem", color: "#c7c7cc" }}>↓</div>

            {/* New */}
            <div style={{ background: "#fff", borderRadius: 12, border: "2px solid #0b1e3d", padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: ".62rem", fontWeight: 700, color: "#0b1e3d", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".35rem" }}>New Campaign</div>
              <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#1d1d1f" }}>{newName}</div>
              <code style={{ fontSize: ".72rem", color: "#6e6e73", fontFamily: "monospace" }}>/campaign/{newSlug}</code>
            </div>
          </div>

          {/* Campaign details */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#98989d", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".6rem" }}>New Campaign Details</div>
            <ReviewRow label="Season"       value={d.season || "—"} />
            <ReviewRow label="Location"     value={d.location || "—"} />
            <ReviewRow label="Team Goal"    value={goalStr} />
            <ReviewRow label="Athlete Goal" value={athleteGoalStr} />
            <ReviewRow label="Deadline"     value={d.deadline || "Not set"} />
            <ReviewRow label="Coach"        value={d.coach_name || "—"} />
          </div>

          {/* Copy summary */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#98989d", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".6rem" }}>What Will Be Copied</div>
            <div style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              {copyItems.map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: ".6rem", fontSize: ".8rem" }}>
                  <span style={{ color: item.on ? "#16a34a" : "#d1d5db", fontWeight: 700, fontSize: ".75rem", width: 14 }}>{item.on ? "✓" : "✗"}</span>
                  <span style={{ color: item.on ? "#1d1d1f" : "#c7c7cc" }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right: launch panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "#f9fafb", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1.25rem" }}>
            <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#1d1d1f", marginBottom: ".75rem" }}>After Duplication</div>
            <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
              {[
                { label: "Campaign", path: `/campaign/${newSlug}` },
                { label: "Team Hub",  path: `/team/${newSlug}/home` },
              ].map(u => (
                <div key={u.label} style={{ display: "flex", flexDirection: "column", gap: ".2rem" }}>
                  <span style={{ fontSize: ".65rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".04em" }}>{u.label}</span>
                  <code style={{ fontSize: ".72rem", color: "#0b1e3d", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 5, padding: ".2rem .5rem" }}>{u.path}</code>
                </div>
              ))}
            </div>
          </div>

          {launchError && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: ".75rem 1rem", fontSize: ".82rem", color: "#dc2626", fontWeight: 500 }}>
              {launchError}
            </div>
          )}

          <button
            type="button"
            onClick={onLaunch}
            disabled={launching}
            style={{
              width: "100%", padding: ".85rem",
              background: launching ? "#9ca3af" : "#16a34a",
              color: "#fff", border: "none", borderRadius: 10,
              cursor: launching ? "not-allowed" : "pointer",
              fontSize: ".9rem", fontWeight: 700, letterSpacing: "-.01em",
            }}
          >
            {launching ? "Duplicating…" : "Duplicate Campaign →"}
          </button>

          <div style={{ fontSize: ".68rem", color: "#c7c7cc", textAlign: "center", lineHeight: 1.5 }}>
            Creates a new campaign from the source. Historical data remains untouched.
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Success panel ─────────────────────────────────────────────────────────────

function SuccessPanel({
  result, sourceDetails, router,
}: {
  result:        CopyResult;
  sourceDetails: SourceDetails | null;
  router:        ReturnType<typeof useRouter>;
}) {
  const [countdown, setCountdown] = useState(4);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) {
          clearInterval(timerRef.current!);
          router.push(`/admin/campaigns/${result.slug}`);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [result.slug, router]);

  const srcName = sourceDetails
    ? [sourceDetails.school_name, sourceDetails.sport_name].filter(Boolean).join(" ")
    : result.source_slug;

  const copyEntries: [string, number][] = [
    ["Fund Uses",        result.copied.fund_uses],
    ["Sponsors",         result.copied.sponsors],
    ["Contact Goals",    result.copied.contact_goals],
    ["Store Products",   result.copied.store_products],
    ["Calendar Events",  result.copied.calendar_events],
  ];
  const totalCopied = copyEntries.reduce((s, [, n]) => s + n, 0);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", padding: "2rem 1rem" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem", fontSize: "1.5rem" }}>
        ✓
      </div>
      <h2 style={{ margin: "0 0 .5rem", fontSize: "1.2rem", fontWeight: 800, color: "#1d1d1f" }}>Campaign Duplicated</h2>
      <p style={{ margin: "0 0 1.5rem", fontSize: ".85rem", color: "#6e6e73" }}>
        <strong>{srcName}</strong> → <strong>/campaign/{result.slug}</strong>
        {totalCopied > 0 && <><br />{totalCopied} item{totalCopied !== 1 ? "s" : ""} copied from source</>}
      </p>

      {/* Copy breakdown */}
      <div style={{ background: "#f9fafb", borderRadius: 10, border: "1px solid #f0f0f2", padding: ".85rem 1.25rem", marginBottom: "1.5rem", textAlign: "left" }}>
        {copyEntries.filter(([, n]) => n > 0).map(([label, n]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: ".3rem 0", fontSize: ".8rem", borderBottom: "1px solid #f5f5f7" }}>
            <span style={{ color: "#374151" }}>{label}</span>
            <span style={{ fontWeight: 700, color: "#15803d" }}>{n} copied</span>
          </div>
        ))}
        {totalCopied === 0 && (
          <div style={{ fontSize: ".78rem", color: "#98989d" }}>No child records copied (branding and flags applied).</div>
        )}
      </div>

      <button
        type="button"
        onClick={() => router.push(`/admin/campaigns/${result.slug}`)}
        style={{ padding: ".75rem 1.5rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: ".88rem", fontWeight: 700, marginBottom: ".75rem", width: "100%" }}
      >
        Go to Campaign Control Center →
      </button>
      <div style={{ fontSize: ".72rem", color: "#c7c7cc" }}>Redirecting automatically in {countdown}s…</div>
    </div>
  );
}

// ── Progress stepper ──────────────────────────────────────────────────────────

function ProgressStepper({ step }: { step: Step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: "2rem" }}>
      {([1, 2, 3, 4] as Step[]).map((s, i) => {
        const done   = s < step;
        const active = s === step;
        return (
          <React.Fragment key={s}>
            {i > 0 && <div style={{ flex: 1, height: 2, background: done ? "#0b1e3d" : "#e5e7eb", transition: "background .2s" }} />}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: ".3rem", flexShrink: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: done || active ? "#0b1e3d" : "#f3f4f6",
                border: !done && !active ? "2px solid #e5e7eb" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {done
                  ? <span style={{ color: "#fff", fontSize: ".75rem", fontWeight: 700 }}>✓</span>
                  : <span style={{ color: active ? "#fff" : "#9ca3af", fontSize: ".78rem", fontWeight: 700 }}>{s}</span>
                }
              </div>
              <span style={{ fontSize: ".62rem", fontWeight: active ? 700 : 500, color: active ? "#0b1e3d" : "#98989d", whiteSpace: "nowrap" }}>
                {STEP_LABELS[s]}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateStep(step: Step, d: WizardData, slugStatus: SlugStatus): string[] {
  const errs: string[] = [];
  if (step === 1) {
    if (!d.source_slug) errs.push("Please select a source campaign.");
  }
  if (step === 2) {
    if (!d.school_name.trim()) errs.push("School name is required.");
    if (!d.sport_name.trim())  errs.push("Sport is required.");
    const s = d.campaign_slug.trim();
    if (!s)                          errs.push("Campaign slug is required.");
    else if (s.length < 3)          errs.push("Slug must be at least 3 characters.");
    else if (!SLUG_RE.test(s))       errs.push("Slug must be lowercase letters, numbers, and hyphens only.");
    else if (slugStatus === "taken") errs.push("This slug is already in use. Choose a different one.");
    else if (slugStatus === "checking") errs.push("Slug availability is still being checked — please wait.");
    if (!d.coach_name.trim())                                 errs.push("Coach name is required.");
    if (!d.coach_email.trim() || !d.coach_email.includes("@")) errs.push("A valid coach email is required.");
    if (d.coach_password.length < 8)                          errs.push("Coach password must be at least 8 characters.");
  }
  return errs;
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function DuplicateWizard({
  campaigns, initialSourceSlug,
}: {
  campaigns:          CampaignOption[];
  initialSourceSlug:  string;
}) {
  const router = useRouter();

  const [step,          setStep]          = useState<Step>(1);
  const [d,             setD]             = useState<WizardData>({ ...BLANK, source_slug: initialSourceSlug });
  const [sourceDetails, setSourceDetails] = useState<SourceDetails | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [errors,        setErrors]        = useState<string[]>([]);
  const [slugStatus,    setSlugStatus]    = useState<SlugStatus>("idle");
  const [launching,     setLaunching]     = useState(false);
  const [launchError,   setLaunchError]   = useState("");
  const [result,        setResult]        = useState<CopyResult | null>(null);

  const upd = useCallback((patch: Partial<WizardData>) => setD(p => ({ ...p, ...patch })), []);

  // Fetch source details when source_slug changes
  const fetchSource = useCallback(async (slug: string) => {
    if (!slug) return;
    setLoadingSource(true);
    try {
      const res  = await fetch(`/api/admin/campaigns/${encodeURIComponent(slug)}`);
      const data = await res.json() as SourceDetails & { campaign_slug: string };
      if (res.ok) {
        setSourceDetails(data);
        // Pre-populate step 2 from source
        const year = NEXT_YEAR;
        setD(p => ({
          ...p,
          source_slug:                  slug,
          school_name:                  data.school_name  ?? p.school_name,
          sport_name:                   data.sport_name   ?? p.sport_name,
          mascot:                       data.mascot       ?? p.mascot,
          location:                     data.location     ?? p.location,
          season:                       suggestSeason(data.season ?? "", year),
          year,
          default_athlete_goal_dollars: data.default_athlete_goal_cents
            ? String(data.default_athlete_goal_cents / 100)
            : "",
          campaign_slug: p.slug_auto || !p.campaign_slug
            ? suggestSlug(slug, year)
            : p.campaign_slug,
          slug_auto: true,
        }));
      }
    } catch {
      // non-fatal — admin can fill manually
    }
    setLoadingSource(false);
  }, []);

  // Fetch source on initial source slug (from URL param)
  useEffect(() => {
    if (initialSourceSlug) void fetchSource(initialSourceSlug);
  }, [initialSourceSlug, fetchSource]);

  // Debounced slug check
  useEffect(() => {
    const slug = d.campaign_slug.trim();
    if (!slug) { setSlugStatus("idle"); return; }
    if (slug.length < 3 || !SLUG_RE.test(slug)) { setSlugStatus("invalid"); return; }
    setSlugStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/admin/campaigns/check-slug?slug=${encodeURIComponent(slug)}`);
        const data = await res.json() as { available?: boolean };
        setSlugStatus(data.available ? "available" : "taken");
      } catch { setSlugStatus("idle"); }
    }, 380);
    return () => clearTimeout(timer);
  }, [d.campaign_slug]);

  const selectSource = async (slug: string) => {
    upd({ source_slug: slug });
    await fetchSource(slug);
  };

  const next = () => {
    const errs = validateStep(step, d, slugStatus);
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setStep(s => Math.min(4, s + 1) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    setErrors([]);
    setStep(s => Math.max(1, s - 1) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const launch = async () => {
    const errs = validateStep(2, d, slugStatus);
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setLaunching(true);
    setLaunchError("");

    try {
      const goalCents        = d.goal_dollars ? Math.round(parseFloat(d.goal_dollars) * 100) : 0;
      const athleteGoalCents = d.default_athlete_goal_dollars
        ? Math.round(parseFloat(d.default_athlete_goal_dollars) * 100)
        : null;

      const res = await fetch("/api/admin/campaigns/duplicate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          source_slug:                d.source_slug,
          campaign_slug:              d.campaign_slug.trim(),
          school_name:                d.school_name.trim(),
          sport_name:                 d.sport_name.trim(),
          mascot:                     d.mascot.trim(),
          season:                     d.season.trim(),
          location:                   d.location.trim(),
          goal_cents:                 goalCents,
          deadline:                   d.deadline,
          default_athlete_goal_cents: athleteGoalCents,
          coach_name:                 d.coach_name.trim(),
          coach_email:                d.coach_email.trim(),
          coach_password:             d.coach_password,
          copy: {
            branding:        d.copy_branding,
            feature_toggles: d.copy_feature_toggles,
            fund_uses:       d.copy_fund_uses,
            sponsors:        d.copy_sponsors,
            contact_goals:   d.copy_contact_goals,
            store_products:  d.copy_store_products,
            calendar_events: d.copy_calendar_events,
          },
        }),
      });

      const data = await res.json() as CopyResult | { error: string };

      if (!res.ok || !("ok" in data)) {
        setLaunchError(("error" in data ? data.error : null) ?? "Duplication failed. Please try again.");
        setLaunching(false);
        return;
      }

      setResult(data as CopyResult);
    } catch {
      setLaunchError("Network error. Please check your connection and try again.");
      setLaunching(false);
    }
  };

  // Success state
  if (result) {
    return (
      <div style={{ padding: "1.75rem 2rem", maxWidth: 920, margin: "0 auto" }}>
        <SuccessPanel result={result} sourceDetails={sourceDetails} router={router} />
      </div>
    );
  }

  const backLabel: Record<Step, string> = {
    1: "← Campaigns",
    2: "← Select Source",
    3: "← New Campaign",
    4: "← Copy Options",
  };

  return (
    <div style={{ padding: "1.75rem 2rem", maxWidth: 920, margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button
          onClick={() => step === 1 ? router.push("/admin/campaigns") : back()}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".78rem", color: "#6e6e73", fontWeight: 500, padding: 0, display: "flex", alignItems: "center", gap: ".3rem", marginBottom: ".75rem" }}
        >
          {backLabel[step]}
        </button>
        <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#1d1d1f", letterSpacing: "-.02em" }}>
          Duplicate Campaign
        </h1>
        <p style={{ margin: ".3rem 0 0", fontSize: ".82rem", color: "#98989d" }}>
          Start this season's fundraiser using last year's setup.
        </p>
      </div>

      {/* Progress */}
      <ProgressStepper step={step} />

      {/* Step card */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2", padding: "1.75rem", marginBottom: "1.25rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: ".65rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".2rem" }}>
            Step {step} of 4
          </div>
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#1d1d1f" }}>
            {STEP_LABELS[step]}
          </h2>
        </div>

        {step === 1 && (
          <Step1
            campaigns={campaigns}
            selectedSlug={d.source_slug}
            onSelect={selectSource}
            loadingSource={loadingSource}
          />
        )}
        {step === 2 && <Step2 d={d} upd={upd} slugStatus={slugStatus} />}
        {step === 3 && <Step3 d={d} upd={upd} sourceDetails={sourceDetails} />}
        {step === 4 && (
          <Step4
            d={d}
            sourceDetails={sourceDetails}
            launchError={launchError}
            launching={launching}
            onLaunch={launch}
          />
        )}
      </div>

      {/* Error banner */}
      <ErrorBanner errors={errors} />

      {/* Nav bar */}
      {step < 4 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 0" }}>
          <Btn
            onClick={() => step === 1 ? router.push("/admin/campaigns") : back()}
            color="#6e6e73"
            variant="outline"
          >
            {step === 1 ? "← Cancel" : "← Back"}
          </Btn>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
            <span style={{ fontSize: ".72rem", color: "#c7c7cc" }}>Step {step} of 4</span>
            <Btn
              onClick={next}
              disabled={step === 1 && !d.source_slug}
              color="#0b1e3d"
            >
              {step === 3 ? "Review →" : "Next →"}
            </Btn>
          </div>
        </div>
      )}
      {step === 4 && (
        <div style={{ padding: "1rem 0" }}>
          <Btn onClick={back} color="#6e6e73" variant="outline">← Back to Copy Options</Btn>
        </div>
      )}

    </div>
  );
}
