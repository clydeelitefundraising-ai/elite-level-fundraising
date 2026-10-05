"use client";

import { useState, useEffect, useCallback, createElement } from "react";
import { useRouter } from "next/navigation";
import { defaultSeasonLabel } from "@/lib/campaignSeason";
import RosterImportModal from "./RosterImportModal";
import {
  FUND_USE_ICON_OPTIONS,
  DEFAULT_FUND_USE_ICON_ID,
  normalizeFundUseIconId,
  resolveFundUseIcon,
} from "@/lib/fundUseIcons";

// Phase 2 consolidation: campaign-level sponsors (the `sponsors` table) and
// fund uses (`fund_uses`) are loaded/mutated client-side through the SAME
// already-working admin APIs the legacy editor uses — /api/admin/sponsors[/id]
// and /api/admin/fund-uses[/id]. No new backend, no parallel representation:
// a record created here is immediately visible in the legacy editor and vice
// versa, which is what gives us rollback safety while both surfaces coexist.
//
// These are NOT the platform Sponsor CRM (`sponsor_businesses`, /admin/sponsors),
// which is a separate table and system and is untouched by this file.

type CampaignSponsor = { id: string; name: string; url: string; tier: string };
type CampaignFundUse = { id: string; title: string; description: string; icon: string; sort_order: number };

// Exactly the three tiers the legacy editor offers and
// POST /api/admin/sponsors validates — deliberately not extended here.
const SPONSOR_TIERS = ["gold", "silver", "bronze"] as const;

type CampaignAthlete = { id: string; name: string; event: string; class_year: string | null; jersey_number: number | null; grad_year: number | null; linked: boolean };

// Phase 5A: coaches/staff + their fundraiser participation, loaded via the
// SAME existing admin APIs Legacy uses — /api/admin/coaches (list/add/
// invite) and /api/admin/coach-fundraisers (participation). Deliberately
// excludes account_id from this client-side type even though the API
// response includes it — never rendered, per the "do not expose account
// IDs" requirement; `account_id` presence is only ever used as a boolean
// (linked vs. not) before being discarded.
type CampaignCoach = { id: string; name: string; email: string; role: string; has_pending_invite: boolean; linked: boolean };
type CoachFundraiser = { coach_id: string; active: boolean; goal_cents: number | null };
const COACH_ROLES = ["head_coach", "assistant_coach", "booster"] as const;
const COACH_ROLE_LABELS: Record<string, string> = { head_coach: "Head Coach", assistant_coach: "Assistant Coach", booster: "Booster" };

// Same class options the legacy editor offers (src/lib/supabase.ts's
// ATHLETE_CLASS_OPTIONS) — duplicated as a small local constant rather than
// imported, so this client component never pulls in lib/supabase.ts's much
// larger server-oriented module (many functions keyed on
// SUPABASE_SERVICE_ROLE_KEY) into the browser bundle.
const ATHLETE_CLASS_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior"] as const;
const ATHLETES_PER_PAGE = 25;

const TIER_COLORS: Record<string, { bg: string; color: string }> = {
  gold:   { bg: "#fef9c3", color: "#854d0e" },
  silver: { bg: "#f1f5f9", color: "#475569" },
  bronze: { bg: "#fff7ed", color: "#9a3412" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type CampaignDetail = {
  campaign_slug:              string;
  school_name:                string;
  sport_name:                 string;
  mascot:                     string;
  season:                     string;
  location:                   string;
  logo_url:                   string;
  primary_color:              string;
  secondary_color:            string;
  layout_variant:             "classic" | "premium";
  goal_cents:                 number;
  deadline:                   string;
  default_athlete_goal_cents: number | null;
  external_store_url:         string;
  store_provider:             string;
  archived:                   boolean;
  // Phase F1a: whether fundraising SERVICES are enabled for this
  // otherwise-active team — distinct from `archived` (whole-team
  // retirement, which takes precedence) and `allow_coach_fundraising`
  // (an individual coach's personal participation). Platform Admin is the
  // only authority that can change this.
  fundraising_enabled:         boolean;
  // Phase 1 consolidation: Campaign Story + Campaign/Theme Colors — same
  // campaign_settings columns the legacy editor's Campaign Identity /
  // Campaign Colors cards already read and write. null = not customized
  // (theme colors fall back to the team color; story is simply blank).
  description:                string | null;
  theme_primary_color:        string | null;
  theme_secondary_color:      string | null;
  theme_accent_color:         string | null;
  theme_button_color:         string | null;
  allow_coach_fundraising:    boolean;
  // feature flags
  show_leaderboard:      boolean;
  show_program_identity: boolean;
  show_share_section:    boolean;
  show_fund_uses:        boolean;
  show_recent_donations: boolean;
  show_sponsors:         boolean;
  show_donation_card:    boolean;
  // contact
  contact_requirement:   string | null;
  contact_goal:          number;
  per_athlete_goals:     Record<string, number>;
  // stats
  raised_cents:          number;
  donor_count:           number;
  athlete_count:         number;
  member_count:          number;
  athlete_account_count: number;
  parent_account_count:  number;
  health_score:          number;
  // relational
  athletes: {
    id: string; name: string; event: string; class_year: string | null;
    jersey_number: number | null; grad_year: number | null;
    // Phase 3: whether a real team_members(role="athlete") row with a
    // non-null account_id points at this athlete — the actual account
    // relationship, computed server-side in page.tsx. Read-only here.
    linked: boolean;
  }[];
  coaches:  { id: string; name: string; role: string; email: string }[];
};

type Props = { detail: CampaignDetail };

type TabId = "overview" | "fundraising" | "people" | "branding" | "sponsors" | "advanced";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview",    label: "Overview" },
  { id: "fundraising", label: "Fundraising" },
  { id: "people",      label: "People" },
  { id: "branding",    label: "Branding & Page" },
  { id: "sponsors",    label: "Sponsors" },
  { id: "advanced",    label: "Advanced" },
];

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  label:  { fontSize: ".72rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase" as const, letterSpacing: ".05em", display: "block", marginBottom: ".35rem" },
  input:  { padding: ".5rem .75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".875rem", color: "#1d1d1f", background: "#fff", width: "100%", boxSizing: "border-box" as const, outline: "none" },
  card:   { background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2", padding: "1.5rem", marginBottom: "1rem" },
  muted:  { fontSize: ".72rem", color: "#98989d", fontWeight: 500, marginTop: ".2rem" },
  grid2:  { display: "grid" as const, gridTemplateColumns: "1fr 1fr" as const, gap: "1rem" },
};

// ── Helper components ─────────────────────────────────────────────────────────

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: "1.25rem", paddingBottom: ".875rem", borderBottom: "1px solid #f5f5f7" }}>
      <h2 style={{ margin: 0, fontSize: ".9rem", fontWeight: 700, color: "#1d1d1f" }}>{title}</h2>
      {desc && <p style={{ margin: ".2rem 0 0", fontSize: ".75rem", color: "#98989d" }}>{desc}</p>}
    </div>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={T.label}>{label}</label>
      {children}
      {note && <div style={T.muted}>{note}</div>}
    </div>
  );
}

function SaveBtn({ saving, onClick, label = "Save changes" }: { saving: boolean; onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} disabled={saving}
      style={{ padding: ".45rem 1.1rem", background: saving ? "#9ca3af" : "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontSize: ".8rem", fontWeight: 600, marginTop: "1.25rem" }}>
      {saving ? "Saving…" : label}
    </button>
  );
}

function StatusBadge({ archived }: { archived: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", padding: ".2rem .7rem", borderRadius: 100, fontSize: ".65rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: archived ? "#f3f4f6" : "#dcfce7", color: archived ? "#6b7280" : "#15803d" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: archived ? "#9ca3af" : "#16a34a", display: "inline-block" }} />
      {archived ? "Archived" : "Live"}
    </span>
  );
}

function StatChip({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ".15rem" }}>
      <span style={{ fontSize: "1.2rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.02em" }}>{value}</span>
      <span style={{ fontSize: ".65rem", fontWeight: 600, color: "#98989d", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
      {sub && <span style={{ fontSize: ".68rem", color: "#c7c7cc" }}>{sub}</span>}
    </div>
  );
}

