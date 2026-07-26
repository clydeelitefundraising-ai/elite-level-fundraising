"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import CoachSearchSelect, { type CoachSearchResult } from "./CoachSearchSelect";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;
type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

// Seed values for launching a campaign from a qualified Coach CRM contact.
// Populated server-side (page.tsx) from an admin-authenticated CRM lookup —
// never trust these as proof of the CRM association on their own; the
// onboard route independently re-validates contactId server-side too.
export type CrmSeed = {
  contactId:  string;
  schoolName: string;
  sportName:  string;
  coachName:  string;
  coachEmail: string;
};

type WizardData = {
  // Step 1 — Team Info
  school_name:   string;
  sport_name:    string;
  mascot:        string;
  season:        string;
  year:          string;
  city:          string;
  state:         string;
  campaign_slug: string;
  slug_auto:     boolean;
  // Step 2 — Branding
  primary_color:   string;
  secondary_color: string;
  logo_url:        string;
  // Step 3 — Fundraising
  goal_dollars:                 string;
  default_athlete_goal_dollars: string;
  deadline:                     string;
  contact_goal:                 string;
  seed_fund_uses:               boolean;
  // Step 4 — Features
  layout_variant:        "classic" | "premium";
  show_donation_card:    boolean;
  show_leaderboard:      boolean;
  show_program_identity: boolean;
  show_share_section:    boolean;
  show_fund_uses:        boolean;
  show_recent_donations: boolean;
  show_sponsors:         boolean;
  // Step 5 — Review + Coach
  coach_mode:     "new" | "existing";
  coach_name:     string;
  coach_email:    string;
  coach_password: string;
  existing_coach: CoachSearchResult | null;
  // Set only right after a duplicate-email rejection offers to switch modes
  // with that account preselected — consumed once by CoachSearchSelect.
  existing_coach_preselect_id: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const NEXT_YEAR = String(new Date().getFullYear() + 1);

const BLANK: WizardData = {
  school_name: "", sport_name: "", mascot: "", season: "", year: NEXT_YEAR,
  city: "", state: "", campaign_slug: "", slug_auto: true,
  primary_color: "#1B4FA8", secondary_color: "#C4A35A", logo_url: "",
  goal_dollars: "", default_athlete_goal_dollars: "", deadline: "", contact_goal: "10", seed_fund_uses: true,
  layout_variant: "classic",
  show_donation_card: true, show_leaderboard: true, show_program_identity: true,
  show_share_section: true, show_fund_uses: true, show_recent_donations: true, show_sponsors: true,
  coach_mode: "new", coach_name: "", coach_email: "", coach_password: "",
  existing_coach: null, existing_coach_preselect_id: null,
};

const STEP_LABELS: Record<Step, string> = {
  1: "Team Info",
  2: "Branding",
  3: "Fundraising",
  4: "Features",
  5: "Review",
};

const HEX_RE  = /^#[0-9a-fA-F]{6}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

// ── Slug generation ───────────────────────────────────────────────────────────

function generateSlug(school: string, sport: string, year: string): string {
  const clean = (s: string) =>
    s.toLowerCase()
      .replace(/\b(high school|high|school|academy|middle|junior|prep|varsity|boys|girls|mens|womens)\b/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");

  const parts = [clean(school), clean(sport), year.trim()].filter(s => s.length > 0);
  return parts.join("-").slice(0, 60).replace(/-+$/, "");
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  input:   { padding: ".5rem .75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".875rem", color: "#1d1d1f", background: "#fff", width: "100%", boxSizing: "border-box" as const, outline: "none" },
  label:   { display: "flex" as const, flexDirection: "column" as const, gap: ".35rem", fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase" as const, letterSpacing: ".04em" },
  card:    { background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2", padding: "1.5rem", marginBottom: "1rem" } as React.CSSProperties,
  muted:   { fontSize: ".72rem", color: "#98989d", fontWeight: 400, textTransform: "none" as const, letterSpacing: 0 },
  grid2:   { display: "grid" as const, gridTemplateColumns: "1fr 1fr" as const, gap: "1rem" },
  section: { marginBottom: "1.25rem", paddingBottom: "1rem", borderBottom: "1px solid #f5f5f7" } as React.CSSProperties,
};

import React from "react";

// ── Shared components ─────────────────────────────────────────────────────────

function Btn({
  onClick, disabled = false, color = "#0b1e3d", variant = "solid", children, type = "button",
}: {
  onClick?: () => void; disabled?: boolean; color?: string;
  variant?: "solid" | "outline"; children: React.ReactNode; type?: "button" | "submit";
}) {
  const solid = variant === "solid";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: ".5rem 1.1rem",
        background: disabled ? "#e5e7eb" : solid ? color : "transparent",
        color: disabled ? "#9ca3af" : solid ? "#fff" : color,
        border: solid ? "none" : `1.5px solid ${color}`,
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: ".82rem",
        fontWeight: 600,
        whiteSpace: "nowrap" as const,
      }}
    >
      {children}
    </button>
  );
}

function FieldNote({ children }: { children: React.ReactNode }) {
  return <span style={{ ...T.muted }}>{children}</span>;
}

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={T.section}>
      <div style={{ fontSize: ".88rem", fontWeight: 700, color: "#1d1d1f" }}>{title}</div>
      {desc && <div style={{ fontSize: ".75rem", color: "#98989d", marginTop: ".2rem" }}>{desc}</div>}
    </div>
  );
}

