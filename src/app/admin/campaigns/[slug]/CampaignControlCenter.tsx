"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { defaultSeasonLabel } from "@/lib/campaignSeason";

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
  // Phase 1: read-only count only — campaign-level sponsor CRUD stays in
  // the legacy editor (/admin/edit) for this phase. See Sponsors tab.
  sponsor_count:         number;
  // relational
  athletes: { id: string; name: string; event: string; jersey_number: number | null; grad_year: number | null }[];
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

function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div role="tablist" aria-label="Campaign sections" style={{ display: "flex", gap: ".25rem", borderBottom: "1px solid #e5e7eb", marginBottom: "1.25rem", overflowX: "auto" }}>
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
              marginBottom: "-1px",
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
  });

  const [contact, setContact] = useState({
    goal:               detail.contact_goal,
    requirement:        detail.contact_requirement ?? "phone_or_email",
    needsMigration:     detail.contact_requirement === null,
  });

  const [perAthleteGoals, setPerAthleteGoals] = useState<Record<string, number>>(detail.per_athlete_goals ?? {});

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

  const [archived, setArchived] = useState(detail.archived);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

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
            <p style={{ margin: "1rem 0 0", fontSize: ".75rem", color: "#98989d" }}>
              Adding, editing, or removing athletes and coaches is still managed in the{" "}
              <a href="/admin/edit" style={{ color: "#0b1e3d", fontWeight: 600 }}>legacy editor</a> for now.
            </p>
          </div>

          {detail.athletes.length > 0 && (
            <div style={T.card}>
              <SectionHeader title="Per-Athlete Goal Overrides" desc="Override the default contact goal for individual athletes. Leave blank to use the team default." />
              <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {detail.athletes.map(a => {
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
                <Field label="Logo URL" note="/pvcc-logo.png or full https:// URL">
                  <input style={T.input} value={branding.logo_url} onChange={e => setBranding(p => ({ ...p, logo_url: e.target.value }))} placeholder="/logo.png" />
                </Field>
              </div>

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
            <SectionHeader title="Sponsors" desc="Campaign-level sponsor logos and tiers shown on the public page" />
            <StatChip label="Sponsors" value={detail.sponsor_count} />
            <p style={{ margin: "1rem 0 0", fontSize: ".75rem", color: "#98989d" }}>
              Adding, editing, or removing sponsors for this campaign is still managed in the{" "}
              <a href="/admin/edit" style={{ color: "#0b1e3d", fontWeight: 600 }}>legacy editor</a> for now. The platform-wide{" "}
              <a href="/admin/sponsors" style={{ color: "#0b1e3d", fontWeight: 600 }}>Sponsor CRM</a> is a separate system for tracking ELF&rsquo;s own sponsor relationships and is not affected by this page.
            </p>
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
                { label: "Open legacy editor",      href: "/admin/edit",                          external: false },
              ].map(a => (
                <a key={a.label} href={a.href} target={a.external ? "_blank" : undefined} rel={a.external ? "noopener noreferrer" : undefined}
                  style={{ padding: ".5rem .75rem", background: "#f5f5f7", borderRadius: 8, fontSize: ".78rem", fontWeight: 500, color: "#1d1d1f", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {a.label}
                  <span style={{ color: "#98989d" }}>{a.external ? "↗" : "→"}</span>
                </a>
              ))}
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
