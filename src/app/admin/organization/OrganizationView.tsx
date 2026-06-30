"use client";

import { useState } from "react";
import type { OrgRow, CommunicationTemplate, SponsorPackage } from "./page";

// ── Types ─────────────────────────────────────────────────────────────────────

type Profile = {
  school_name: string; nickname: string; logo_url: string;
  primary_color: string; secondary_color: string; default_team_photo_url: string;
  address: string; city: string; state: string; zip: string;
  website: string; short_description: string;
  athletic_director: string; athletic_director_email: string; athletic_director_phone: string;
};

type Defaults = {
  default_layout:                 string;
  default_fundraising_goal_cents: number;
  default_athlete_goal_cents:     number;
  default_contact_goal:           number;
  default_campaign_length_days:   number;
  default_show_leaderboard:       boolean;
  default_show_program_identity:  boolean;
  default_show_share_section:     boolean;
  default_show_fund_uses:         boolean;
  default_show_recent_donations:  boolean;
  default_show_sponsors:          boolean;
  default_show_donation_card:     boolean;
};

type TemplateState = { type: string; subject: string; body_text: string };

type NewPkg = { name: string; tier: string; description: string; amount_cents: number };

type Props = {
  org:       OrgRow | null;
  templates: CommunicationTemplate[];
  packages:  SponsorPackage[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = ["Profile", "Campaign Defaults", "Communication", "Sponsor Packages"];

const TEMPLATE_DEFS = [
  { type: "coach_welcome",            label: "Coach Welcome",            desc: "Sent when a new coach is added to a campaign." },
  { type: "parent_welcome",           label: "Parent Welcome",           desc: "Sent when a parent links their athlete account." },
  { type: "athlete_welcome",          label: "Athlete Welcome",          desc: "Sent when an athlete activates their account." },
  { type: "donation_thank_you",       label: "Donation Thank You",       desc: "Sent to donors after a successful donation." },
  { type: "registration_confirmation",label: "Registration Confirmation",desc: "Sent when an athlete completes registration." },
];

const TIER_OPTIONS = ["gold", "silver", "bronze", "community", "platinum", "presenting"];

// ── Helpers ───────────────────────────────────────────────────────────────────

const $ = (x: number) =>
  x > 0 ? `$${(x / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: ".5rem .75rem", border: "1px solid #e5e7eb",
  borderRadius: 8, fontSize: ".85rem", color: "#1d1d1f", background: "#fff",
  outline: "none", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: ".72rem", fontWeight: 600, color: "#6e6e73",
  textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".35rem",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #f0f0f2", borderRadius: 12, padding: "1.5rem", marginBottom: "1.25rem", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "1rem", paddingBottom: ".5rem", borderBottom: "1px solid #f5f5f7" }}>
      {children}
    </div>
  );
}

function SaveRow({ saving, msg, onSave, label = "Save Changes" }: { saving: boolean; msg: string; onSave: () => void; label?: string }) {
  const isErr = msg && !msg.includes("Saved");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "1.25rem" }}>
      <button onClick={onSave} disabled={saving}
        style={{ padding: ".55rem 1.25rem", background: saving ? "#98989d" : "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".83rem", fontWeight: 600, cursor: saving ? "default" : "pointer" }}>
        {saving ? "Saving…" : label}
      </button>
      {msg && (
        <span style={{ fontSize: ".8rem", fontWeight: 600, color: isErr ? "#dc2626" : "#16a34a" }}>{msg}</span>
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 40, height: 36, padding: 2, border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", flexShrink: 0 }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          maxLength={7}
          style={{ ...inputStyle, width: 110, fontFamily: "monospace", letterSpacing: ".05em" }} />
      </div>
    </Field>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: ".75rem", cursor: "pointer", paddingBottom: ".625rem", borderBottom: "1px solid #f5f5f7" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: "#0b1e3d", cursor: "pointer" }} />
      <div>
        <div style={{ fontSize: ".83rem", fontWeight: 500, color: "#1d1d1f" }}>{label}</div>
        {desc && <div style={{ fontSize: ".72rem", color: "#98989d", marginTop: ".1rem" }}>{desc}</div>}
      </div>
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OrganizationView({ org, templates: initialTemplates, packages: initialPackages }: Props) {
  const [tab, setTab] = useState(0);

  // Profile state
  const [profile, setProfile] = useState<Profile>({
    school_name:            org?.school_name            ?? "",
    nickname:               org?.nickname               ?? "",
    logo_url:               org?.logo_url               ?? "",
    primary_color:          org?.primary_color          ?? "#1B4FA8",
    secondary_color:        org?.secondary_color        ?? "#C4A35A",
    default_team_photo_url: org?.default_team_photo_url ?? "",
    address:                org?.address                ?? "",
    city:                   org?.city                   ?? "",
    state:                  org?.state                  ?? "",
    zip:                    org?.zip                    ?? "",
    website:                org?.website                ?? "",
    short_description:      org?.short_description      ?? "",
    athletic_director:       org?.athletic_director       ?? "",
    athletic_director_email: org?.athletic_director_email ?? "",
    athletic_director_phone: org?.athletic_director_phone ?? "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg,    setProfileMsg]    = useState("");

  // Defaults state
  const [defaults, setDefaults] = useState<Defaults>({
    default_layout:                 org?.default_layout                  ?? "classic",
    default_fundraising_goal_cents: org?.default_fundraising_goal_cents  ?? 0,
    default_athlete_goal_cents:     org?.default_athlete_goal_cents      ?? 0,
    default_contact_goal:           org?.default_contact_goal            ?? 10,
    default_campaign_length_days:   org?.default_campaign_length_days    ?? 30,
    default_show_leaderboard:       org?.default_show_leaderboard        ?? true,
    default_show_program_identity:  org?.default_show_program_identity   ?? true,
    default_show_share_section:     org?.default_show_share_section      ?? true,
    default_show_fund_uses:         org?.default_show_fund_uses          ?? true,
    default_show_recent_donations:  org?.default_show_recent_donations   ?? true,
    default_show_sponsors:          org?.default_show_sponsors           ?? true,
    default_show_donation_card:     org?.default_show_donation_card      ?? true,
  });
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsMsg,    setDefaultsMsg]    = useState("");

  // Templates state
  const [templates, setTemplates] = useState<TemplateState[]>(
    TEMPLATE_DEFS.map(td => {
      const found = initialTemplates.find(t => t.type === td.type);
      return { type: td.type, subject: found?.subject ?? "", body_text: found?.body_text ?? "" };
    }),
  );
  const [tmplSaving, setTmplSaving] = useState<Record<string, boolean>>({});
  const [tmplMsg,    setTmplMsg]    = useState<Record<string, string>>({});

  // Packages state
  const [packages,  setPackages]  = useState<SponsorPackage[]>(initialPackages);
  const [newPkg,    setNewPkg]    = useState<NewPkg>({ name: "", tier: "gold", description: "", amount_cents: 0 });
  const [pkgSaving, setPkgSaving] = useState(false);
  const [pkgMsg,    setPkgMsg]    = useState("");

  // ── Savers ─────────────────────────────────────────────────────────────────

  async function saveSection(body: object, setSaving: (b: boolean) => void, setMsg: (s: string) => void) {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setMsg(d.error ?? "Save failed."); return; }
      setMsg("Saved!");
      setTimeout(() => setMsg(""), 3000);
    } catch {
      setMsg("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate(t: TemplateState) {
    setTmplSaving(p => ({ ...p, [t.type]: true }));
    setTmplMsg(p => ({ ...p, [t.type]: "" }));
    try {
      const res = await fetch("/api/admin/organization/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t),
      });
      const d = await res.json() as { error?: string };
      const msg = !res.ok ? (d.error ?? "Save failed.") : "Saved!";
      setTmplMsg(p => ({ ...p, [t.type]: msg }));
      if (res.ok) setTimeout(() => setTmplMsg(p => ({ ...p, [t.type]: "" })), 3000);
    } catch {
      setTmplMsg(p => ({ ...p, [t.type]: "Network error." }));
    } finally {
      setTmplSaving(p => ({ ...p, [t.type]: false }));
    }
  }

  async function addPackage() {
    if (!newPkg.name.trim()) return;
    setPkgSaving(true);
    setPkgMsg("");
    try {
      const res = await fetch("/api/admin/organization/sponsor-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newPkg, sort_order: packages.length }),
      });
      const d = await res.json() as SponsorPackage & { error?: string };
      if (!res.ok) { setPkgMsg(d.error ?? "Failed to add."); return; }
      setPackages(p => [...p, d]);
      setNewPkg({ name: "", tier: "gold", description: "", amount_cents: 0 });
    } catch {
      setPkgMsg("Network error.");
    } finally {
      setPkgSaving(false);
    }
  }

  async function deletePackage(id: string) {
    const res = await fetch(`/api/admin/organization/sponsor-packages/${id}`, { method: "DELETE" });
    if (res.ok) setPackages(p => p.filter(x => x.id !== id));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "1.75rem 2rem", maxWidth: 860 }}>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: ".25rem", marginBottom: "1.75rem", background: "#f5f5f7", padding: ".25rem", borderRadius: 10, width: "fit-content" }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{
              padding: ".42rem .875rem", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: ".8rem", fontWeight: tab === i ? 600 : 500,
              background: tab === i ? "#fff" : "none",
              color:      tab === i ? "#1d1d1f" : "#6e6e73",
              boxShadow:  tab === i ? "0 1px 3px rgba(0,0,0,.1)" : "none",
              transition: "all .15s",
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab 0: Profile ──────────────────────────────────────────────────── */}
      {tab === 0 && (
        <>
          <Card>
            <SectionTitle>School Identity</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <Field label="School Name">
                <input style={inputStyle} value={profile.school_name}
                  onChange={e => setProfile(p => ({ ...p, school_name: e.target.value }))}
                  placeholder="Paradise Valley High School" />
              </Field>
              <Field label="Nickname / Mascot">
                <input style={inputStyle} value={profile.nickname}
                  onChange={e => setProfile(p => ({ ...p, nickname: e.target.value }))}
                  placeholder="Tigers" />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
              <ColorField label="Primary Color"   value={profile.primary_color}
                onChange={v => setProfile(p => ({ ...p, primary_color: v }))} />
              <ColorField label="Secondary Color" value={profile.secondary_color}
                onChange={v => setProfile(p => ({ ...p, secondary_color: v }))} />
              <div>
                {/* Color preview */}
                <label style={labelStyle}>Preview</label>
                <div style={{ display: "flex", gap: ".4rem" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 6, background: profile.primary_color, border: "1px solid rgba(0,0,0,.08)" }} />
                  <div style={{ width: 36, height: 36, borderRadius: 6, background: profile.secondary_color, border: "1px solid rgba(0,0,0,.08)" }} />
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
              <Field label="School Logo URL">
                <input style={inputStyle} value={profile.logo_url}
                  onChange={e => setProfile(p => ({ ...p, logo_url: e.target.value }))}
                  placeholder="https://…/logo.png" />
              </Field>
              <Field label="Default Team Photo URL">
                <input style={inputStyle} value={profile.default_team_photo_url}
                  onChange={e => setProfile(p => ({ ...p, default_team_photo_url: e.target.value }))}
                  placeholder="https://…/team.jpg" />
              </Field>
            </div>
            {profile.logo_url && (
              <div style={{ marginTop: ".75rem" }}>
                <div style={labelStyle}>Logo Preview</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile.logo_url} alt="logo" style={{ height: 56, objectFit: "contain", borderRadius: 6, border: "1px solid #f0f0f2" }} />
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>Location</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
              <Field label="Street Address">
                <input style={inputStyle} value={profile.address}
                  onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                  placeholder="1234 School Drive" />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
              <Field label="City">
                <input style={inputStyle} value={profile.city}
                  onChange={e => setProfile(p => ({ ...p, city: e.target.value }))}
                  placeholder="Phoenix" />
              </Field>
              <Field label="State">
                <input style={inputStyle} value={profile.state}
                  onChange={e => setProfile(p => ({ ...p, state: e.target.value }))}
                  placeholder="AZ" maxLength={2} />
              </Field>
              <Field label="ZIP">
                <input style={inputStyle} value={profile.zip}
                  onChange={e => setProfile(p => ({ ...p, zip: e.target.value }))}
                  placeholder="85032" />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
              <Field label="Website">
                <input style={inputStyle} value={profile.website}
                  onChange={e => setProfile(p => ({ ...p, website: e.target.value }))}
                  placeholder="https://pvhsathletics.org" />
              </Field>
              <div />
            </div>
            <div style={{ marginTop: "1rem" }}>
              <Field label="Short Description">
                <textarea style={{ ...inputStyle, height: 72, resize: "vertical" }}
                  value={profile.short_description}
                  onChange={e => setProfile(p => ({ ...p, short_description: e.target.value }))}
                  placeholder="Brief description of your athletic program…" />
              </Field>
            </div>
          </Card>

          <Card>
            <SectionTitle>Athletic Director</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              <Field label="Full Name">
                <input style={inputStyle} value={profile.athletic_director}
                  onChange={e => setProfile(p => ({ ...p, athletic_director: e.target.value }))}
                  placeholder="Jane Smith" />
              </Field>
              <Field label="Email">
                <input style={inputStyle} type="email" value={profile.athletic_director_email}
                  onChange={e => setProfile(p => ({ ...p, athletic_director_email: e.target.value }))}
                  placeholder="jsmith@pvhs.edu" />
              </Field>
              <Field label="Phone">
                <input style={inputStyle} type="tel" value={profile.athletic_director_phone}
                  onChange={e => setProfile(p => ({ ...p, athletic_director_phone: e.target.value }))}
                  placeholder="(602) 555-1234" />
              </Field>
            </div>
          </Card>

          <SaveRow saving={profileSaving} msg={profileMsg}
            onSave={() => saveSection(profile, setProfileSaving, setProfileMsg)} />
        </>
      )}

      {/* ── Tab 1: Campaign Defaults ─────────────────────────────────────────── */}
      {tab === 1 && (
        <>
          <Card>
            <SectionTitle>Goal Defaults</SectionTitle>
            <p style={{ fontSize: ".8rem", color: "#6e6e73", margin: "0 0 1.25rem" }}>
              These values pre-populate the Campaign Creation Wizard. Coaches can still override them per campaign.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <Field label="Default Fundraising Goal">
                <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                  <span style={{ fontSize: ".85rem", color: "#6e6e73" }}>$</span>
                  <input style={{ ...inputStyle, flex: 1 }} type="number" min="0" step="100"
                    value={defaults.default_fundraising_goal_cents / 100 || ""}
                    onChange={e => setDefaults(d => ({ ...d, default_fundraising_goal_cents: Math.round(parseFloat(e.target.value || "0") * 100) }))}
                    placeholder="5000" />
                </div>
              </Field>
              <Field label="Default Athlete Goal">
                <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                  <span style={{ fontSize: ".85rem", color: "#6e6e73" }}>$</span>
                  <input style={{ ...inputStyle, flex: 1 }} type="number" min="0" step="50"
                    value={defaults.default_athlete_goal_cents / 100 || ""}
                    onChange={e => setDefaults(d => ({ ...d, default_athlete_goal_cents: Math.round(parseFloat(e.target.value || "0") * 100) }))}
                    placeholder="500" />
                </div>
              </Field>
              <Field label="Default Contact Goal">
                <input style={inputStyle} type="number" min="1" max="200"
                  value={defaults.default_contact_goal || ""}
                  onChange={e => setDefaults(d => ({ ...d, default_contact_goal: parseInt(e.target.value || "10", 10) }))}
                  placeholder="10" />
              </Field>
              <Field label="Default Campaign Length (days)">
                <input style={inputStyle} type="number" min="7" max="365"
                  value={defaults.default_campaign_length_days || ""}
                  onChange={e => setDefaults(d => ({ ...d, default_campaign_length_days: parseInt(e.target.value || "30", 10) }))}
                  placeholder="30" />
              </Field>
            </div>
          </Card>

          <Card>
            <SectionTitle>Default Layout</SectionTitle>
            <div style={{ display: "flex", gap: "1rem" }}>
              {(["classic", "premium"] as const).map(v => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: ".5rem", cursor: "pointer" }}>
                  <input type="radio" name="layout" value={v}
                    checked={defaults.default_layout === v}
                    onChange={() => setDefaults(d => ({ ...d, default_layout: v }))}
                    style={{ accentColor: "#0b1e3d", cursor: "pointer" }} />
                  <span style={{ fontSize: ".85rem", color: "#1d1d1f", fontWeight: 500, textTransform: "capitalize" }}>{v}</span>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle>Default Feature Toggles</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
              <Toggle label="Show Donation Card"      checked={defaults.default_show_donation_card}    onChange={v => setDefaults(d => ({ ...d, default_show_donation_card:    v }))} />
              <Toggle label="Show Leaderboard"        checked={defaults.default_show_leaderboard}      onChange={v => setDefaults(d => ({ ...d, default_show_leaderboard:      v }))} />
              <Toggle label="Show Program Identity"   checked={defaults.default_show_program_identity} onChange={v => setDefaults(d => ({ ...d, default_show_program_identity: v }))} />
              <Toggle label="Show Share Section"      checked={defaults.default_show_share_section}    onChange={v => setDefaults(d => ({ ...d, default_show_share_section:    v }))} />
              <Toggle label="Show Fund Uses"          checked={defaults.default_show_fund_uses}        onChange={v => setDefaults(d => ({ ...d, default_show_fund_uses:        v }))} />
              <Toggle label="Show Recent Donations"   checked={defaults.default_show_recent_donations} onChange={v => setDefaults(d => ({ ...d, default_show_recent_donations: v }))} />
              <Toggle label="Show Sponsors"           checked={defaults.default_show_sponsors}         onChange={v => setDefaults(d => ({ ...d, default_show_sponsors:         v }))} />
            </div>
          </Card>

          <SaveRow saving={defaultsSaving} msg={defaultsMsg}
            onSave={() => saveSection(defaults, setDefaultsSaving, setDefaultsMsg)} />
        </>
      )}

      {/* ── Tab 2: Communication Templates ───────────────────────────────────── */}
      {tab === 2 && (
        <>
          <p style={{ fontSize: ".83rem", color: "#6e6e73", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
            Create templates for future automated email delivery. Use <code style={{ background: "#f5f5f7", padding: ".1rem .35rem", borderRadius: 4, fontSize: ".78rem" }}>[placeholders]</code> for dynamic content. Templates are stored but not yet sent automatically.
          </p>
          {templates.map((t, i) => {
            const def = TEMPLATE_DEFS.find(d => d.type === t.type)!;
            const msg = tmplMsg[t.type] ?? "";
            const isErr = msg && !msg.includes("Saved");
            return (
              <Card key={t.type}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                  <div>
                    <div style={{ fontSize: ".9rem", fontWeight: 700, color: "#1d1d1f" }}>{def.label}</div>
                    <div style={{ fontSize: ".75rem", color: "#6e6e73", marginTop: ".2rem" }}>{def.desc}</div>
                  </div>
                  {t.subject || t.body_text
                    ? <span style={{ fontSize: ".68rem", fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: ".15rem .5rem", borderRadius: 4 }}>Configured</span>
                    : <span style={{ fontSize: ".68rem", fontWeight: 700, color: "#6e6e73", background: "#f3f4f6", padding: ".15rem .5rem", borderRadius: 4 }}>Empty</span>
                  }
                </div>
                <Field label="Subject Line">
                  <input style={inputStyle} value={t.subject}
                    onChange={e => setTemplates(ts => ts.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))}
                    placeholder={`Subject for ${def.label}…`} />
                </Field>
                <div style={{ marginTop: ".75rem" }}>
                  <Field label="Body">
                    <textarea style={{ ...inputStyle, height: 160, resize: "vertical", lineHeight: 1.5 }}
                      value={t.body_text}
                      onChange={e => setTemplates(ts => ts.map((x, j) => j === i ? { ...x, body_text: e.target.value } : x))}
                      placeholder={`Hi [Name],\n\nWrite your message here…`} />
                  </Field>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "1rem" }}>
                  <button onClick={() => void saveTemplate(t)} disabled={tmplSaving[t.type]}
                    style={{ padding: ".45rem 1rem", background: tmplSaving[t.type] ? "#98989d" : "#0b1e3d", color: "#fff", border: "none", borderRadius: 7, fontSize: ".8rem", fontWeight: 600, cursor: tmplSaving[t.type] ? "default" : "pointer" }}>
                    {tmplSaving[t.type] ? "Saving…" : "Save Template"}
                  </button>
                  {msg && <span style={{ fontSize: ".78rem", fontWeight: 600, color: isErr ? "#dc2626" : "#16a34a" }}>{msg}</span>}
                </div>
              </Card>
            );
          })}
        </>
      )}

      {/* ── Tab 3: Sponsor Packages ───────────────────────────────────────────── */}
      {tab === 3 && (
        <>
          <p style={{ fontSize: ".83rem", color: "#6e6e73", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
            Define reusable sponsor tiers. These will pre-populate sponsor sections in new campaigns.
          </p>

          {/* Add form */}
          <Card>
            <SectionTitle>Add Package</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: ".75rem", alignItems: "end" }}>
              <Field label="Package Name">
                <input style={inputStyle} value={newPkg.name}
                  onChange={e => setNewPkg(p => ({ ...p, name: e.target.value }))}
                  placeholder="Gold Sponsor" />
              </Field>
              <Field label="Tier">
                <select style={{ ...inputStyle }}
                  value={newPkg.tier}
                  onChange={e => setNewPkg(p => ({ ...p, tier: e.target.value }))}>
                  {TIER_OPTIONS.map(t => (
                    <option key={t} value={t} style={{ textTransform: "capitalize" }}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Amount">
                <div style={{ display: "flex", alignItems: "center", gap: ".3rem" }}>
                  <span style={{ fontSize: ".85rem", color: "#6e6e73" }}>$</span>
                  <input style={{ ...inputStyle, flex: 1 }} type="number" min="0" step="100"
                    value={newPkg.amount_cents / 100 || ""}
                    onChange={e => setNewPkg(p => ({ ...p, amount_cents: Math.round(parseFloat(e.target.value || "0") * 100) }))}
                    placeholder="1000" />
                </div>
              </Field>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <button onClick={() => void addPackage()} disabled={pkgSaving || !newPkg.name.trim()}
                  style={{ padding: ".5rem 1rem", background: !newPkg.name.trim() || pkgSaving ? "#98989d" : "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".82rem", fontWeight: 600, cursor: !newPkg.name.trim() || pkgSaving ? "default" : "pointer" }}>
                  {pkgSaving ? "Adding…" : "Add Package"}
                </button>
              </div>
            </div>
            <div style={{ marginTop: ".75rem" }}>
              <Field label="Description (optional)">
                <input style={inputStyle} value={newPkg.description}
                  onChange={e => setNewPkg(p => ({ ...p, description: e.target.value }))}
                  placeholder="Logo on banner, website mention, social post…" />
              </Field>
            </div>
            {pkgMsg && (
              <div style={{ marginTop: ".75rem", fontSize: ".8rem", color: "#dc2626", fontWeight: 600 }}>{pkgMsg}</div>
            )}
          </Card>

          {/* Package list */}
          {packages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 2rem", color: "#6e6e73", fontSize: ".875rem", background: "#fff", borderRadius: 12, border: "1px solid #f0f0f2" }}>
              No sponsor packages yet. Add your first package above.
            </div>
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
                <thead>
                  <tr style={{ background: "#f9f9fb" }}>
                    {["Package Name", "Tier", "Amount", "Description", ""].map(h => (
                      <th key={h} style={{ padding: ".625rem 1.25rem", textAlign: "left", fontSize: ".68rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "1px solid #f0f0f2" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg, i) => (
                    <tr key={pkg.id} style={{ borderBottom: i < packages.length - 1 ? "1px solid #f5f5f7" : "none" }}>
                      <td style={{ padding: ".7rem 1.25rem", fontWeight: 600, color: "#1d1d1f" }}>{pkg.name}</td>
                      <td style={{ padding: ".7rem 1.25rem" }}>
                        <span style={{ display: "inline-block", padding: ".15rem .55rem", borderRadius: 5, fontSize: ".7rem", fontWeight: 700, background: "#f3f4f6", color: "#374151", textTransform: "capitalize" }}>
                          {pkg.tier}
                        </span>
                      </td>
                      <td style={{ padding: ".7rem 1.25rem", fontFamily: "monospace", color: "#374151" }}>
                        {pkg.amount_cents > 0 ? $(pkg.amount_cents) : "—"}
                      </td>
                      <td style={{ padding: ".7rem 1.25rem", color: "#6e6e73", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pkg.description || "—"}
                      </td>
                      <td style={{ padding: ".7rem 1.25rem", textAlign: "right" }}>
                        <button onClick={() => void deletePackage(pkg.id)}
                          style={{ padding: ".25rem .6rem", background: "none", border: "1px solid #fecaca", borderRadius: 5, fontSize: ".72rem", color: "#dc2626", cursor: "pointer" }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