function ColorField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={T.label}>
      {label}
      <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
        <input
          type="color"
          value={HEX_RE.test(value) ? value : "#000000"}
          onChange={e => onChange(e.target.value)}
          style={{ width: 40, height: 38, border: "1px solid #d1d5db", borderRadius: 8, cursor: "pointer", padding: 2, flexShrink: 0, background: "none" }}
        />
        <input
          style={T.input}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          maxLength={7}
        />
      </div>
    </label>
  );
}

function ToggleRow({
  label, desc, checked, onChange,
}: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".6rem 0", borderBottom: "1px solid #f5f5f7" }}>
      <div>
        <div style={{ fontSize: ".82rem", fontWeight: 500, color: "#1d1d1f" }}>{label}</div>
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

function SlugIndicator({ status }: { status: SlugStatus }) {
  if (status === "idle")      return null;
  if (status === "checking")  return <span style={{ fontSize: ".72rem", color: "#98989d" }}>Checking…</span>;
  if (status === "available") return <span style={{ fontSize: ".72rem", color: "#15803d", fontWeight: 600 }}>✓ Available</span>;
  if (status === "taken")     return <span style={{ fontSize: ".72rem", color: "#dc2626", fontWeight: 600 }}>✗ Already in use</span>;
  if (status === "invalid")   return <span style={{ fontSize: ".72rem", color: "#d97706" }}>Lowercase letters, numbers, and hyphens only</span>;
  return null;
}

function ErrorBanner({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: ".85rem 1.1rem", marginBottom: "1rem" }}>
      {errors.map((e, i) => (
        <div key={i} style={{ fontSize: ".82rem", color: "#dc2626", fontWeight: 500, ...(i > 0 ? { marginTop: ".35rem" } : {}) }}>
          {e}
        </div>
      ))}
    </div>
  );
}

// ── Step 1 – Team Info ────────────────────────────────────────────────────────

function Step1({
  d, upd, slugStatus,
}: {
  d: WizardData;
  upd: (p: Partial<WizardData>) => void;
  slugStatus: SlugStatus;
}) {
  return (
    <div>
      <SectionHeader
        title="Team Information"
        desc="Basic details that identify your program. These appear on the campaign page and team hub."
      />

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
          Year
          <input style={T.input} value={d.year} type="number" min="2020" max="2040"
            onChange={e => upd({ year: e.target.value })}
            placeholder={NEXT_YEAR} />
        </label>
        <label style={{ ...T.label, gridColumn: "1 / -1" }}>
          Season
          <input style={T.input} value={d.season}
            onChange={e => upd({ season: e.target.value })}
            placeholder={`e.g. ${NEXT_YEAR} Season`} />
          <FieldNote>Appears on the campaign page header (e.g. "2026 Season")</FieldNote>
        </label>
        <label style={T.label}>
          City *
          <input style={T.input} value={d.city}
            onChange={e => upd({ city: e.target.value })}
            placeholder="e.g. Mesa" />
        </label>
        <label style={T.label}>
          State
          <input style={T.input} value={d.state}
            onChange={e => upd({ state: e.target.value })}
            placeholder="e.g. AZ" maxLength={2} />
        </label>
      </div>

      <div style={{ marginTop: "1.5rem", padding: "1.25rem", background: "#f9fafb", borderRadius: 10, border: "1px solid #f0f0f2" }}>
        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".75rem" }}>
          Campaign URL Slug
        </div>
        <label style={{ ...T.label, textTransform: "none", letterSpacing: 0, fontSize: ".82rem", fontWeight: 500, color: "#374151" }}>
          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <span style={{ fontSize: ".82rem", color: "#98989d", flexShrink: 0 }}>/campaign/</span>
            <input
              style={{ ...T.input, fontFamily: "monospace", fontWeight: 600 }}
              value={d.campaign_slug}
              placeholder="your-slug-here"
              onChange={e => {
                const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                upd({ campaign_slug: v, slug_auto: false });
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: ".4rem" }}>
            <SlugIndicator status={slugStatus} />
            {!d.slug_auto && (
              <button type="button" onClick={() => upd({ slug_auto: true })}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", color: "#6366f1", fontWeight: 600, padding: 0, flexShrink: 0 }}>
                ↺ Auto-generate
              </button>
            )}
          </div>
        </label>
        <div style={{ fontSize: ".72rem", color: "#98989d", marginTop: ".5rem" }}>
          Lowercase letters, numbers, hyphens. Auto-generated from school name + sport + year.
        </div>
      </div>
    </div>
  );
}

// ── Step 2 – Branding ─────────────────────────────────────────────────────────