function HealthRing({ score }: { score: number }) {
  const color = score >= 80 ? "#16a34a" : score >= 55 ? "#d97706" : "#dc2626";
  const label = score >= 80 ? "Great" : score >= 55 ? "Fair" : "Needs work";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: ".4rem" }}>
      <div style={{ width: 96, height: 96, borderRadius: "50%", background: `conic-gradient(${color} ${score * 3.6}deg, #f0f0f2 0deg)`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "1.4rem", fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: ".6rem", fontWeight: 600, color: "#98989d", letterSpacing: ".03em" }}>/ 100</span>
        </div>
      </div>
      <span style={{ fontSize: ".72rem", fontWeight: 700, color, letterSpacing: ".04em", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".7rem 0", borderBottom: "1px solid #f5f5f7" }}>
      <div>
        <div style={{ fontSize: ".83rem", fontWeight: 500, color: "#1d1d1f" }}>{label}</div>
        {desc && <div style={{ fontSize: ".7rem", color: "#98989d", marginTop: ".1rem" }}>{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{ width: 44, height: 26, borderRadius: 13, border: "none", background: checked ? "#0b1e3d" : "#d1d5db", position: "relative", cursor: "pointer", transition: "background .15s", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
      </button>
    </div>
  );
}

function ContactRequirementPicker({ value, onChange, needsMigration }: { value: string; onChange: (v: string) => void; needsMigration: boolean }) {
  const options = [
    { value: "phone_or_email",  label: "Phone OR Email",  desc: "Either is acceptable (default)" },
    { value: "phone_and_email", label: "Phone AND Email",  desc: "Both required for each contact" },
    { value: "phone_only",      label: "Phone Only",       desc: "Email not accepted" },
    { value: "email_only",      label: "Email Only",       desc: "Phone not accepted" },
  ] as const;

  return (
    <div>
      {needsMigration && (
        <div style={{ padding: ".5rem .75rem", background: "#fef9c3", border: "1px solid #fde047", borderRadius: 7, fontSize: ".72rem", color: "#854d0e", fontWeight: 500, marginBottom: ".75rem" }}>
          ⚠ Requires DB migration to persist. See implementation report for migration SQL.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
        {options.map(opt => (
          <label key={opt.value} style={{ display: "flex", alignItems: "flex-start", gap: ".65rem", padding: ".65rem .85rem", borderRadius: 9, border: `1.5px solid ${value === opt.value ? "#0b1e3d" : "#e5e7eb"}`, cursor: "pointer", background: value === opt.value ? "#f0f2f7" : "#fff", transition: "border .1s, background .1s" }}>
            <input type="radio" name="contact_req" value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)}
              style={{ marginTop: 2, accentColor: "#0b1e3d", flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: ".83rem", fontWeight: 600, color: "#1d1d1f" }}>{opt.label}</div>
              <div style={{ fontSize: ".7rem", color: "#98989d" }}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// Campaign theme colors are optional — null means "not customized, falls
// back to the team color shown as `fallback`." Typing a value (or using the
// picker) sets a custom color; Reset clears it back to null. Same semantics
// as the legacy editor's OptionalColorField (AdminClient.tsx) — intentionally
// re-implemented here rather than imported, so this file has no dependency
// on the legacy component.
function OptionalColorField({ label, value, fallback, onChange }: { label: string; value: string | null; fallback: string; onChange: (v: string | null) => void }) {
  const effective = value ?? fallback;
  return (
    <Field label={label} note={value == null ? `Using team color (${fallback})` : undefined}>
      <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
        <input type="color" value={effective.match(/^#[0-9a-fA-F]{6}$/) ? effective : "#000000"}
          onChange={e => onChange(e.target.value)}
          style={{ width: 38, height: 36, border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", padding: 2, flexShrink: 0, background: "none" }} />
        <input style={T.input} value={value ?? ""} onChange={e => onChange(e.target.value || null)} placeholder={`Default: ${fallback}`} />
        {value != null && (
          <button type="button" onClick={() => onChange(null)}
            style={{ fontSize: ".68rem", fontWeight: 600, color: "#6b7280", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 6, padding: ".3rem .55rem", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
            Reset
          </button>
        )}
      </div>
    </Field>
  );
}

// Read-only reflection of the real account relationship (a team_members
// row with role="athlete" and a non-null account_id) — computed
// server-side in page.tsx, never inferred here from name or any heuristic.
function LinkStatusBadge({ linked }: { linked: boolean }) {
  return (
    <span style={{ padding: ".15rem .55rem", borderRadius: 100, fontSize: ".65rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: linked ? "#dcfce7" : "#f3f4f6", color: linked ? "#15803d" : "#6b7280" }}>
      {linked ? "Linked" : "Not linked"}
    </span>
  );
}

// Same three-state logic Legacy already uses (AdminClient.tsx): linked
// (has a real account_id) takes priority over pending (an unused,
// unexpired invite token exists), which takes priority over unactivated.
// Never inferred from name/email — only from the server-computed
// `linked`/`has_pending_invite` flags already returned by the existing API.
function CoachAccountBadge({ linked, pending }: { linked: boolean; pending: boolean }) {
  const label = linked ? "Linked" : pending ? "Invite Pending" : "Unactivated";
  const colors = linked ? { bg: "#dcfce7", color: "#15803d" } : pending ? { bg: "#dbeafe", color: "#1d4ed8" } : { bg: "#fef9c3", color: "#854d0e" };
  return (
    <span style={{ padding: ".15rem .55rem", borderRadius: 100, fontSize: ".65rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: colors.bg, color: colors.color }}>
      {label}
    </span>
  );
}

function CoachRoleBadge({ role }: { role: string }) {
  const colors = role === "head_coach" ? { bg: "#dbeafe", color: "#1d4ed8" } : role === "booster" ? { bg: "#ccfbf1", color: "#0f766e" } : { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ padding: ".15rem .55rem", borderRadius: 100, fontSize: ".65rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: colors.bg, color: colors.color }}>
      {COACH_ROLE_LABELS[role] ?? role}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  // Unknown/legacy tier values fall back to a neutral badge rather than
  // being hidden — same tolerance the legacy editor's TierBadge has.
  const s = TIER_COLORS[tier] ?? { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ padding: ".15rem .55rem", borderRadius: 100, fontSize: ".65rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: s.bg, color: s.color }}>
      {tier}
    </span>
  );
}

// Renders a stored fund-use icon value. Uses createElement rather than
// assigning the resolved component to a capitalized local and rendering it
// as JSX — the latter reads as "a component created during render" to
// react-hooks/static-components, even though the registry is static.
function FundUseIcon({ value, size = 18 }: { value: string; size?: number }) {
  return createElement(resolveFundUseIcon(value), { size });
}

// Same icon set and selection behavior as the legacy editor — both import
// the shared registry in @/lib/fundUseIcons, so the options and the stored
// values stay identical across the two surfaces.
function IconPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const selectedId = normalizeFundUseIconId(value);
  const selectedLabel = FUND_USE_ICON_OPTIONS.find(o => o.id === selectedId)?.label ?? "";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".5rem" }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, background: "#f0f2f7", color: "#0b1e3d", flexShrink: 0 }}>
          <FundUseIcon value={value} size={17} />
        </span>
        <span style={{ fontSize: ".75rem", color: "#6e6e73", fontWeight: 500 }}>{selectedLabel}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(34px, 1fr))", gap: ".3rem", maxWidth: 300 }}>
        {FUND_USE_ICON_OPTIONS.map(opt => {
          const selected = opt.id === selectedId;
          return (
            <button key={opt.id} type="button" title={opt.label} aria-label={opt.label} onClick={() => onChange(opt.id)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: ".4rem", background: selected ? "#eff0f3" : "#fff", border: selected ? "2px solid #0b1e3d" : "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", color: "#1d1d1f" }}>
              <opt.Icon size={16} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", fontSize: ".65rem", fontWeight: 700, color: "#98989d", textTransform: "uppercase", letterSpacing: ".05em", padding: ".5rem .65rem", borderBottom: "1px solid #f0f0f2", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { fontSize: ".8rem", color: "#1d1d1f", padding: ".55rem .65rem", borderBottom: "1px solid #f5f5f7", verticalAlign: "middle" };

function MiniBtn({ label, onClick, disabled, tone = "neutral" }: { label: string; onClick: () => void; disabled?: boolean; tone?: "neutral" | "primary" | "danger" }) {
  const palette = {
    neutral: { bg: "#f5f5f7", color: "#1d1d1f", border: "1px solid #e5e7eb" },
    primary: { bg: "#0b1e3d", color: "#fff",    border: "none" },
    danger:  { bg: "#fff",    color: "#dc2626", border: "1.5px solid #fecaca" },
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: ".3rem .6rem", background: palette.bg, color: palette.color, border: palette.border, borderRadius: 7, fontSize: ".72rem", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
}

// Tab-bar overflow fix: `overflowX: "auto"` alone left `overflow-y` at its
// initial `visible`, and per the CSS overflow spec, when one axis is not
// `visible` the other computes from `visible` to `auto` — so the bar got an
// implicit vertical scroll container. The active tab's `marginBottom: -1px`
// (used to lap its 2px indicator over the bar's own 1px rule) then pushed its
// border box exactly 1px past the content box, which is enough vertical
// overflow to render the stubby up/down scrollbar seen in production.
// Fixed by removing that 1px overflow source (the negative margin) and
// pinning `overflowY: "hidden"` so no future 1px rounding can reintroduce it.
// Horizontal overflow/scrolling for genuinely narrow widths is unchanged.
function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div role="tablist" aria-label="Campaign sections" style={{ display: "flex", gap: ".25rem", borderBottom: "1px solid #e5e7eb", marginBottom: "1.25rem", overflowX: "auto", overflowY: "hidden" }}>
      {TABS.map(t => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            style={{
              padding: ".6rem .9rem",
              background: "none",
              border: "none",
              borderBottom: `2px solid ${isActive ? "#0b1e3d" : "transparent"}`,
              color: isActive ? "#0b1e3d" : "#6e6e73",
              fontWeight: isActive ? 700 : 500,
              fontSize: ".82rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const show = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);
  return { toast, show };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CampaignControlCenter({ detail }: Props) {
  const router = useRouter();
  const { toast, show } = useToast();
  const slug = detail.campaign_slug;

  const [tab, setTab] = useState<TabId>("overview");

  // ── Section state ─────────────────────────────────────────────────────────

  const [identity, setIdentity] = useState({
    school_name: detail.school_name,
    sport_name:  detail.sport_name,
    mascot:      detail.mascot,
    season:      detail.season,
    location:    detail.location,
    description: detail.description ?? "",
  });

  const [fundraising, setFundraising] = useState({
    goal_cents:                 detail.goal_cents,
    deadline:                   detail.deadline,
    default_athlete_goal_cents: detail.default_athlete_goal_cents,
    layout_variant:             detail.layout_variant,
    external_store_url:        detail.external_store_url,
    store_provider:            detail.store_provider,
    // Phase F1a — kept in this same draft/save group since it lives in the
    // Fundraising Settings card, but it is semantically separate from
    // every other field here: it does not configure the fundraiser, it
    // enables/disables it.
    fundraising_enabled:        detail.fundraising_enabled,
  });

  const [contact, setContact] = useState({
    goal:               detail.contact_goal,
    requirement:        detail.contact_requirement ?? "phone_or_email",
    needsMigration:     detail.contact_requirement === null,
  });

  const [perAthleteGoals, setPerAthleteGoals] = useState<Record<string, number>>(detail.per_athlete_goals ?? {});

  // ── Phase 3: Athlete Management (legacy athlete APIs, same records) ─────
  // Single source of truth for the campaign's athlete population — seeded
  // from the server-rendered `detail.athletes` and updated in place after a
  // successful add/edit, so both Athlete Management and Per-Athlete Goal
  // Overrides below always render the exact same list (no second fetch, no
  // possibility of drift between the two sections).
  const [athletes, setAthletes] = useState<CampaignAthlete[]>(detail.athletes);
  const [athleteSearch, setAthleteSearch] = useState("");
  const [athletePage, setAthletePage] = useState(0);
  const [editAthlete, setEditAthlete] = useState<{ id: string; name: string; class_year: string; event: string } | null>(null);
  const [newAthlete, setNewAthlete] = useState({ name: "", class_year: "", event: "" });
  const [addingAthlete, setAddingAthlete] = useState(false);
  const [showRosterImport, setShowRosterImport] = useState(false);

  // ── Phase 5A: Coaches & Staff (legacy coach APIs, same records) ─────────
  // coachList/coachFundraisers are loaded client-side, same pattern as
  // sponsors/fundUses in Phase 2 — reusing the exact existing admin APIs,
  // not a parallel representation. `inviteCache` is deliberately plain
  // component state (never persisted to localStorage/DB/URL) so a
  // returned invite URL exists only in memory for this browser session,
  // exactly matching Legacy's own behavior — a page refresh clears it.
  const [coaches, setCoaches] = useState<CampaignCoach[] | null>(null);
  const [coachFundraisers, setCoachFundraisers] = useState<CoachFundraiser[]>([]);
  const [newCoach, setNewCoach] = useState({ name: "", email: "", role: "assistant_coach" as string, password: "" });
  const [addingCoach, setAddingCoach] = useState(false);
  const [inviteLoadingId, setInviteLoadingId] = useState<string | null>(null);
  const [inviteCache, setInviteCache] = useState<Record<string, { url: string; emailSent: boolean }>>({});
  const [expandedInviteId, setExpandedInviteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/admin/coaches?slug=${encodeURIComponent(slug)}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/admin/coach-fundraisers?slug=${encodeURIComponent(slug)}`).then(r => r.ok ? r.json() : []),
    ])
      .then(([c, cf]) => {
        if (cancelled) return;
        setCoaches(Array.isArray(c)
          ? c.map((row: { id: string; name: string; email: string; role: string; account_id: string | null; has_pending_invite: boolean }) => ({
              id: row.id, name: row.name, email: row.email, role: row.role,
              has_pending_invite: row.has_pending_invite, linked: Boolean(row.account_id),
            }))
          : []);
        setCoachFundraisers(Array.isArray(cf)
          ? cf.map((row: { coach_id: string; active: boolean; goal_cents: number | null }) => ({ coach_id: row.coach_id, active: row.active, goal_cents: row.goal_cents }))
          : []);
      })
      .catch(() => {
        if (cancelled) return;
        setCoaches([]);
        setCoachFundraisers([]);
      });
    return () => { cancelled = true; };
  }, [slug]);

  const [features, setFeatures] = useState({
    show_leaderboard:      detail.show_leaderboard,
    show_program_identity: detail.show_program_identity,
    show_share_section:    detail.show_share_section,
    show_fund_uses:        detail.show_fund_uses,
    show_recent_donations: detail.show_recent_donations,
    show_sponsors:         detail.show_sponsors,
    show_donation_card:    detail.show_donation_card,
    allow_coach_fundraising: detail.allow_coach_fundraising,
  });

  const [branding, setBranding] = useState({
    primary_color:      detail.primary_color,
    secondary_color:    detail.secondary_color,
    logo_url:           detail.logo_url,
    theme_primary_color:   detail.theme_primary_color,
    theme_secondary_color: detail.theme_secondary_color,
    theme_accent_color:    detail.theme_accent_color,
    theme_button_color:    detail.theme_button_color,
  });
  const [logoUploading, setLogoUploading] = useState(false);

  const [archived, setArchived] = useState(detail.archived);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // ── Phase 2: campaign sponsors + fund uses (legacy APIs, same records) ───

  const [sponsors, setSponsors] = useState<CampaignSponsor[] | null>(null);
  const [editS, setEditS] = useState<CampaignSponsor | null>(null);
  const [newS, setNewS] = useState({ name: "", url: "", tier: "gold" as string });
  const [addingSponsor, setAddingSponsor] = useState(false);

  const [fundUses, setFundUses] = useState<CampaignFundUse[] | null>(null);
  const [editFU, setEditFU] = useState<CampaignFundUse | null>(null);
  const [newFU, setNewFU] = useState({ title: "", description: "", icon: DEFAULT_FUND_USE_ICON_ID });
  const [addingFundUse, setAddingFundUse] = useState(false);

  // Loaded from the same endpoints the legacy editor reads, so both
  // surfaces always show the same records (incl. the API's existing
  // visible/order filtering — not re-implemented here).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/admin/sponsors?slug=${encodeURIComponent(slug)}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/admin/fund-uses?slug=${encodeURIComponent(slug)}`).then(r => r.ok ? r.json() : []),
    ])
      .then(([s, f]) => {
        if (cancelled) return;
        setSponsors(Array.isArray(s) ? s : []);
        setFundUses(Array.isArray(f) ? f : []);
      })
      .catch(() => {
        if (cancelled) return;
        setSponsors([]);
        setFundUses([]);
      });
    return () => { cancelled = true; };
  }, [slug]);

  // ── Saving state ──────────────────────────────────────────────────────────

  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const setSav = (key: string, v: boolean) => setSaving(p => ({ ...p, [key]: v }));

  async function patchCampaign(key: string, body: Record<string, unknown>) {
    setSav(key, true);
    try {
      const res = await fetch(`/api/admin/campaigns/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { show(data.error ?? "Save failed.", "error"); return false; }
      if (data.warnings?.length) show(`Saved (with warnings: ${data.warnings[0]})`, "success");
      else show("Saved.");
      return true;
    } catch { show("Network error.", "error"); return false; }
    finally { setSav(key, false); }
  }

  async function saveIdentity() {
    await patchCampaign("identity", {
      school_name: identity.school_name,
      sport_name:  identity.sport_name,
      mascot:      identity.mascot,
      season:      identity.season,
      location:    identity.location,
      // Campaign Story — same empty-string-means-null convention as the
      // legacy editor's PUT /api/admin/campaign route uses for this exact
      // column, so clearing the field is an explicit, intentional null,
      // never an accidental one from a field the admin never touched (this
      // save always sends the field's current state value, which was
      // itself initialized from the true current DB value above).
      description: identity.description.trim() || null,
    });
  }

  async function saveFundraising() {
    await patchCampaign("fundraising", {
      goal_cents:                 fundraising.goal_cents || null,
      deadline:                   fundraising.deadline,
      default_athlete_goal_cents: fundraising.default_athlete_goal_cents || null,
      layout_variant:             fundraising.layout_variant,
      external_store_url:        fundraising.external_store_url || null,
      store_provider:            fundraising.store_provider     || null,
      fundraising_enabled:        fundraising.fundraising_enabled,
    });
  }

  async function saveContact() {
    setSav("contact", true);
    try {
      // Save team default goal to fundraising_contact_goals
      const goalRes = await fetch(`/api/admin/campaigns/${slug}/contact-goal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: contact.goal }),
      });
      if (!goalRes.ok) { const d = await goalRes.json(); show(d.error ?? "Failed to save contact goal.", "error"); return; }

      // Save contact requirement (may need migration)
      const reqRes = await fetch(`/api/admin/campaigns/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_requirement: contact.requirement }),
      });
      const reqData = await reqRes.json();
      if (!reqRes.ok) { show(reqData.error ?? "Failed to save.", "error"); return; }
      if (reqData.warnings?.length) {
        setContact(p => ({ ...p, needsMigration: true }));
        show("Contact goal saved. Requirement needs DB migration to persist.");
      } else {
        setContact(p => ({ ...p, needsMigration: false }));
        show("Contact settings saved.");
      }
    } catch { show("Network error.", "error"); }
    finally { setSav("contact", false); }
  }

  async function savePerAthleteGoal(athleteId: string, goal: number) {
    setSav(`athlete_${athleteId}`, true);
    try {
      const res = await fetch(`/api/team/${slug}/contacts/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, athlete_id: athleteId }),
      });
      if (res.ok) {
        setPerAthleteGoals(p => ({ ...p, [athleteId]: goal }));
        show("Per-athlete goal saved.");
      } else {
        const d = await res.json();
        show(d.error ?? "Failed to save athlete goal.", "error");
      }
    } catch { show("Network error.", "error"); }
    finally { setSav(`athlete_${athleteId}`, false); }
  }

  async function saveFeatures() {
    await patchCampaign("features", features);
  }

  async function saveBranding() {
    await patchCampaign("branding", {
      primary_color:      branding.primary_color,
      secondary_color:    branding.secondary_color,
      logo_url:           branding.logo_url,
      // Already string | null in state (OptionalColorField normalizes an
      // emptied input to null immediately on change, same as the legacy
      // editor) — sent through as-is, never coerced to "" here. Omitting a
      // theme key entirely would leave that column untouched server-side,
      // but this save always includes all four with their current
      // (possibly already-null) value, so an untouched field round-trips
      // to its existing DB value rather than being reset.
      theme_primary_color:   branding.theme_primary_color,
      theme_secondary_color: branding.theme_secondary_color,
      theme_accent_color:    branding.theme_accent_color,
      theme_button_color:    branding.theme_button_color,
    });
  }

  // Phase 4: reuses the EXACT same /api/admin/logo-upload endpoint the
  // legacy "Launch New School" wizard already uses — same validation, same
  // 512x512 resize, same team-logos bucket, same response shape. This
  // route only uploads a file and returns its public URL; it never touches
  // campaign_settings itself (confirmed by reading the route) — persisting
  // the result is the caller's job here, same as it already is in the
  // wizard.
  //
  // On success: `branding.logo_url` (the SAME state the manual URL field
  // and the preview both already read from) is updated immediately via
  // setBranding, then saveBranding() is called with that already-current
  // state — so there is no separate "pending" value that a later manual
  // Save click could ever revert. Auto-saving (rather than only updating
  // local state) is what makes a page refresh immediately after upload
  // still show the new logo, since the value is already persisted to
  // campaign_settings.logo_url by the time this function returns.
  async function uploadLogo(file: File) {
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/admin/logo-upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { show(data.error ?? "Logo upload failed.", "error"); return; }

      const nextBranding = { ...branding, logo_url: data.url as string };
      setBranding(nextBranding);

      const saved = await patchCampaign("branding", {
        primary_color:      nextBranding.primary_color,
        secondary_color:    nextBranding.secondary_color,
        logo_url:           nextBranding.logo_url,
        theme_primary_color:   nextBranding.theme_primary_color,
        theme_secondary_color: nextBranding.theme_secondary_color,
        theme_accent_color:    nextBranding.theme_accent_color,
        theme_button_color:    nextBranding.theme_button_color,
      });
      if (!saved) {
        // The file uploaded successfully but saving the association
        // failed — surface this distinctly so the admin knows to retry
        // Save rather than re-uploading (the uploaded file is not lost).
        show("Logo uploaded, but saving it to the campaign failed. Click \"Save branding\" to retry.", "error");
      } else {
        show("Logo uploaded.");
      }
    } catch {
      show("Network error during upload.", "error");
    } finally {
      setLogoUploading(false);
    }
  }

  // ── Sponsor CRUD — payloads match the legacy editor exactly ─────────────

  async function addSponsor() {
    if (!newS.name.trim() || !newS.url.trim()) { show("Sponsor name and URL are required.", "error"); return; }
    setAddingSponsor(true);
    try {
      const res = await fetch("/api/admin/sponsors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_slug: slug, name: newS.name.trim(), url: newS.url.trim(), tier: newS.tier }),
      });
      if (!res.ok) { show("Failed to add sponsor.", "error"); return; }
      const created = await res.json();
      setSponsors(p => [...(p ?? []), created]);
      setNewS({ name: "", url: "", tier: "gold" });
      show("Sponsor added.");
    } catch { show("Network error.", "error"); }
    finally { setAddingSponsor(false); }
  }

  async function saveSponsor() {
    if (!editS) return;
    if (!editS.name.trim() || !editS.url.trim()) { show("Sponsor name and URL are required.", "error"); return; }
    setSav(`sponsor_${editS.id}`, true);
    try {
      const res = await fetch(`/api/admin/sponsors/${editS.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editS.name, url: editS.url, tier: editS.tier }),
      });
      if (!res.ok) { show("Failed to update sponsor.", "error"); return; }
      setSponsors(p => (p ?? []).map(s => s.id === editS.id ? editS : s));
      setEditS(null);
      show("Sponsor updated.");
    } catch { show("Network error.", "error"); }
    finally { setSav(`sponsor_${editS.id}`, false); }
  }

  async function deleteSponsor(id: string, name: string) {
    if (!confirm(`Delete sponsor "${name}"? This removes it from the public campaign page.`)) return;
    try {
      const res = await fetch(`/api/admin/sponsors/${id}`, { method: "DELETE" });
      if (!res.ok) { show("Failed to delete sponsor.", "error"); return; }
      setSponsors(p => (p ?? []).filter(s => s.id !== id));
      show("Sponsor deleted.");
    } catch { show("Network error.", "error"); }
  }

  // ── Fund-use CRUD — payloads match the legacy editor exactly ────────────

  async function addFundUse() {
    if (!newFU.title.trim()) { show("Title is required.", "error"); return; }
    // Same next-order rule as the legacy editor: one past the current max,
    // or 0 for the first item.
    const list = fundUses ?? [];
    const nextOrder = list.length > 0 ? Math.max(...list.map(f => f.sort_order)) + 1 : 0;
    setAddingFundUse(true);
    try {
      const res = await fetch("/api/admin/fund-uses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_slug: slug, title: newFU.title.trim(), description: newFU.description.trim(), icon: newFU.icon, sort_order: nextOrder }),
      });
      if (!res.ok) { show("Failed to add item.", "error"); return; }
      const created = await res.json();
      setFundUses(p => [...(p ?? []), created]);
      setNewFU({ title: "", description: "", icon: DEFAULT_FUND_USE_ICON_ID });
      show("Item added.");
    } catch { show("Network error.", "error"); }
    finally { setAddingFundUse(false); }
  }

  async function saveFundUse() {
    if (!editFU) return;
    if (!editFU.title.trim()) { show("Title is required.", "error"); return; }
    setSav(`fundUse_${editFU.id}`, true);
    try {
      const res = await fetch(`/api/admin/fund-uses/${editFU.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editFU.title, description: editFU.description, icon: editFU.icon, sort_order: editFU.sort_order }),
      });
      if (!res.ok) { show("Failed to update item.", "error"); return; }
      setFundUses(p => (p ?? []).map(f => f.id === editFU.id ? editFU : f));
      setEditFU(null);
      show("Item updated.");
    } catch { show("Network error.", "error"); }
    finally { setSav(`fundUse_${editFU.id}`, false); }
  }

  async function deleteFundUse(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This removes it from the public campaign page.`)) return;
    try {
      const res = await fetch(`/api/admin/fund-uses/${id}`, { method: "DELETE" });
      if (!res.ok) { show("Failed to delete item.", "error"); return; }
      setFundUses(p => (p ?? []).filter(f => f.id !== id));
      show("Item deleted.");
    } catch { show("Network error.", "error"); }
  }

  // ── Athlete CRUD — payloads match the legacy editor exactly. No delete:
  // DELETE /api/admin/athletes/[id] CASCADE-deletes fundraising_contacts and
  // athlete_outreach and can orphan a linked account (team_members.athlete_id
  // SET NULL) — confirmed in the Phase 3 pre-implementation audit. Deletion
  // is deliberately not exposed here; it remains reachable only through the
  // legacy editor until a safer removal design is built separately. ─────

  async function addAthlete() {
    if (!newAthlete.name.trim() || !newAthlete.class_year) { show("Name and class are required.", "error"); return; }
    setAddingAthlete(true);
    try {
      const res = await fetch("/api/admin/athletes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_slug: slug,
          name:          newAthlete.name.trim(),
          event:         newAthlete.event.trim() || null,
          class_year:    newAthlete.class_year,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surfaces the API's own message as-is, including the existing
        // name-collision 409 — never auto-retried with overrideCollision,
        // never a custom duplicate-resolution flow.
        show(body.error ?? "Failed to add athlete.", "error");
        return;
      }
      setAthletes(p => [...p, { ...body, linked: false }]);
      setNewAthlete({ name: "", class_year: "", event: "" });
      show("Athlete added.");
    } catch { show("Network error.", "error"); }
    finally { setAddingAthlete(false); }
  }

  async function saveAthlete() {
    if (!editAthlete) return;
    if (!editAthlete.name.trim() || !editAthlete.class_year) { show("Name and class are required.", "error"); return; }
    setSav(`athleteEdit_${editAthlete.id}`, true);
    try {
      const res = await fetch(`/api/admin/athletes/${editAthlete.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:       editAthlete.name.trim(),
          event:      editAthlete.event.trim() || null,
          class_year: editAthlete.class_year,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { show(body.error ?? "Failed to update athlete.", "error"); return; }
      // Only name/event/class_year are touched — account linkage
      // (`linked`) and every other field carry over unchanged from the
      // existing record, never reset by this save.
      setAthletes(p => p.map(a => a.id === editAthlete.id
        ? { ...a, name: editAthlete.name.trim(), event: editAthlete.event.trim() || "", class_year: editAthlete.class_year }
        : a));
      setEditAthlete(null);
      show("Athlete updated.");
    } catch { show("Network error.", "error"); }
    finally { setSav(`athleteEdit_${editAthlete.id}`, false); }
  }

  // ── Coach CRUD (Add/Invite/Fundraiser only) — payloads match the legacy
  // editor exactly. No Edit, no Remove, no password-reset: those actions
  // are deliberately not exposed here per the Phase 5A audit/decision —
  // see the "Coaches & Staff" card's own explanatory text in the render
  // below. DELETE/PATCH /api/admin/coaches/[id] are never called from
  // this file. ─────────────────────────────────────────────────────────

  async function addCoach() {
    if (!newCoach.name.trim() || !newCoach.email.trim() || !newCoach.password.trim()) {
      show("Name, email, and password are required.", "error");
      return;
    }
    setAddingCoach(true);
    try {
      const res = await fetch("/api/admin/coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_slug: slug,
          name:          newCoach.name.trim(),
          email:         newCoach.email.trim(),
          role:          newCoach.role,
          password:      newCoach.password,
        }),
      });
      const body = await res.json().catch(() => ({}));
      // The temporary password is cleared from component state immediately
      // below, in every branch (success or failure) — it is never kept
      // around longer than the single request that needed it, and is
      // never logged or written anywhere else.
      setNewCoach(p => ({ ...p, password: "" }));
      if (!res.ok) { show(body.error ?? "Failed to add coach.", "error"); return; }
      setCoaches(p => [...(p ?? []), {
        id: body.id, name: body.name, email: body.email, role: body.role,
        has_pending_invite: false, linked: Boolean(body.account_id),
      }]);
      setNewCoach({ name: "", email: "", role: "assistant_coach", password: "" });
      show("Coach added.");
    } catch {
      setNewCoach(p => ({ ...p, password: "" }));
      show("Network error.", "error");
    } finally {
      setAddingCoach(false);
    }
  }

  // Same endpoint for both "Send Invite" and "Resend Invite" — matches
  // Legacy exactly. Each call server-side invalidates any prior unused
  // token for this coach before issuing a new one, so there is never more
  // than one valid link at a time. The returned URL is cached only in
  // `inviteCache` (plain component state) — never written to
  // localStorage, the database, logs, or a URL parameter — so it is lost
  // on refresh, exactly like Legacy's own behavior.
  async function sendInvite(coachId: string) {
    setInviteLoadingId(coachId);
    try {
      const res = await fetch(`/api/admin/coaches/${coachId}/invite`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { show(body.error ?? "Failed to send invite.", "error"); return; }
      setInviteCache(p => ({ ...p, [coachId]: { url: body.inviteUrl, emailSent: Boolean(body.emailSent) } }));
      setExpandedInviteId(coachId);
      setCoaches(p => (p ?? []).map(c => c.id === coachId ? { ...c, has_pending_invite: true } : c));
      show(body.emailSent ? "Invite sent." : "Invite link generated (email not sent — share the link manually).");
    } catch {
      show("Network error.", "error");
    } finally {
      setInviteLoadingId(null);
    }
  }

  // Reuses the existing non-destructive upsert — disabling participation
  // sets active=false and NEVER deletes the campaign_coach_fundraisers
  // row, preserving goal_cents/history exactly as the audit confirmed.
  // Updates only the one affected coach's row in local state.
  async function toggleCoachFundraiser(coachId: string, active: boolean, goalCents: number | null) {
    setSav(`coachFundraiser_${coachId}`, true);
    try {
      const res = await fetch("/api/admin/coach-fundraisers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_slug: slug, coach_id: coachId, active, goal_cents: goalCents }),
      });
      if (!res.ok) { show("Failed to update fundraiser participation.", "error"); return; }
      setCoachFundraisers(p => {
        const existing = p.find(cf => cf.coach_id === coachId);
        if (existing) return p.map(cf => cf.coach_id === coachId ? { ...cf, active, goal_cents: goalCents } : cf);
        return [...p, { coach_id: coachId, active, goal_cents: goalCents }];
      });
      show("Fundraiser participation updated.");
    } catch {
      show("Network error.", "error");
    } finally {
      setSav(`coachFundraiser_${coachId}`, false);
    }
  }

  async function toggleArchived() {
    const next = !archived;
    if (next && !confirm(`Archive "${slug}"? It will no longer be publicly visible.`)) return;
    const ok = await patchCampaign("status", { archived: next });
    if (ok) setArchived(next);
  }

  async function handlePermanentDelete() {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${slug}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText: deleteConfirmText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        show(data.error ?? "Delete failed.", "error");
        setDeleting(false);
        return;
      }
      router.push("/admin/campaigns");
    } catch {
      show("Network error.", "error");
      setDeleting(false);
    }
  }

  // ── Derived display values ─────────────────────────────────────────────────

  const pct = detail.goal_cents > 0 ? Math.min(100, Math.round((detail.raised_cents / detail.goal_cents) * 100)) : 0;
  const adoptionPct = detail.athlete_count > 0 ? Math.round((detail.member_count / detail.athlete_count) * 100) : 0;
  const fmt$ = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const daysLeft = detail.deadline ? Math.ceil((new Date(detail.deadline).getTime() - Date.now()) / 86400000) : null;
  // Public display order is driven by sort_order (the API reads
  // fund_uses ordered by sort_order.asc) — re-sorted here so an edited
  // order is reflected immediately without a page reload.
  const fundUsesSorted = [...(fundUses ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  // Client-side search + pagination over the already-loaded athlete
  // population — no backend pagination added; comfortably handles 100+
  // athletes without a second query. Search matches name/class/event.
  const athleteQuery = athleteSearch.trim().toLowerCase();
  const athletesFiltered = athleteQuery
    ? athletes.filter(a =>
        a.name.toLowerCase().includes(athleteQuery) ||
        (a.class_year ?? "").toLowerCase().includes(athleteQuery) ||
        a.event.toLowerCase().includes(athleteQuery))
    : athletes;
  const athletePageCount = Math.max(1, Math.ceil(athletesFiltered.length / ATHLETES_PER_PAGE));
  const athletePageClamped = Math.min(athletePage, athletePageCount - 1);
  const athletesPageRows = athletesFiltered.slice(
    athletePageClamped * ATHLETES_PER_PAGE,
    athletePageClamped * ATHLETES_PER_PAGE + ATHLETES_PER_PAGE,
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "1.5rem 2rem", maxWidth: 1100, fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", background: toast.type === "error" ? "#dc2626" : "#0b1e3d", color: "#fff", padding: ".65rem 1.25rem", borderRadius: 10, zIndex: 1000, fontSize: ".82rem", fontWeight: 500, boxShadow: "0 4px 20px rgba(0,0,0,.25)", maxWidth: 360 }}>
          {toast.msg}
        </div>
      )}

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: "1.25rem", fontSize: ".75rem", color: "#98989d" }}>
        <button onClick={() => router.push("/admin/campaigns")} style={{ background: "none", border: "none", cursor: "pointer", color: "#0b1e3d", fontWeight: 600, fontSize: ".75rem", padding: 0 }}>
          Campaigns
        </button>
        <span>/</span>
        <span style={{ color: "#1d1d1f", fontWeight: 500 }}>{detail.school_name || slug}</span>
      </div>

      {/* Campaign header — unchanged, always visible above the tabs */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2", overflow: "hidden", marginBottom: "1.5rem" }}>
        <div style={{ height: 6, background: `linear-gradient(90deg, ${detail.primary_color}, ${detail.secondary_color})` }} />
        <div style={{ padding: "1.25rem 1.5rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {detail.logo_url && (
              <img src={detail.logo_url} alt="" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8, background: "#f5f5f7", padding: 4 }} />
            )}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#1d1d1f", letterSpacing: "-.02em" }}>
                  {detail.school_name || slug}
                </h1>
                <StatusBadge archived={archived} />
              </div>
              <div style={{ fontSize: ".8rem", color: "#6e6e73", marginTop: ".2rem" }}>
                {[detail.sport_name, detail.season, detail.location].filter(Boolean).join(" · ")}
              </div>
              <div style={{ fontSize: ".68rem", color: "#c7c7cc", fontFamily: "monospace", marginTop: ".25rem" }}>/{slug}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <a href={`/campaign/${slug}`} target="_blank" rel="noopener noreferrer"
              style={{ padding: ".4rem .85rem", background: "#f5f5f7", border: "none", borderRadius: 8, fontSize: ".75rem", fontWeight: 600, color: "#1d1d1f", textDecoration: "none", cursor: "pointer" }}>
              View campaign ↗
            </a>
            <a href={`/team/${slug}/home`} target="_blank" rel="noopener noreferrer"
              style={{ padding: ".4rem .85rem", background: "#f5f5f7", border: "none", borderRadius: 8, fontSize: ".75rem", fontWeight: 600, color: "#1d1d1f", textDecoration: "none", cursor: "pointer" }}>
              Team hub ↗
            </a>
            <button onClick={toggleArchived} style={{ padding: ".4rem .85rem", background: archived ? "#dcfce7" : "#fef2f2", border: "none", borderRadius: 8, fontSize: ".75rem", fontWeight: 600, color: archived ? "#15803d" : "#dc2626", cursor: "pointer" }}>
              {archived ? "Restore campaign" : "Archive campaign"}
            </button>
          </div>
        </div>

        {/* Key stats strip */}
        <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid #f5f5f7", display: "flex", gap: "2.5rem", flexWrap: "wrap" }}>
          <StatChip label="Raised" value={fmt$(detail.raised_cents)} sub={detail.goal_cents > 0 ? `of ${fmt$(detail.goal_cents)} · ${pct}%` : undefined} />
          <StatChip label="Donors" value={detail.donor_count} />
          <StatChip label="Athletes" value={detail.athlete_count} />
          <StatChip label="Accounts" value={detail.member_count} sub={`${adoptionPct}% adoption`} />
          <StatChip label="Coaches" value={detail.coaches.length} />
          {daysLeft !== null && (
            <StatChip label="Days left" value={daysLeft < 0 ? "Ended" : daysLeft} sub={daysLeft < 0 ? detail.deadline : undefined} />
          )}
        </div>

        {detail.goal_cents > 0 && (
          <div style={{ padding: "0 1.5rem 1rem" }}>
            <div style={{ height: 6, background: "#f0f0f2", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "#16a34a" : detail.primary_color, borderRadius: 3, transition: "width .4s" }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <TabBar active={tab} onChange={setTab} />

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.25rem", alignItems: "start" }}>
          <div>
            <div style={T.card}>
              <SectionHeader title="Campaign Identity" desc="School name, sport, and program details" />
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={T.grid2}>
                  <Field label="School Name">
                    <input style={T.input} value={identity.school_name} onChange={e => setIdentity(p => ({ ...p, school_name: e.target.value }))} />
                  </Field>
                  <Field label="Sport Name">
                    <input style={T.input} value={identity.sport_name} onChange={e => setIdentity(p => ({ ...p, sport_name: e.target.value }))} />
                  </Field>
                  <Field label="Mascot">
                    <input style={T.input} value={identity.mascot} onChange={e => setIdentity(p => ({ ...p, mascot: e.target.value }))} placeholder="e.g. Pumas" />
                  </Field>
                  <Field label="Season">
                    <input style={T.input} value={identity.season} onChange={e => setIdentity(p => ({ ...p, season: e.target.value }))} placeholder={`e.g. ${defaultSeasonLabel()}`} />
                  </Field>
                  <Field label="Location" note="City, State">
                    <input style={T.input} value={identity.location} onChange={e => setIdentity(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Scottsdale, AZ" />
                  </Field>
                </div>
                <Field label="Campaign Story" note={'Optional — shown as "Why We\'re Raising Funds" on the public page'}>
                  <textarea
                    style={{ ...T.input, height: "auto", minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
                    rows={4}
                    value={identity.description}
                    onChange={e => setIdentity(p => ({ ...p, description: e.target.value }))}
                    placeholder="Our program provides a positive and competitive environment for student-athletes to grow on and off the field. Your support helps us cover travel, equipment, meet fees, and team experiences…"
                  />
                </Field>
                <SaveBtn saving={!!saving.identity} onClick={saveIdentity} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={T.card}>
              <SectionHeader title="Campaign Health" />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
                <HealthRing score={detail.health_score} />
                <div style={{ width: "100%" }}>
                  {[
                    { label: "Athletes on roster",    ok: detail.athlete_count > 0 },
                    { label: "Account adoption ≥ 50%",ok: detail.athlete_count > 0 && (detail.member_count / detail.athlete_count) >= 0.5 },
                    { label: "Donations received",    ok: detail.donor_count > 0 },
                    { label: "Fundraising goal set",  ok: detail.goal_cents > 0 },
                    { label: "Deadline configured",   ok: !!detail.deadline },
                    { label: "Logo uploaded",          ok: !!detail.logo_url },
                    { label: "Campaign is active",    ok: !archived },
                  ].map(item => (
                    <div key={item.label} style={{ display: "flex", alignItems: "center", gap: ".55rem", padding: ".3rem 0", borderBottom: "1px solid #f5f5f7" }}>
                      <span style={{ fontSize: ".75rem", color: item.ok ? "#16a34a" : "#d1d5db" }}>{item.ok ? "✓" : "○"}</span>
                      <span style={{ fontSize: ".75rem", color: item.ok ? "#1d1d1f" : "#98989d", fontWeight: item.ok ? 500 : 400 }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={T.card}>
              <SectionHeader title="Team Statistics" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <StatChip label="Athletes" value={detail.athlete_count} />
                <StatChip label="Athlete Accounts" value={detail.athlete_account_count} />
                <StatChip label="Parent Accounts" value={detail.parent_account_count} />
                <StatChip label="Coaches" value={detail.coaches.length} />
                <StatChip label="Raised" value={`$${(detail.raised_cents / 100).toFixed(0)}`} />
                <StatChip label="Donors" value={detail.donor_count} />
                <StatChip label="Contact Goal" value={contact.goal} sub="per athlete" />
                <StatChip label="Adoption" value={`${adoptionPct}%`} sub="accounts/athletes" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FUNDRAISING ── */}
      {tab === "fundraising" && (
        <div>
          <div style={T.card}>
            <SectionHeader title="Fundraising Settings" desc="Financial goals, deadline, and layout" />
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Phase F1a — a state TOGGLE, deliberately separate from the
                  configuration fields below it and from the Live/Archived
                  status in Campaign Status (Advanced tab). A team can be
                  Live and have fundraising disabled at the same time;
                  archived always takes precedence over this when both
                  apply. Turning this off never clears goal_cents, deadline,
                  donations, or any other fundraising history below — it
                  only controls whether fundraising is currently enabled. */}
              <div style={{ marginBottom: ".25rem" }}>
                <ToggleRow
                  label="Fundraising Enabled"
                  desc="Whether this team's fundraiser is currently available. Independent of Live/Archived status."
                  checked={fundraising.fundraising_enabled}
                  onChange={v => setFundraising(p => ({ ...p, fundraising_enabled: v }))}
                />
              </div>
              <div style={T.grid2}>
                <Field label="Team Goal ($)" note="Leave blank for no team goal">
                  <input type="number" min="0" style={T.input}
                    value={fundraising.goal_cents ? fundraising.goal_cents / 100 : ""}
                    onChange={e => setFundraising(p => ({ ...p, goal_cents: Math.round(parseFloat(e.target.value) * 100) || 0 }))}
                    placeholder="e.g. 25000" />
                </Field>
                <Field label="Default Athlete Goal ($)" note="Per-athlete fundraising target">
                  <input type="number" min="0" style={T.input}
                    value={fundraising.default_athlete_goal_cents ? fundraising.default_athlete_goal_cents / 100 : ""}
                    onChange={e => setFundraising(p => ({ ...p, default_athlete_goal_cents: Math.round(parseFloat(e.target.value) * 100) || null }))}
                    placeholder="e.g. 500" />
                </Field>
                <Field label="Deadline">
                  <input type="date" style={T.input} value={fundraising.deadline} onChange={e => setFundraising(p => ({ ...p, deadline: e.target.value }))} />
                </Field>
                <Field label="Layout Variant">
                  <select style={T.input} value={fundraising.layout_variant} onChange={e => setFundraising(p => ({ ...p, layout_variant: e.target.value as "classic" | "premium" }))}>
                    <option value="classic">Classic</option>
                    <option value="premium">Premium</option>
                  </select>
                </Field>
              </div>
              <SaveBtn saving={!!saving.fundraising} onClick={saveFundraising} />
            </div>
          </div>

          <div style={T.card}>
            <SectionHeader title="Store Integration" desc="Optional external store link shown on the public page" />
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={T.grid2}>
                <Field label="Store URL (optional)">
                  <input style={T.input} value={fundraising.external_store_url} onChange={e => setFundraising(p => ({ ...p, external_store_url: e.target.value }))} placeholder="https://…" />
                </Field>
                <Field label="Store Provider (optional)">
                  <input style={T.input} value={fundraising.store_provider} onChange={e => setFundraising(p => ({ ...p, store_provider: e.target.value }))} placeholder="e.g. Shopify" />
                </Field>
              </div>
              <SaveBtn saving={!!saving.fundraising} onClick={saveFundraising} />
            </div>
          </div>

          <div style={T.card}>
            <SectionHeader title="Contact Collection" desc="Configure how athletes collect donor contacts" />
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

              <Field label="Team Default Contact Goal" note="Number of contacts each athlete should collect. Athletes with no override will use this goal.">
                <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
                  <input type="number" min="1" max="999" style={{ ...T.input, width: 100 }}
                    value={contact.goal}
                    onChange={e => setContact(p => ({ ...p, goal: parseInt(e.target.value) || p.goal }))} />
                  <span style={{ fontSize: ".75rem", color: "#98989d" }}>contacts per athlete</span>
                </div>
              </Field>

              <Field label="Contact Requirement" note="Controls which contact types athletes are required to provide for each contact entry.">
                <ContactRequirementPicker
                  value={contact.requirement}
                  onChange={v => setContact(p => ({ ...p, requirement: v }))}
                  needsMigration={contact.needsMigration}
                />
              </Field>

              <SaveBtn saving={!!saving.contact} onClick={saveContact} label="Save contact settings" />
            </div>
          </div>

          {/* Where Your Money Goes — fund_uses, via the legacy admin API */}
          <div style={T.card}>
            <SectionHeader
              title="Where Your Money Goes"
              desc={
                fundUses === null
                  ? "Fund-use breakdown shown on the public campaign page."
                  : `${fundUsesSorted.length} item${fundUsesSorted.length !== 1 ? "s" : ""} · shown on the public page in the display order below`
              }
            />

            {fundUses === null ? (
              <div style={{ fontSize: ".8rem", color: "#98989d" }}>Loading…</div>
            ) : (
              <>
                {!features.show_fund_uses && (
                  <div style={{ padding: ".5rem .75rem", background: "#fef9c3", border: "1px solid #fde047", borderRadius: 7, fontSize: ".72rem", color: "#854d0e", fontWeight: 500, marginBottom: ".9rem" }}>
                    The &ldquo;Where Your Money Goes&rdquo; section is currently hidden on the public page. Enable it under <strong>Branding &amp; Page → Feature Toggles</strong>.
                  </div>
                )}

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 46 }}>Icon</th>
                        <th style={thStyle}>Title</th>
                        <th style={thStyle}>Description</th>
                        <th style={{ ...thStyle, width: 74, textAlign: "center" }}>Order</th>
                        <th style={{ ...thStyle, width: 150 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fundUsesSorted.map(f => (
                        editFU?.id === f.id ? (
                          <tr key={f.id} style={{ background: "#fafafa" }}>
                            <td style={{ ...tdStyle, verticalAlign: "top", minWidth: 200 }} colSpan={2}>
                              <IconPicker value={editFU.icon} onChange={id => setEditFU(v => v ? { ...v, icon: id } : v)} />
                              <input style={{ ...T.input, marginTop: ".5rem" }} value={editFU.title}
                                onChange={e => setEditFU(v => v ? { ...v, title: e.target.value } : v)} placeholder="Title" />
                            </td>
                            <td style={{ ...tdStyle, verticalAlign: "top" }}>
                              <input style={T.input} value={editFU.description}
                                onChange={e => setEditFU(v => v ? { ...v, description: e.target.value } : v)} placeholder="Description" />
                            </td>
                            <td style={{ ...tdStyle, verticalAlign: "top", textAlign: "center" }}>
                              <input type="number" style={{ ...T.input, width: 58, textAlign: "center" }} value={editFU.sort_order}
                                onChange={e => setEditFU(v => v ? { ...v, sort_order: parseInt(e.target.value) || 0 } : v)} />
                            </td>
                            <td style={{ ...tdStyle, verticalAlign: "top" }}>
                              <div style={{ display: "flex", gap: ".4rem" }}>
                                <MiniBtn tone="primary" label={saving[`fundUse_${f.id}`] ? "Saving…" : "Save"} onClick={saveFundUse} disabled={!!saving[`fundUse_${f.id}`]} />
                                <MiniBtn label="Cancel" onClick={() => setEditFU(null)} />
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={f.id}>
                            <td style={{ ...tdStyle, textAlign: "center", color: "#1d1d1f" }}>
                              <FundUseIcon value={f.icon} size={18} />
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{f.title}</td>
                            <td style={{ ...tdStyle, color: "#6e6e73" }}>{f.description}</td>
                            <td style={{ ...tdStyle, color: "#98989d", textAlign: "center" }}>{f.sort_order}</td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", gap: ".4rem" }}>
                                <MiniBtn label="Edit" onClick={() => setEditFU({ ...f })} />
                                <MiniBtn tone="danger" label="Delete" onClick={() => deleteFundUse(f.id, f.title)} />
                              </div>
                            </td>
                          </tr>
                        )
                      ))}
                      {fundUsesSorted.length === 0 && (
                        <tr><td colSpan={5} style={{ ...tdStyle, color: "#98989d", textAlign: "center", padding: "1.25rem" }}>No items yet. Add one below.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add item */}
                <div style={{ marginTop: "1.25rem", padding: "1rem", background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f2" }}>
                  <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".75rem" }}>Add Item</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
                    <Field label="Title">
                      <input style={T.input} value={newFU.title} onChange={e => setNewFU(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Travel & Transportation" />
                    </Field>
                    <Field label="Description">
                      <input style={T.input} value={newFU.description} onChange={e => setNewFU(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Away meets, regional championships, and travel to compete." />
                    </Field>
                    <Field label="Icon">
                      <IconPicker value={newFU.icon} onChange={id => setNewFU(p => ({ ...p, icon: id }))} />
                    </Field>
                    <div>
                      <MiniBtn tone="primary" label={addingFundUse ? "Adding…" : "+ Add Item"} onClick={addFundUse} disabled={addingFundUse} />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── PEOPLE ── */}
      {tab === "people" && (
        <div>
          <div style={T.card}>
            <SectionHeader title="People & Accounts" desc="Roster and account-adoption snapshot" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "1rem" }}>
              <StatChip label="Athletes" value={detail.athlete_count} />
              <StatChip label="Athlete Accounts" value={detail.athlete_account_count} />
              <StatChip label="Parent Accounts" value={detail.parent_account_count} />
              <StatChip label="Coaches" value={detail.coaches.length} />
              <StatChip label="Adoption" value={`${adoptionPct}%`} sub="accounts/athletes" />
            </div>
          </div>

          {/* Athlete Management — athletes table, via the legacy admin API */}
          <div style={T.card}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <SectionHeader
                title="Athletes"
                desc={`${athletes.length} athlete${athletes.length !== 1 ? "s" : ""} on this roster`}
              />
              <div style={{ display: "flex", gap: ".5rem", flexShrink: 0 }}>
                <MiniBtn label="Download Template" onClick={() => window.open("/api/admin/athletes/import/template", "_blank")} />
                <MiniBtn tone="primary" label="Upload Roster" onClick={() => setShowRosterImport(true)} />
              </div>
            </div>

            <div style={{ display: "flex", gap: ".75rem", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
              <input
                style={{ ...T.input, maxWidth: 260 }}
                value={athleteSearch}
                onChange={e => { setAthleteSearch(e.target.value); setAthletePage(0); }}
                placeholder="Search name, class, or event…"
              />
              {athleteQuery && (
                <span style={{ fontSize: ".72rem", color: "#98989d" }}>
                  {athletesFiltered.length} match{athletesFiltered.length !== 1 ? "es" : ""}
                </span>
              )}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Athlete</th>
                    <th style={{ ...thStyle, width: 110 }}>Class</th>
                    <th style={thStyle}>Event</th>
                    <th style={{ ...thStyle, width: 110 }}>Account</th>
                    <th style={{ ...thStyle, width: 110 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {athletesPageRows.map(a => (
                    editAthlete?.id === a.id ? (
                      <tr key={a.id} style={{ background: "#fafafa" }}>
                        <td style={tdStyle}>
                          <input style={T.input} value={editAthlete.name}
                            onChange={e => setEditAthlete(v => v ? { ...v, name: e.target.value } : v)} placeholder="Athlete name" />
                        </td>
                        <td style={tdStyle}>
                          <select style={T.input} value={editAthlete.class_year}
                            onChange={e => setEditAthlete(v => v ? { ...v, class_year: e.target.value } : v)}>
                            <option value="">Select class…</option>
                            {ATHLETE_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                            {/* An existing record whose class predates these four
                                options keeps its own value as a choice, so editing
                                name/event can never silently rewrite it. */}
                            {editAthlete.class_year && !ATHLETE_CLASS_OPTIONS.includes(editAthlete.class_year as typeof ATHLETE_CLASS_OPTIONS[number]) && (
                              <option value={editAthlete.class_year}>{editAthlete.class_year}</option>
                            )}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <input style={T.input} value={editAthlete.event}
                            onChange={e => setEditAthlete(v => v ? { ...v, event: e.target.value } : v)} placeholder="Event / Position (optional)" />
                        </td>
                        <td style={tdStyle}><LinkStatusBadge linked={a.linked} /></td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: ".4rem" }}>
                            <MiniBtn tone="primary" label={saving[`athleteEdit_${a.id}`] ? "Saving…" : "Save"} onClick={saveAthlete} disabled={!!saving[`athleteEdit_${a.id}`]} />
                            <MiniBtn label="Cancel" onClick={() => setEditAthlete(null)} />
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={a.id}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{a.name}</td>
                        <td style={tdStyle}>{a.class_year ?? "—"}</td>
                        <td style={{ ...tdStyle, color: "#6e6e73" }}>{a.event || "—"}</td>
                        <td style={tdStyle}><LinkStatusBadge linked={a.linked} /></td>
                        <td style={tdStyle}>
                          <MiniBtn label="Edit" onClick={() => setEditAthlete({ id: a.id, name: a.name, class_year: a.class_year ?? "", event: a.event ?? "" })} />
                        </td>
                      </tr>
                    )
                  ))}
                  {athletesPageRows.length === 0 && (
                    <tr><td colSpan={5} style={{ ...tdStyle, color: "#98989d", textAlign: "center", padding: "1.25rem" }}>
                      {athleteQuery ? "No athletes match your search." : "No athletes yet. Add one below."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {athletePageCount > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: ".9rem" }}>
                <span style={{ fontSize: ".72rem", color: "#98989d" }}>
                  Page {athletePageClamped + 1} of {athletePageCount}
                </span>
                <div style={{ display: "flex", gap: ".4rem" }}>
                  <MiniBtn label="← Prev" onClick={() => setAthletePage(p => Math.max(0, p - 1))} disabled={athletePageClamped === 0} />
                  <MiniBtn label="Next →" onClick={() => setAthletePage(p => Math.min(athletePageCount - 1, p + 1))} disabled={athletePageClamped >= athletePageCount - 1} />
                </div>
              </div>
            )}

            {/* Add athlete */}
            <div style={{ marginTop: "1.25rem", padding: "1rem", background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f2" }}>
              <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".75rem" }}>Add Athlete</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr auto", gap: ".75rem", alignItems: "end" }}>
                <Field label="Name">
                  <input style={T.input} value={newAthlete.name} onChange={e => setNewAthlete(p => ({ ...p, name: e.target.value }))} placeholder="Athlete name" />
                </Field>
                <Field label="Class">
                  <select style={T.input} value={newAthlete.class_year} onChange={e => setNewAthlete(p => ({ ...p, class_year: e.target.value }))}>
                    <option value="">Select…</option>
                    {ATHLETE_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Event (optional)">
                  <input style={T.input} value={newAthlete.event} onChange={e => setNewAthlete(p => ({ ...p, event: e.target.value }))} placeholder="e.g. Sprints" />
                </Field>
                <MiniBtn tone="primary" label={addingAthlete ? "Adding…" : "+ Add Athlete"} onClick={addAthlete} disabled={addingAthlete} />
              </div>
            </div>

            <p style={{ margin: "1rem 0 0", fontSize: ".72rem", color: "#98989d", lineHeight: 1.5 }}>
              Permanent athlete removal is managed separately to protect fundraising history, contacts, and outreach records.
            </p>
          </div>

          {/* Coaches & Staff — Phase 5A: list/add/invite + fundraiser
              participation, via the legacy admin coach APIs. Deliberately
              no Edit or Remove action — see the audit's findings on
              coach-removal cascade risk and the absence of any existing
              edit capability to preserve. */}
          <div style={T.card}>
            <SectionHeader
              title="Coaches & Staff"
              desc={coaches === null ? "Head coaches, assistant coaches, and boosters on this campaign." : `${coaches.length} staff member${coaches.length !== 1 ? "s" : ""} on this campaign`}
            />

            {coaches === null ? (
              <div style={{ fontSize: ".8rem", color: "#98989d" }}>Loading…</div>
            ) : (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Coach</th>
                        <th style={thStyle}>Email</th>
                        <th style={{ ...thStyle, width: 120 }}>Role</th>
                        <th style={{ ...thStyle, width: 120 }}>Account</th>
                        <th style={{ ...thStyle, width: 190 }}>Fundraising</th>
                        <th style={{ ...thStyle, width: 170 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coaches.map(c => {
                        const fundraiser = coachFundraisers.find(cf => cf.coach_id === c.id);
                        const eligible = c.role === "head_coach" || c.role === "assistant_coach";
                        const active = eligible && (fundraiser?.active ?? false);
                        const goalDollars = fundraiser?.goal_cents != null ? String(Math.round(fundraiser.goal_cents / 100)) : "";
                        const cached = inviteCache[c.id];
                        const isInviting = inviteLoadingId === c.id;
                        return (
                          <tr key={c.id}>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{c.name}</td>
                            <td style={{ ...tdStyle, color: "#6e6e73" }}>{c.email}</td>
                            <td style={tdStyle}><CoachRoleBadge role={c.role} /></td>
                            <td style={tdStyle}><CoachAccountBadge linked={c.linked} pending={c.has_pending_invite} /></td>
                            <td style={tdStyle}>
                              {!features.allow_coach_fundraising ? (
                                <span style={{ fontSize: ".7rem", color: "#c7c7cc" }}>Not enabled</span>
                              ) : !eligible ? (
                                <span style={{ fontSize: ".7rem", color: "#c7c7cc" }}>Not eligible</span>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
                                  <label style={{ display: "flex", alignItems: "center", gap: ".35rem", fontSize: ".75rem", color: "#1d1d1f", cursor: "pointer" }}>
                                    <input
                                      type="checkbox"
                                      checked={active}
                                      disabled={!!saving[`coachFundraiser_${c.id}`]}
                                      onChange={e => toggleCoachFundraiser(c.id, e.target.checked, fundraiser?.goal_cents ?? null)}
                                      style={{ accentColor: "#0b1e3d", cursor: "pointer" }}
                                    />
                                    Participating
                                  </label>
                                  {active && (
                                    <span style={{ display: "flex", alignItems: "center", gap: ".25rem", fontSize: ".72rem", color: "#6e6e73" }}>
                                      Goal $
                                      <input
                                        type="number" min="0"
                                        style={{ ...T.input, width: 64, padding: ".25rem .4rem", fontSize: ".72rem" }}
                                        defaultValue={goalDollars}
                                        onBlur={e => {
                                          const dollars = parseFloat(e.target.value);
                                          const cents = Number.isFinite(dollars) && dollars >= 0 ? Math.round(dollars * 100) : null;
                                          toggleCoachFundraiser(c.id, true, cents);
                                        }}
                                      />
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td style={tdStyle}>
                              <MiniBtn
                                tone={c.linked ? "neutral" : "primary"}
                                label={isInviting ? "…" : c.linked ? "Linked" : c.has_pending_invite ? "Resend Invite" : "Send Invite"}
                                onClick={() => sendInvite(c.id)}
                                disabled={isInviting || c.linked}
                              />
                              {cached && (
                                <div style={{ marginTop: ".4rem" }}>
                                  <MiniBtn label={expandedInviteId === c.id ? "Hide Link" : "Copy Link"} onClick={() => setExpandedInviteId(expandedInviteId === c.id ? null : c.id)} />
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {coaches.length === 0 && (
                        <tr><td colSpan={6} style={{ ...tdStyle, color: "#98989d", textAlign: "center", padding: "1.25rem" }}>No coaches yet. Add one below.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {!features.allow_coach_fundraising && (
                  <p style={{ margin: "1rem 0 0", fontSize: ".72rem", color: "#98989d", lineHeight: 1.5 }}>
                    Individual coach fundraising is currently disabled for this campaign. Enable it under <strong>Branding &amp; Page → Feature Toggles</strong> to let eligible coaches participate.
                  </p>
                )}

                {/* Invite link panel — shown for the expanded coach, same
                    "only exists this session" guarantee as Legacy. */}
                {expandedInviteId && inviteCache[expandedInviteId] && (
                  <div style={{ marginTop: "1rem", padding: "1rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".5rem" }}>
                      <div style={{ fontWeight: 700, fontSize: ".82rem", color: "#0b1e3d" }}>
                        Invite Link — {coaches.find(c => c.id === expandedInviteId)?.name}
                      </div>
                      <MiniBtn label="Dismiss" onClick={() => setExpandedInviteId(null)} />
                    </div>
                    <p style={{ margin: "0 0 .5rem", fontSize: ".76rem", color: "#374151" }}>
                      {inviteCache[expandedInviteId].emailSent
                        ? "Invite email sent. You can also share this link directly:"
                        : "Email not sent — share this link manually:"}
                      {" "}Expires in 24 hours, single-use.
                    </p>
                    <div style={{ display: "flex", gap: ".5rem", alignItems: "center", background: "#fff", border: "1px solid #d1d5db", borderRadius: 7, padding: ".45rem .65rem" }}>
                      <span style={{ flex: 1, fontSize: ".74rem", color: "#374151", wordBreak: "break-all" }}>{inviteCache[expandedInviteId].url}</span>
                      <button
                        onClick={() => navigator.clipboard?.writeText(inviteCache[expandedInviteId].url).then(() => show("Link copied.")).catch(() => show("Couldn't copy link.", "error"))}
                        style={{ fontSize: ".68rem", fontWeight: 600, color: "#0b1e3d", background: "#f0f2f7", border: "1px solid #e5e7eb", borderRadius: 6, padding: ".3rem .55rem", cursor: "pointer", flexShrink: 0 }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {/* Add coach */}
                <div style={{ marginTop: "1.25rem", padding: "1rem", background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f2" }}>
                  <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".75rem" }}>Add Coach</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem", marginBottom: ".75rem" }}>
                    <Field label="Name">
                      <input style={T.input} value={newCoach.name} onChange={e => setNewCoach(p => ({ ...p, name: e.target.value }))} placeholder="Coach name" />
                    </Field>
                    <Field label="Email">
                      <input type="email" style={T.input} value={newCoach.email} onChange={e => setNewCoach(p => ({ ...p, email: e.target.value }))} placeholder="coach@school.edu" />
                    </Field>
                    <Field label="Role">
                      <select style={T.input} value={newCoach.role} onChange={e => setNewCoach(p => ({ ...p, role: e.target.value }))}>
                        {COACH_ROLES.map(r => <option key={r} value={r}>{COACH_ROLE_LABELS[r]}</option>)}
                      </select>
                    </Field>
                    <Field label="Temporary Password" note="Lets the coach sign in right away; an invite link also works.">
                      <input type="password" style={T.input} value={newCoach.password} onChange={e => setNewCoach(p => ({ ...p, password: e.target.value }))} placeholder="Min 8 characters" />
                    </Field>
                  </div>
                  <MiniBtn tone="primary" label={addingCoach ? "Adding…" : "+ Add Coach"} onClick={addCoach} disabled={addingCoach} />
                </div>

                <p style={{ margin: "1rem 0 0", fontSize: ".72rem", color: "#98989d", lineHeight: 1.5 }}>
                  The coach receives their access information through ELF&rsquo;s existing account workflow. Staff removal is managed separately to protect team communications and fundraising history.
                </p>
              </>
            )}
          </div>

          {athletes.length > 0 && (
            <div style={T.card}>
              <SectionHeader title="Per-Athlete Goal Overrides" desc="Override the default contact goal for individual athletes. Leave blank to use the team default." />
              <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {athletes.map(a => {
                  const override = perAthleteGoals[a.id];
                  return (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".6rem 0", borderBottom: "1px solid #f5f5f7" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: ".82rem", fontWeight: 600, color: "#1d1d1f" }}>{a.name}</div>
                        <div style={{ fontSize: ".68rem", color: "#98989d" }}>{a.event}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                        <input type="number" min="1" max="999"
                          placeholder={String(contact.goal)}
                          value={override ?? ""}
                          onChange={e => {
                            const v = parseInt(e.target.value);
                            setPerAthleteGoals(p => {
                              if (isNaN(v)) { const next = { ...p }; delete next[a.id]; return next; }
                              return { ...p, [a.id]: v };
                            });
                          }}
                          style={{ ...T.input, width: 72, textAlign: "center" }} />
                        <button
                          onClick={() => { if (override && override > 0) savePerAthleteGoal(a.id, override); }}
                          disabled={!override || !!saving[`athlete_${a.id}`]}
                          style={{ padding: ".35rem .65rem", background: override ? "#0b1e3d" : "#f0f0f2", color: override ? "#fff" : "#c7c7cc", border: "none", borderRadius: 7, cursor: override ? "pointer" : "default", fontSize: ".72rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {saving[`athlete_${a.id}`] ? "…" : "Save"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BRANDING & PAGE ── */}
      {tab === "branding" && (
        <div>
          <div style={T.card}>
            <SectionHeader title="Branding" desc="Team colors and logo" />
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={T.grid2}>
                <Field label="Primary Team Color">
                  <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                    <input type="color" value={branding.primary_color.match(/^#[0-9a-fA-F]{6}$/) ? branding.primary_color : "#000000"}
                      onChange={e => setBranding(p => ({ ...p, primary_color: e.target.value }))}
                      style={{ width: 38, height: 36, border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", padding: 2, flexShrink: 0 }} />
                    <input style={T.input} value={branding.primary_color} onChange={e => setBranding(p => ({ ...p, primary_color: e.target.value }))} placeholder="#000000" />
                  </div>
                </Field>
                <Field label="Secondary Team Color">
                  <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                    <input type="color" value={branding.secondary_color.match(/^#[0-9a-fA-F]{6}$/) ? branding.secondary_color : "#000000"}
                      onChange={e => setBranding(p => ({ ...p, secondary_color: e.target.value }))}
                      style={{ width: 38, height: 36, border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", padding: 2, flexShrink: 0 }} />
                    <input style={T.input} value={branding.secondary_color} onChange={e => setBranding(p => ({ ...p, secondary_color: e.target.value }))} placeholder="#000000" />
                  </div>
                </Field>
              </div>

              {/* Logo — real upload (Phase 4), same /api/admin/logo-upload
                  endpoint, validation, and storage bucket the legacy
                  creation wizard already uses. Manual URL entry remains
                  available as a fallback below. */}
              <Field label="Campaign Logo" note="PNG, JPEG, WebP, or SVG · max 5MB · resized to fit 512×512">
                <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flexWrap: "wrap" }}>
                  {branding.logo_url && (
                    <img src={branding.logo_url} alt="Current logo" style={{ width: 52, height: 52, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", padding: 4, flexShrink: 0 }} />
                  )}
                  <label style={{
                    display: "inline-flex", alignItems: "center", gap: ".4rem",
                    padding: ".5rem .9rem",
                    background: logoUploading ? "#f9fafb" : "#f5f5f7",
                    border: "1px solid #e5e7eb", borderRadius: 8,
                    fontSize: ".8rem", fontWeight: 600,
                    color: logoUploading ? "#9ca3af" : "#1d1d1f",
                    cursor: logoUploading ? "not-allowed" : "pointer",
                    flexShrink: 0,
                  }}>
                    {logoUploading ? "Uploading…" : branding.logo_url ? "Change Logo" : "Upload Logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      style={{ display: "none" }}
                      disabled={logoUploading}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        e.target.value = ""; // allow re-selecting the same file later
                        if (f) uploadLogo(f);
                      }}
                    />
                  </label>
                </div>
              </Field>

              <Field label="Logo URL (advanced)" note="Only needed if you want to point at an external image instead of uploading one. Changing this still requires Save below.">
                <input style={T.input} value={branding.logo_url} onChange={e => setBranding(p => ({ ...p, logo_url: e.target.value }))} placeholder="/logo.png or https://…" />
              </Field>

              {/* Color preview */}
              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 36 }}>
                <div style={{ flex: 1, background: branding.primary_color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: ".65rem", fontWeight: 700, color: "#fff", opacity: .85 }}>Primary · {branding.primary_color}</span>
                </div>
                <div style={{ flex: 1, background: branding.secondary_color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: ".65rem", fontWeight: 700, color: "#fff", opacity: .85 }}>Secondary · {branding.secondary_color}</span>
                </div>
              </div>

              <SaveBtn saving={!!saving.branding} onClick={saveBranding} label="Save branding" />
            </div>
          </div>

          <div style={T.card}>
            <SectionHeader title="Campaign Colors" desc="Controls the fundraising page's look and feel — hero, buttons, section accents, headings, cards, progress bars. Independent of the team colors above; leave any field blank to use the matching team color." />
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={T.grid2}>
                <OptionalColorField label="Primary Theme Color"   value={branding.theme_primary_color}   fallback={branding.primary_color}   onChange={v => setBranding(p => ({ ...p, theme_primary_color: v }))} />
                <OptionalColorField label="Secondary Theme Color" value={branding.theme_secondary_color} fallback={branding.secondary_color} onChange={v => setBranding(p => ({ ...p, theme_secondary_color: v }))} />
                <OptionalColorField label="Accent Color"          value={branding.theme_accent_color}    fallback={branding.theme_secondary_color ?? branding.secondary_color} onChange={v => setBranding(p => ({ ...p, theme_accent_color: v }))} />
                <OptionalColorField label="Button Color"          value={branding.theme_button_color}    fallback={branding.theme_primary_color ?? branding.primary_color}     onChange={v => setBranding(p => ({ ...p, theme_button_color: v }))} />
              </div>

              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 36 }}>
                <div style={{ flex: 1, background: branding.theme_primary_color ?? branding.primary_color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: ".62rem", fontWeight: 700, color: "#fff", opacity: .85 }}>Primary</span>
                </div>
                <div style={{ flex: 1, background: branding.theme_secondary_color ?? branding.secondary_color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: ".62rem", fontWeight: 700, color: "#fff", opacity: .85 }}>Secondary</span>
                </div>
                <div style={{ flex: 1, background: branding.theme_accent_color ?? branding.theme_secondary_color ?? branding.secondary_color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: ".62rem", fontWeight: 700, color: "#fff", opacity: .85 }}>Accent</span>
                </div>
                <div style={{ flex: 1, background: branding.theme_button_color ?? branding.theme_primary_color ?? branding.primary_color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: ".62rem", fontWeight: 700, color: "#fff", opacity: .85 }}>Button</span>
                </div>
              </div>

              <SaveBtn saving={!!saving.branding} onClick={saveBranding} label="Save campaign colors" />
            </div>
          </div>

          <div style={T.card}>
            <SectionHeader title="Feature Toggles" desc="Control which sections appear on the public campaign page" />
            <div>
              {([
                ["show_donation_card",    "Donation Card",           "The main donation form on the campaign page"],
                ["show_leaderboard",      "Athlete Leaderboard",     "Ranked list of athletes by funds raised"],
                ["show_program_identity", "Program Identity",        "School name, mascot, and program details header"],
                ["show_share_section",    "Share This Campaign",     "Social share and QR code section"],
                ["show_fund_uses",        "Where Your Money Goes",   "Fund use breakdown section"],
                ["show_recent_donations", "Recent Donations Feed",   "Live feed of recent donors"],
                ["show_sponsors",         "Sponsors",                "Sponsor logos and tier listings"],
                ["allow_coach_fundraising", "Allow Coaches to Fundraise", "Lets coaches opt into their own personal fundraising page"],
              ] as [keyof typeof features, string, string][]).map(([key, label, desc]) => (
                <ToggleRow key={key} label={label} desc={desc} checked={features[key]}
                  onChange={v => setFeatures(p => ({ ...p, [key]: v }))} />
              ))}
            </div>
            <SaveBtn saving={!!saving.features} onClick={saveFeatures} label="Save feature toggles" />
          </div>
        </div>
      )}

      {/* ── SPONSORS ── */}
      {tab === "sponsors" && (
        <div>
          <div style={T.card}>
            <SectionHeader
              title="Campaign Sponsors"
              desc={
                sponsors === null
                  ? "Sponsor logos and tiers shown on this campaign's public page."
                  : `${sponsors.length} sponsor${sponsors.length !== 1 ? "s" : ""} on this campaign · shown on the public campaign page`
              }
            />

            {sponsors === null ? (
              <div style={{ fontSize: ".8rem", color: "#98989d" }}>Loading…</div>
            ) : (
              <>
                {!features.show_sponsors && (
                  <div style={{ padding: ".5rem .75rem", background: "#fef9c3", border: "1px solid #fde047", borderRadius: 7, fontSize: ".72rem", color: "#854d0e", fontWeight: 500, marginBottom: ".9rem" }}>
                    The Sponsors section is currently hidden on the public page. Enable it under <strong>Branding &amp; Page → Feature Toggles</strong>.
                  </div>
                )}

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Sponsor</th>
                        <th style={{ ...thStyle, width: 100 }}>Tier</th>
                        <th style={thStyle}>URL</th>
                        <th style={{ ...thStyle, width: 150 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sponsors.map(s => (
                        editS?.id === s.id ? (
                          <tr key={s.id} style={{ background: "#fafafa" }}>
                            <td style={tdStyle}>
                              <input style={T.input} value={editS.name}
                                onChange={e => setEditS(v => v ? { ...v, name: e.target.value } : v)} placeholder="Business name" />
                            </td>
                            <td style={tdStyle}>
                              <select style={T.input} value={editS.tier}
                                onChange={e => setEditS(v => v ? { ...v, tier: e.target.value } : v)}>
                                {SPONSOR_TIERS.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                                {/* An existing record whose tier predates the three
                                    standard options keeps its own value as a choice,
                                    so editing name/URL can never silently rewrite it. */}
                                {!SPONSOR_TIERS.includes(editS.tier as typeof SPONSOR_TIERS[number]) && (
                                  <option value={editS.tier}>{editS.tier}</option>
                                )}
                              </select>
                            </td>
                            <td style={tdStyle}>
                              <input style={T.input} value={editS.url}
                                onChange={e => setEditS(v => v ? { ...v, url: e.target.value } : v)} placeholder="https://…" />
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", gap: ".4rem" }}>
                                <MiniBtn tone="primary" label={saving[`sponsor_${s.id}`] ? "Saving…" : "Save"} onClick={saveSponsor} disabled={!!saving[`sponsor_${s.id}`]} />
                                <MiniBtn label="Cancel" onClick={() => setEditS(null)} />
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={s.id}>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{s.name}</td>
                            <td style={tdStyle}><TierBadge tier={s.tier} /></td>
                            <td style={{ ...tdStyle, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0b1e3d", fontSize: ".76rem" }}>{s.url}</a>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", gap: ".4rem" }}>
                                <MiniBtn label="Edit" onClick={() => setEditS({ ...s })} />
                                <MiniBtn tone="danger" label="Delete" onClick={() => deleteSponsor(s.id, s.name)} />
                              </div>
                            </td>
                          </tr>
                        )
                      ))}
                      {sponsors.length === 0 && (
                        <tr><td colSpan={4} style={{ ...tdStyle, color: "#98989d", textAlign: "center", padding: "1.25rem" }}>No sponsors yet. Add one below.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add sponsor */}
                <div style={{ marginTop: "1.25rem", padding: "1rem", background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f2" }}>
                  <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".75rem" }}>Add Sponsor</div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: ".75rem", alignItems: "end" }}>
                    <Field label="Name">
                      <input style={T.input} value={newS.name} onChange={e => setNewS(p => ({ ...p, name: e.target.value }))} placeholder="Business name" />
                    </Field>
                    <Field label="Tier">
                      <select style={T.input} value={newS.tier} onChange={e => setNewS(p => ({ ...p, tier: e.target.value }))}>
                        {SPONSOR_TIERS.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
                      </select>
                    </Field>
                    <Field label="URL">
                      <input style={T.input} value={newS.url} onChange={e => setNewS(p => ({ ...p, url: e.target.value }))} placeholder="https://…" />
                    </Field>
                    <MiniBtn tone="primary" label={addingSponsor ? "Adding…" : "+ Add Sponsor"} onClick={addSponsor} disabled={addingSponsor} />
                  </div>
                </div>

                <p style={{ margin: "1rem 0 0", fontSize: ".72rem", color: "#98989d", lineHeight: 1.5 }}>
                  These are this campaign&rsquo;s public sponsor listings. The platform-wide{" "}
                  <a href="/admin/sponsors" style={{ color: "#0b1e3d", fontWeight: 600 }}>Sponsor CRM</a> is a separate system for
                  tracking ELF&rsquo;s own sponsor relationships and is not affected by this page.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ADVANCED ── */}
      {tab === "advanced" && (
        <div>
          <div style={T.card}>
            <SectionHeader title="Campaign Status" desc="Controls public visibility" />
            <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
              {[
                { value: "live",     label: "Live",     desc: "Publicly accessible",           active: !archived },
                { value: "archived", label: "Archived", desc: "Hidden from public",             active: archived },
                { value: "draft",    label: "Draft",    desc: "Requires DB migration",          active: false,  disabled: true },
                { value: "demo",     label: "Demo",     desc: "Requires DB migration",          active: false,  disabled: true },
              ].map(s => (
                <button key={s.value}
                  onClick={() => { if (!s.disabled) { if (s.value === "live" && archived) toggleArchived(); else if (s.value === "archived" && !archived) toggleArchived(); } }}
                  disabled={s.disabled || s.active}
                  style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".6rem .85rem", borderRadius: 9, border: `1.5px solid ${s.active ? "#0b1e3d" : "#e5e7eb"}`, background: s.active ? "#eff0f3" : "#fff", cursor: s.disabled ? "default" : s.active ? "default" : "pointer", opacity: s.disabled ? .45 : 1, textAlign: "left" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.active ? "#0b1e3d" : s.disabled ? "#d1d5db" : "#e5e7eb", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: ".8rem", fontWeight: s.active ? 700 : 500, color: s.active ? "#0b1e3d" : s.disabled ? "#c7c7cc" : "#1d1d1f" }}>{s.label}</div>
                    <div style={{ fontSize: ".68rem", color: "#98989d" }}>{s.desc}</div>
                  </div>
                  {s.disabled && <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#c7c7cc", background: "#f3f4f6", padding: ".1rem .4rem", borderRadius: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>Soon</span>}
                </button>
              ))}
            </div>
          </div>

          <div style={T.card}>
            <SectionHeader title="Quick Actions" />
            <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
              {[
                { label: "Registration dashboard",  href: `/admin/campaigns/${slug}/registration`, external: false },
                { label: "Open campaign page",      href: `/campaign/${slug}`,                    external: true },
                { label: "Open team hub",           href: `/team/${slug}/home`,                   external: true },
              ].map(a => (
                <a key={a.label} href={a.href} target={a.external ? "_blank" : undefined} rel={a.external ? "noopener noreferrer" : undefined}
                  style={{ padding: ".5rem .75rem", background: "#f5f5f7", borderRadius: 8, fontSize: ".78rem", fontWeight: 500, color: "#1d1d1f", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {a.label}
                  <span style={{ color: "#98989d" }}>{a.external ? "↗" : "→"}</span>
                </a>
              ))}
            </div>

            {/* Retirement Stage 1: the only remaining user-facing entry
                point into /admin/edit, deliberately de-emphasized (muted
                text style, not a MiniBtn/primary action) and scoped to its
                actual current purpose — athlete/staff removal — rather than
                presented as a second campaign editor. Destination and
                behavior are unchanged; only the label/framing changed. */}
            <div style={{ marginTop: ".75rem", paddingTop: ".75rem", borderTop: "1px solid #f5f5f7" }}>
              <a href="/admin/edit"
                style={{ padding: ".5rem .75rem", background: "#f5f5f7", borderRadius: 8, fontSize: ".78rem", fontWeight: 500, color: "#6e6e73", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                Legacy Removal Tools
                <span style={{ color: "#98989d" }}>→</span>
              </a>
              <p style={{ margin: ".4rem 0 0", fontSize: ".7rem", color: "#98989d", lineHeight: 1.4 }}>
                Temporarily available for athlete or staff removal while safer removal tools are being developed.
              </p>
            </div>
          </div>

          {/* Danger Zone — deliberately separate from Status/Archive above.
              Archive is the recommended workflow for everything short of a
              legal/compliance deletion request; this is not offered as an
              equivalent alternative. */}
          <div style={{ ...T.card, border: "1px solid #fecaca" }}>
            <SectionHeader title="Danger Zone" desc="Irreversible. Archive is almost always what you want instead." />
            <button
              onClick={() => setShowDeleteModal(true)}
              style={{ padding: ".5rem .9rem", background: "#fff", border: "1.5px solid #fecaca", borderRadius: 8, fontSize: ".78rem", fontWeight: 600, color: "#dc2626", cursor: "pointer" }}
            >
              Permanently delete campaign…
            </button>
          </div>
        </div>
      )}

      {/* Roster import — parse/review/confirm, never writes until the admin confirms */}
      {showRosterImport && (
        <RosterImportModal
          campaignSlug={detail.campaign_slug}
          onClose={() => setShowRosterImport(false)}
          onImported={created => {
            if (created.length > 0) {
              setAthletes(p => [
                ...p,
                ...created.map(a => ({ id: a.id, name: a.name, event: a.event ?? "", class_year: a.class_year, jersey_number: null, grad_year: null, linked: false })),
              ]);
              show(`Imported ${created.length} athlete${created.length !== 1 ? "s" : ""}.`);
            }
          }}
        />
      )}

      {/* Permanent delete confirmation */}
      {showDeleteModal && (
        <div
          onClick={() => { if (!deleting) { setShowDeleteModal(false); setDeleteConfirmText(""); } }}
          style={{
            position: "fixed", inset: 0, zIndex: 500,
            background: "rgba(0,0,0,.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 14, padding: "1.5rem",
              width: "min(440px, 100%)", maxHeight: "min(90vh, 90dvh)", overflowY: "auto",
              boxShadow: "0 12px 48px rgba(0,0,0,.3)",
            }}
          >
            <h3 style={{ margin: "0 0 .5rem", fontSize: "1.05rem", fontWeight: 800, color: "#dc2626" }}>
              Permanently delete this campaign?
            </h3>
            <p style={{ margin: "0 0 .75rem", fontSize: ".82rem", color: "#4b5563", lineHeight: 1.5 }}>
              This removes <strong>{detail.school_name || slug}</strong> and every related record —
              athletes, coaches, members, donations, sponsors, calendar, files, messages — permanently.
              There is no undo. If you just want to hide this campaign, close this and use{" "}
              <strong>Archive</strong> instead.
            </p>
            <label style={{ display: "block", fontSize: ".72rem", fontWeight: 700, color: "#374151", marginBottom: ".3rem" }}>
              Type DELETE to confirm
            </label>
            <input
              autoFocus
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              style={{
                width: "100%", boxSizing: "border-box", padding: ".55rem .7rem",
                borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: ".85rem",
                marginBottom: "1rem",
              }}
            />
            <div style={{ display: "flex", gap: ".6rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}
                disabled={deleting}
                style={{ padding: ".5rem 1rem", background: "#f5f5f7", border: "none", borderRadius: 8, fontSize: ".8rem", fontWeight: 600, color: "#1d1d1f", cursor: deleting ? "default" : "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentDelete}
                disabled={deleteConfirmText !== "DELETE" || deleting}
                style={{
                  padding: ".5rem 1rem", background: "#dc2626", border: "none", borderRadius: 8,
                  fontSize: ".8rem", fontWeight: 700, color: "#fff",
                  cursor: deleteConfirmText !== "DELETE" || deleting ? "default" : "pointer",
                  opacity: deleteConfirmText !== "DELETE" || deleting ? .5 : 1,
                }}
              >
                {deleting ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