function Step2({
  d, upd,
}: {
  d: WizardData;
  upd: (p: Partial<WizardData>) => void;
}) {
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError,     setLogoError]     = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadLogo = async (file: File) => {
    setLogoError(""); setLogoUploading(true);
    const fd = new FormData(); fd.append("logo", file);
    const res  = await fetch("/api/admin/logo-upload", { method: "POST", body: fd });
    const data = await res.json();
    setLogoUploading(false);
    if (!res.ok) { setLogoError(data.error ?? "Upload failed."); return; }
    upd({ logo_url: data.url as string });
  };

  const preview = {
    bg:   HEX_RE.test(d.primary_color)   ? d.primary_color   : "#1B4FA8",
    sec:  HEX_RE.test(d.secondary_color) ? d.secondary_color : "#C4A35A",
    name: d.school_name  || "School Name",
    sport: d.sport_name  || "Sport",
    mascot: d.mascot     || "Mascot",
    season: d.season     || "Season",
  };

  return (
    <div>
      <SectionHeader
        title="Branding"
        desc="Colors and logo that appear across the campaign page and team hub."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: "2rem", alignItems: "start" }}>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <div style={T.grid2}>
            <ColorField label="Primary Color" value={d.primary_color}
              onChange={v => upd({ primary_color: v })} />
            <ColorField label="Secondary Color" value={d.secondary_color}
              onChange={v => upd({ secondary_color: v })} />
          </div>

          {/* Color bar */}
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 32 }}>
            <div style={{ flex: 1, background: preview.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: ".65rem", fontWeight: 700, color: "#fff", opacity: .85 }}>Primary · {d.primary_color}</span>
            </div>
            <div style={{ flex: 1, background: preview.sec, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: ".65rem", fontWeight: 700, color: "#fff", opacity: .85 }}>Secondary · {d.secondary_color}</span>
            </div>
          </div>

          {/* Logo upload */}
          <div>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".5rem" }}>Logo</div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ""; }} />

            <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
              {d.logo_url ? (
                <img src={d.logo_url} alt="Logo" style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 8, border: "1px solid #f0f0f2", background: "#f9fafb", padding: 4, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 8, border: "2px dashed #d1d5db", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: "1.25rem", opacity: .35 }}>🖼</span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
                <Btn onClick={() => fileRef.current?.click()} disabled={logoUploading} color="#0b1e3d">
                  {logoUploading ? "Uploading…" : d.logo_url ? "Change Logo" : "Upload Logo"}
                </Btn>
                <span style={{ fontSize: ".7rem", color: "#98989d" }}>JPEG, PNG, WebP, SVG · max 5 MB</span>
              </div>
              {d.logo_url && (
                <Btn onClick={() => upd({ logo_url: "" })} color="#dc2626" variant="outline">Remove</Btn>
              )}
            </div>
            {logoError && <div style={{ fontSize: ".78rem", color: "#dc2626", marginTop: ".5rem" }}>{logoError}</div>}
          </div>
        </div>

        {/* Live preview */}
        <div>
          <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#98989d", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".5rem" }}>Live Preview</div>
          <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,.1)" }}>
            <div style={{ background: preview.bg, padding: "1.1rem" }}>
              {d.logo_url && (
                <img src={d.logo_url} alt="" style={{ width: 40, height: 40, objectFit: "contain", marginBottom: ".5rem", display: "block", borderRadius: 4 }} />
              )}
              <div style={{ fontSize: ".6rem", color: "rgba(255,255,255,.6)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".2rem" }}>
                {[d.city, d.state].filter(Boolean).join(", ") || "City, State"}
              </div>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "#fff", lineHeight: 1.2 }}>
                {preview.name}
              </div>
              <div style={{ fontSize: ".75rem", color: "rgba(255,255,255,.75)", marginTop: ".25rem" }}>
                {preview.mascot} · {preview.sport}
              </div>
            </div>
            <div style={{ background: preview.sec, padding: ".4rem 1.1rem" }}>
              <span style={{ fontSize: ".65rem", fontWeight: 700, color: "#fff", letterSpacing: ".06em", textTransform: "uppercase" }}>
                {preview.season}
              </span>
            </div>
            <div style={{ background: "#fff", padding: ".75rem 1.1rem" }}>
              <div style={{ height: 8, background: "#f0f0f2", borderRadius: 4, marginBottom: ".5rem" }} />
              <div style={{ height: 6, background: "#f0f0f2", borderRadius: 4, width: "70%" }} />
            </div>
          </div>
          <div style={{ fontSize: ".65rem", color: "#c7c7cc", textAlign: "center", marginTop: ".5rem" }}>Campaign page preview</div>
        </div>
      </div>
    </div>
  );
}

// ── Step 3 – Fundraising ──────────────────────────────────────────────────────

function Step3({
  d, upd,
}: {
  d: WizardData;
  upd: (p: Partial<WizardData>) => void;
}) {
  return (
    <div>
      <SectionHeader
        title="Fundraising Configuration"
        desc="Set goals, timeline, and contact collection targets."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

        <div style={T.grid2}>
          <label style={T.label}>
            Fundraising Goal ($)
            <FieldNote>Optional. Leave blank to run without a goal.</FieldNote>
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
          <label style={T.label}>
            Campaign Deadline
            <FieldNote>The date the fundraiser ends.</FieldNote>
            <input type="date" style={T.input}
              value={d.deadline}
              onChange={e => upd({ deadline: e.target.value })} />
          </label>
          <label style={T.label}>
            Contact Goal (per athlete)
            <FieldNote>How many contacts each athlete should collect.</FieldNote>
            <input type="number" min="1" max="500" style={T.input}
              value={d.contact_goal}
              onChange={e => upd({ contact_goal: e.target.value })}
              placeholder="10" />
          </label>
        </div>

        <div style={{ padding: "1.1rem 1.25rem", background: "#f9fafb", borderRadius: 10, border: "1px solid #f0f0f2" }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: ".75rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={d.seed_fund_uses}
              onChange={e => upd({ seed_fund_uses: e.target.checked })}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: "#0b1e3d", flexShrink: 0, cursor: "pointer" }}
            />
            <div>
              <div style={{ fontSize: ".875rem", fontWeight: 600, color: "#1d1d1f" }}>
                Pre-fill "Where Your Money Goes" section
              </div>
              <div style={{ fontSize: ".75rem", color: "#98989d", marginTop: ".2rem" }}>
                Adds 6 default fund use items (travel, entry fees, equipment, uniforms, recovery tools, meals). You can edit or remove them anytime.
              </div>
            </div>
          </label>
        </div>

      </div>
    </div>
  );
}

// ── Step 4 – Features ─────────────────────────────────────────────────────────

function Step4({
  d, upd,
}: {
  d: WizardData;
  upd: (p: Partial<WizardData>) => void;
}) {
  return (
    <div>
      <SectionHeader
        title="Campaign Features"
        desc="Choose which sections appear on the public campaign page. All settings can be changed later from the Campaign Control Center."
      />

      {/* Layout variant */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".65rem" }}>
          Page Layout
        </div>
        <div style={{ display: "flex", gap: ".75rem" }}>
          {(["classic", "premium"] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => upd({ layout_variant: v })}
              style={{
                flex: 1,
                padding: "1rem",
                borderRadius: 10,
                border: `2px solid ${d.layout_variant === v ? "#0b1e3d" : "#e5e7eb"}`,
                background: d.layout_variant === v ? "#eff0f3" : "#fff",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: ".88rem", fontWeight: 700, color: "#1d1d1f", marginBottom: ".25rem", textTransform: "capitalize" }}>{v}</div>
              <div style={{ fontSize: ".72rem", color: "#98989d" }}>
                {v === "classic"
                  ? "Standard single-column layout. Works great for all programs."
                  : "Full-width premium layout with enhanced visual presentation."}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Section toggles */}
      <div>
        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".5rem" }}>
          Campaign Page Sections
        </div>
        <ToggleRow label="Donation Card"        desc="The main donation form"                   checked={d.show_donation_card}    onChange={v => upd({ show_donation_card: v })} />
        <ToggleRow label="Athlete Leaderboard"  desc="Ranked list of athletes by funds raised"  checked={d.show_leaderboard}      onChange={v => upd({ show_leaderboard: v })} />
        <ToggleRow label="Program Identity"     desc="School name, mascot, and program header"  checked={d.show_program_identity} onChange={v => upd({ show_program_identity: v })} />
        <ToggleRow label="Share This Campaign"  desc="Social share links and QR code"           checked={d.show_share_section}    onChange={v => upd({ show_share_section: v })} />
        <ToggleRow label="Where Your Money Goes" desc="Fund use breakdown"                      checked={d.show_fund_uses}        onChange={v => upd({ show_fund_uses: v })} />
        <ToggleRow label="Recent Donations Feed" desc="Live feed of recent donors"              checked={d.show_recent_donations} onChange={v => upd({ show_recent_donations: v })} />
        <ToggleRow label="Sponsors"             desc="Sponsor logos and tier listings"          checked={d.show_sponsors}         onChange={v => upd({ show_sponsors: v })} />
      </div>
    </div>
  );
}

// ── Step 5 – Review & Launch ──────────────────────────────────────────────────

function Step5({
  d, upd, launchError, launching, onLaunch, duplicateAccount, onUseDuplicateAccount,
}: {
  d: WizardData;
  upd: (p: Partial<WizardData>) => void;
  launchError: string;
  launching: boolean;
  onLaunch: () => void;
  duplicateAccount: { id: string; name: string; email: string } | null;
  onUseDuplicateAccount: () => void;
}) {
  const [showPw, setShowPw] = useState(false);
  const slug     = d.campaign_slug || "your-slug";
  const location = [d.city.trim(), d.state.trim()].filter(Boolean).join(", ");
  const goalStr  = d.goal_dollars ? `$${parseFloat(d.goal_dollars).toLocaleString()}` : "No team goal";
  const athleteGoalStr = d.default_athlete_goal_dollars ? `$${parseFloat(d.default_athlete_goal_dollars).toLocaleString()} per athlete` : "Not set";

  const enabledSections = [
    d.show_donation_card    && "Donation Card",
    d.show_leaderboard      && "Leaderboard",
    d.show_program_identity && "Program Identity",
    d.show_share_section    && "Share Section",
    d.show_fund_uses        && "Fund Uses",
    d.show_recent_donations && "Recent Donations",
    d.show_sponsors         && "Sponsors",
  ].filter(Boolean) as string[];

  return (
    <div>
      <SectionHeader
        title="Review & Launch"
        desc="Confirm your campaign settings and create the head coach account."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.5rem", alignItems: "start" }}>

        {/* ── Left: Summary ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Campaign identity */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0f0f2", overflow: "hidden" }}>
            <div style={{ height: 5, background: `linear-gradient(90deg, ${HEX_RE.test(d.primary_color) ? d.primary_color : "#1B4FA8"}, ${HEX_RE.test(d.secondary_color) ? d.secondary_color : "#C4A35A"})` }} />
            <div style={{ padding: "1rem 1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: ".75rem" }}>
                {d.logo_url && (
                  <img src={d.logo_url} alt="" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 6, background: "#f5f5f7", padding: 3 }} />
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: ".95rem", color: "#1d1d1f" }}>{d.school_name || "—"}</div>
                  <div style={{ fontSize: ".75rem", color: "#98989d" }}>
                    {[d.sport_name, d.mascot].filter(Boolean).join(" · ")} {d.season && `· ${d.season}`}
                  </div>
                </div>
              </div>
              <ReviewRow label="Slug"      value={<code style={{ fontFamily: "monospace", fontSize: ".78rem", background: "#f3f4f6", padding: ".1rem .4rem", borderRadius: 4 }}>{slug}</code>} />
              {location && <ReviewRow label="Location" value={location} />}
            </div>
          </div>

          {/* Fundraising summary */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#98989d", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".6rem" }}>Fundraising</div>
            <ReviewRow label="Team Goal"          value={goalStr} />
            <ReviewRow label="Athlete Goal"        value={athleteGoalStr} />
            <ReviewRow label="Deadline"            value={d.deadline || "Not set"} />
            <ReviewRow label="Contact Goal"        value={`${d.contact_goal || 10} contacts/athlete`} />
            <ReviewRow label="Layout"              value={d.layout_variant === "premium" ? "Premium" : "Classic"} />
            <ReviewRow label="Pre-fill Fund Uses"  value={d.seed_fund_uses ? "Yes" : "No"} />
          </div>

          {/* Head coach summary */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#98989d", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".6rem" }}>Head Coach</div>
            {d.coach_mode === "existing" ? (
              d.existing_coach ? (
                <>
                  <ReviewRow label="Mode"  value="Existing Coach Account" />
                  <ReviewRow label="Coach" value={d.existing_coach.name} />
                  <ReviewRow label="Email" value={d.existing_coach.email} />
                  <div style={{ fontSize: ".72rem", color: "#15803d", marginTop: ".4rem" }}>
                    This coach will use their current ELF login.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: ".78rem", color: "#98989d" }}>No coach selected yet.</div>
              )
            ) : (
              <>
                <ReviewRow label="Mode"  value="New Account" />
                <ReviewRow label="Coach" value={d.coach_name || "—"} />
                <ReviewRow label="Email" value={d.coach_email || "—"} />
                <div style={{ fontSize: ".72rem", color: "#98989d", marginTop: ".4rem" }}>
                  A temporary password will be emailed to this address.
                </div>
              </>
            )}
          </div>

          {/* Features summary */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#98989d", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".6rem" }}>Enabled Sections</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".35rem" }}>
              {enabledSections.map(s => (
                <span key={s} style={{ padding: ".2rem .55rem", background: "#dcfce7", color: "#15803d", borderRadius: 6, fontSize: ".72rem", fontWeight: 600 }}>
                  {s}
                </span>
              ))}
              {enabledSections.length === 0 && (
                <span style={{ fontSize: ".78rem", color: "#98989d" }}>All sections disabled</span>
              )}
            </div>
          </div>

          {/* URLs preview */}
          <div style={{ background: "#f9fafb", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#98989d", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".6rem" }}>After Launch</div>
            <div style={{ display: "flex", flexDirection: "column", gap: ".45rem" }}>
              {[
                { label: "Campaign Page", path: `/campaign/${slug}` },
                { label: "Team Hub",      path: `/team/${slug}/home` },
                { label: "Join Path",     path: `/join/{code}` },
              ].map(u => (
                <div key={u.label} style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                  <span style={{ fontSize: ".68rem", fontWeight: 600, color: "#98989d", minWidth: 96 }}>{u.label}</span>
                  <code style={{ fontSize: ".72rem", color: "#0b1e3d", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 5, padding: ".15rem .45rem" }}>{u.path}</code>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── Right: Coach form + Launch ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #f0f0f2", padding: "1.25rem" }}>
            <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#1d1d1f", marginBottom: ".2rem" }}>Head Coach Account</div>
            <div style={{ fontSize: ".72rem", color: "#98989d", marginBottom: "1rem" }}>
              {d.coach_mode === "existing"
                ? "Assign a coach who already has an ELF account. They will use their current login for this team."
                : "Creates login credentials for the team hub. The coach can reset their password after first login."}
            </div>

            {/* Mode toggle — matches the two-button style already used for
                Page Layout in Step 4 of this same wizard. */}
            <div style={{ display: "flex", gap: ".5rem", marginBottom: "1.1rem" }}>
              {([
                { id: "new" as const,      label: "Create New Coach" },
                { id: "existing" as const, label: "Select Existing Coach" },
              ]).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => upd({ coach_mode: opt.id })}
                  style={{
                    flex: 1, padding: ".55rem .5rem", borderRadius: 8,
                    border: `2px solid ${d.coach_mode === opt.id ? "#0b1e3d" : "#e5e7eb"}`,
                    background: d.coach_mode === opt.id ? "#eff0f3" : "#fff",
                    cursor: "pointer", fontSize: ".76rem", fontWeight: 700,
                    color: d.coach_mode === opt.id ? "#0b1e3d" : "#6e6e73",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {d.coach_mode === "existing" ? (
              <div>
                <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#1d1d1f", marginBottom: ".3rem" }}>
                  Choose an Existing Coach
                </div>
                <CoachSearchSelect
                  selected={d.existing_coach}
                  onSelect={account => upd({ existing_coach: account, existing_coach_preselect_id: null })}
                  initialAccountId={d.existing_coach_preselect_id}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
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
                <label style={T.label}>
                  Temporary Password *
                  <FieldNote>Min 8 characters. Share securely — cannot be recovered.</FieldNote>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPw ? "text" : "password"}
                      style={{ ...T.input, paddingRight: "2.5rem" }}
                      value={d.coach_password}
                      onChange={e => upd({ coach_password: e.target.value })}
                      placeholder="Min 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(p => !p)}
                      style={{ position: "absolute", right: ".65rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: ".75rem", color: "#9ca3af", padding: 0 }}>
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                  {d.coach_password.length > 0 && d.coach_password.length < 8 && (
                    <span style={{ fontSize: ".72rem", color: "#dc2626" }}>{8 - d.coach_password.length} more character{8 - d.coach_password.length !== 1 ? "s" : ""} required</span>
                  )}
                </label>
              </div>
            )}
          </div>

          {launchError && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: ".75rem 1rem" }}>
              <div style={{ fontSize: ".82rem", color: "#dc2626", fontWeight: 500 }}>{launchError}</div>
              {duplicateAccount && (
                <button
                  type="button"
                  onClick={onUseDuplicateAccount}
                  style={{ marginTop: ".6rem", background: "#fff", border: "1px solid #dc2626", borderRadius: 7, cursor: "pointer", fontSize: ".76rem", color: "#dc2626", fontWeight: 700, padding: ".4rem .8rem" }}
                >
                  Use this existing coach instead
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onLaunch}
            disabled={launching}
            style={{
              width: "100%",
              padding: ".85rem",
              background: launching ? "#9ca3af" : "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              cursor: launching ? "not-allowed" : "pointer",
              fontSize: ".9rem",
              fontWeight: 700,
              letterSpacing: "-.01em",
            }}
          >
            {launching ? "Creating campaign…" : "Launch Campaign →"}
          </button>

          <div style={{ fontSize: ".68rem", color: "#c7c7cc", textAlign: "center", lineHeight: 1.5 }}>
            Creates campaign settings, coach account, join code, and fund use items. You will be taken to the Campaign Control Center.
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Progress indicator ────────────────────────────────────────────────────────

function ProgressStepper({ step }: { step: Step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: "2rem" }}>
      {([1, 2, 3, 4, 5] as Step[]).map((s, i) => {
        const done    = s < step;
        const active  = s === step;
        const future  = s > step;
        return (
          <React.Fragment key={s}>
            {i > 0 && (
              <div style={{ flex: 1, height: 2, background: done ? "#0b1e3d" : "#e5e7eb", transition: "background .2s" }} />
            )}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: ".3rem", flexShrink: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: done ? "#0b1e3d" : active ? "#0b1e3d" : "#f3f4f6",
                border: future ? "2px solid #e5e7eb" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background .2s",
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
    if (!d.school_name.trim()) errs.push("School name is required.");
    if (!d.sport_name.trim())  errs.push("Sport is required.");
    if (!d.city.trim())        errs.push("City is required.");
    const slug = d.campaign_slug.trim();
    if (!slug)                           errs.push("Campaign slug is required.");
    else if (slug.length < 3)            errs.push("Slug must be at least 3 characters.");
    else if (!SLUG_RE.test(slug))        errs.push("Slug must be lowercase letters, numbers, and hyphens only.");
    else if (slugStatus === "taken")     errs.push("This slug is already in use. Choose a different one.");
    else if (slugStatus === "checking")  errs.push("Slug availability is still being checked — please wait a moment.");
    else if (slugStatus === "invalid")   errs.push("Slug format is invalid.");
  }
  if (step === 2) {
    if (!HEX_RE.test(d.primary_color))   errs.push("Primary color must be a valid hex color (e.g. #1B4FA8).");
    if (!HEX_RE.test(d.secondary_color)) errs.push("Secondary color must be a valid hex color (e.g. #C4A35A).");
  }
  if (step === 5) {
    if (d.coach_mode === "existing") {
      if (!d.existing_coach) errs.push("Select an existing coach to assign as head coach.");
    } else {
      if (!d.coach_name.trim())                          errs.push("Coach name is required.");
      if (!d.coach_email.trim() || !d.coach_email.includes("@")) errs.push("A valid coach email address is required.");
      if (d.coach_password.length < 8)                   errs.push("Coach password must be at least 8 characters.");
    }
  }
  return errs;
}

// ── Org defaults type ─────────────────────────────────────────────────────────

type OrgDefaults = {
  primary_color?:                  string;
  secondary_color?:                string;
  logo_url?:                       string;
  default_layout?:                 string;
  default_fundraising_goal_cents?: number;
  default_athlete_goal_cents?:     number;
  default_contact_goal?:           number;
  default_show_leaderboard?:       boolean;
  default_show_program_identity?:  boolean;
  default_show_share_section?:     boolean;
  default_show_fund_uses?:         boolean;
  default_show_recent_donations?:  boolean;
  default_show_sponsors?:          boolean;
  default_show_donation_card?:     boolean;
};

function buildInitial(org: OrgDefaults, crmSeed: CrmSeed | null): WizardData {
  return {
    ...BLANK,
    school_name:                  crmSeed?.schoolName || BLANK.school_name,
    sport_name:                   crmSeed?.sportName  || BLANK.sport_name,
    coach_name:                   crmSeed?.coachName  || BLANK.coach_name,
    coach_email:                  crmSeed?.coachEmail || BLANK.coach_email,
    primary_color:                org.primary_color   ?? BLANK.primary_color,
    secondary_color:              org.secondary_color ?? BLANK.secondary_color,
    logo_url:                     org.logo_url        ?? BLANK.logo_url,
    layout_variant:               (org.default_layout === "premium" ? "premium" : BLANK.layout_variant),
    goal_dollars:                 org.default_fundraising_goal_cents
      ? String(org.default_fundraising_goal_cents / 100)
      : BLANK.goal_dollars,
    default_athlete_goal_dollars: org.default_athlete_goal_cents
      ? String(org.default_athlete_goal_cents / 100)
      : BLANK.default_athlete_goal_dollars,
    contact_goal:                 org.default_contact_goal != null
      ? String(org.default_contact_goal)
      : BLANK.contact_goal,
    show_leaderboard:       org.default_show_leaderboard       ?? BLANK.show_leaderboard,
    show_program_identity:  org.default_show_program_identity  ?? BLANK.show_program_identity,
    show_share_section:     org.default_show_share_section     ?? BLANK.show_share_section,
    show_fund_uses:         org.default_show_fund_uses         ?? BLANK.show_fund_uses,
    show_recent_donations:  org.default_show_recent_donations  ?? BLANK.show_recent_donations,
    show_sponsors:          org.default_show_sponsors          ?? BLANK.show_sponsors,
    show_donation_card:     org.default_show_donation_card     ?? BLANK.show_donation_card,
  };
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export default function NewCampaignWizard({
  orgDefaults = {}, crmSeed = null,
}: { orgDefaults?: OrgDefaults; crmSeed?: CrmSeed | null }) {
  const router = useRouter();

  const [step,        setStep]        = useState<Step>(1);
  const [d,           setD]           = useState<WizardData>(() => buildInitial(orgDefaults, crmSeed));
  const [errors,      setErrors]      = useState<string[]>([]);
  const [slugStatus,  setSlugStatus]  = useState<SlugStatus>("idle");
  const [launching,   setLaunching]   = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [duplicateAccount, setDuplicateAccount] = useState<{ id: string; name: string; email: string } | null>(null);

  const upd = useCallback((patch: Partial<WizardData>) => setD(p => ({ ...p, ...patch })), []);

  // Auto-generate slug when school/sport/year change
  useEffect(() => {
    if (!d.slug_auto) return;
    const slug = generateSlug(d.school_name, d.sport_name, d.year);
    setD(p => ({ ...p, campaign_slug: slug }));
  }, [d.school_name, d.sport_name, d.year, d.slug_auto]);

  // Debounced slug availability check
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
      } catch {
        setSlugStatus("idle");
      }
    }, 380);
    return () => clearTimeout(timer);
  }, [d.campaign_slug]);

  const next = () => {
    const errs = validateStep(step, d, slugStatus);
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setStep(s => Math.min(5, s + 1) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    setErrors([]);
    setStep(s => Math.max(1, s - 1) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToStep = (target: Step) => {
    if (target >= step) return;
    setErrors([]);
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const launch = async () => {
    const errs = validateStep(5, d, slugStatus);
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setLaunching(true);
    setLaunchError("");
    setDuplicateAccount(null);

    try {
      const location  = [d.city.trim(), d.state.trim()].filter(Boolean).join(", ");
      const goalCents = d.goal_dollars ? Math.round(parseFloat(d.goal_dollars) * 100) : 0;
      const athleteGoalCents = d.default_athlete_goal_dollars
        ? Math.round(parseFloat(d.default_athlete_goal_dollars) * 100)
        : null;

      const res = await fetch("/api/admin/onboard", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          campaign_slug:              d.campaign_slug.trim(),
          school_name:                d.school_name.trim(),
          sport_name:                 d.sport_name.trim(),
          mascot:                     d.mascot.trim(),
          season:                     d.season.trim(),
          location,
          primary_color:              d.primary_color,
          secondary_color:            d.secondary_color,
          logo_url:                   d.logo_url,
          goal_cents:                 goalCents,
          deadline:                   d.deadline,
          default_athlete_goal_cents: athleteGoalCents,
          contact_goal:               parseInt(d.contact_goal, 10) || 10,
          show_leaderboard:           d.show_leaderboard,
          show_program_identity:      d.show_program_identity,
          show_share_section:         d.show_share_section,
          show_fund_uses:             d.show_fund_uses,
          show_recent_donations:      d.show_recent_donations,
          show_sponsors:              d.show_sponsors,
          show_donation_card:         d.show_donation_card,
          layout_variant:             d.layout_variant,
          seed_fund_uses:             d.seed_fund_uses,
          coach_mode:                 d.coach_mode,
          ...(d.coach_mode === "existing"
            ? { existing_coach_account_id: d.existing_coach?.id ?? "" }
            : { coach_name: d.coach_name.trim(), coach_email: d.coach_email.trim(), coach_password: d.coach_password }),
          starter_athletes:           [],
          crm_contact_id:             crmSeed?.contactId ?? null,
        }),
      });

      const data = await res.json() as {
        slug?: string; error?: string;
        existing_account?: { id: string; name: string; email: string };
      };

      if (!res.ok) {
        if (res.status === 409 && data.slug) {
          router.push(`/admin/campaigns/${data.slug}`);
          return;
        }
        if (res.status === 409 && data.existing_account) {
          setDuplicateAccount(data.existing_account);
        }
        setLaunchError(data.error ?? "Launch failed. Please check your inputs and try again.");
        setLaunching(false);
        return;
      }

      router.push(`/admin/campaigns/${data.slug}`);
    } catch {
      setLaunchError("Network error. Please check your connection and try again.");
      setLaunching(false);
    }
  };

  return (
    <div style={{ padding: "1.75rem 2rem", maxWidth: 920, margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Page header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button
          onClick={() => router.push("/admin/campaigns")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".78rem", color: "#6e6e73", fontWeight: 500, padding: 0, display: "flex", alignItems: "center", gap: ".3rem", marginBottom: ".75rem" }}
        >
          ← Campaigns
        </button>
        <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#1d1d1f", letterSpacing: "-.02em" }}>
          New Campaign
        </h1>
        <p style={{ margin: ".3rem 0 0", fontSize: ".82rem", color: "#98989d" }}>
          Create a fully configured fundraising campaign in 5 steps.
        </p>
        {crmSeed && (
          <div style={{ marginTop: ".6rem", display: "inline-flex", alignItems: "center", gap: ".4rem", padding: ".3rem .7rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 999 }}>
            <span style={{ fontSize: ".72rem", fontWeight: 600, color: "#1e40af" }}>
              ☎ Linked to Coach CRM contact — will be recorded on launch
            </span>
          </div>
        )}
      </div>

      {/* Progress stepper */}
      <ProgressStepper step={step} />

      {/* Step card */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2", padding: "1.75rem", marginBottom: "1.25rem" }}>

        {/* Step heading with edit links for completed steps */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div>
            <div style={{ fontSize: ".65rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".2rem" }}>
              Step {step} of 5
            </div>
            <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#1d1d1f" }}>
              {STEP_LABELS[step]}
            </h2>
          </div>
          {step > 1 && step < 5 && (
            <div style={{ display: "flex", gap: ".5rem" }}>
              {([1, 2, 3, 4] as Step[]).filter(s => s < step).map(s => (
                <button key={s} onClick={() => goToStep(s)}
                  style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", fontSize: ".72rem", color: "#6e6e73", fontWeight: 600, padding: ".25rem .65rem" }}>
                  Edit {STEP_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>

        {step === 1 && <Step1 d={d} upd={upd} slugStatus={slugStatus} />}
        {step === 2 && <Step2 d={d} upd={upd} />}
        {step === 3 && <Step3 d={d} upd={upd} />}
        {step === 4 && <Step4 d={d} upd={upd} />}
        {step === 5 && (
          <Step5
            d={d} upd={upd} launchError={launchError} launching={launching} onLaunch={launch}
            duplicateAccount={duplicateAccount}
            onUseDuplicateAccount={() => {
              if (!duplicateAccount) return;
              upd({ coach_mode: "existing", existing_coach: null, existing_coach_preselect_id: duplicateAccount.id });
              setDuplicateAccount(null);
              setLaunchError("");
            }}
          />
        )}

      </div>

      {/* Error banner */}
      <ErrorBanner errors={errors} />

      {/* Navigation bar */}
      {step < 5 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 0" }}>
          <Btn onClick={back} disabled={step === 1} color="#6e6e73" variant="outline">
            ← Back
          </Btn>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
            <span style={{ fontSize: ".72rem", color: "#c7c7cc" }}>
              {step < 4 ? `Step ${step} of 5` : "One more step"}
            </span>
            <Btn onClick={next} color="#0b1e3d">
              {step === 4 ? "Review →" : "Next →"}
            </Btn>
          </div>
        </div>
      )}
      {step === 5 && (
        <div style={{ display: "flex", alignItems: "center", padding: "1rem 0" }}>
          <Btn onClick={back} color="#6e6e73" variant="outline">
            ← Back to Features
          </Btn>
        </div>
      )}

    </div>
  );
}
