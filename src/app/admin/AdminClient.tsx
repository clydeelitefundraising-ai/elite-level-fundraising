"use client";

import { useState, useEffect } from "react";

type Settings   = { school_name: string; sport_name: string; mascot: string; goal_cents: number; deadline: string; primary_color: string; secondary_color: string; location: string; season: string; logo_url: string; show_leaderboard: boolean; show_program_identity: boolean; show_share_section: boolean; show_fund_uses: boolean; show_recent_donations: boolean; show_sponsors: boolean; show_donation_card: boolean; layout_variant: "classic" | "premium"; default_athlete_goal_cents: number };
type Athlete    = { id: string; name: string; event: string; class_year: string | null };
const ATHLETE_CLASS_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior"] as const;
type Sponsor    = { id: string; name: string; url: string; tier: "gold" | "silver" | "bronze" };
type FundUse    = { id: string; title: string; description: string; icon: string; sort_order: number };
type Coach      = { id: string; name: string; email: string; role: "head_coach" | "assistant_coach" | "booster"; campaign_slug: string; account_id: string | null; has_pending_invite: boolean; created_at: string };

const EMOJI_PICKS = ["✈️","🚌","👟","🎽","🏆","🥇","💪","🧊","🍽️","🏟️","📋","🧢","🏋️","🏃","⚽","🏀","🏈","⚾","🥎","🎾","🏐","💰","🎯","📚","🛡️","❤️"];

const STORE_PROVIDERS_LIST = ["Shopify", "SquadLocker", "BSN Sports", "Game One", "Custom"];

type WizardData = {
  campaign_slug:      string;
  school_name:        string;
  sport_name:         string;
  mascot:             string;
  season:             string;
  location:           string;
  primary_color:      string;
  secondary_color:    string;
  logo_url:           string;
  goal_dollars:       string;
  deadline:           string;
  external_store_url: string;
  store_provider:     string;
  coach_name:         string;
  coach_email:        string;
  coach_password:     string;
  seed_fund_uses:     boolean;
  starter_athletes:   { name: string; event: string; class_year: string }[];
};

type LaunchResult = { slug: string; join_code: string; coach_email: string };

const WIZARD_BLANK: WizardData = {
  campaign_slug: "", school_name: "", sport_name: "", mascot: "",
  season: "", location: "", primary_color: "#1B4FA8", secondary_color: "#C4A35A",
  logo_url: "", goal_dollars: "", deadline: "",
  external_store_url: "", store_provider: "",
  coach_name: "", coach_email: "", coach_password: "",
  seed_fund_uses: true, starter_athletes: [],
};

// ── Design tokens ──────────────────────────────────────────────────────────────

const C = {
  input: { padding: ".5rem .75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: ".875rem", width: "100%", boxSizing: "border-box", color: "#111827", background: "#fff" } as React.CSSProperties,
  label: { display: "flex", flexDirection: "column", gap: ".35rem", fontSize: ".78rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em" } as React.CSSProperties,
  th:    { textAlign: "left", padding: ".5rem .75rem", background: "#f9fafb", fontSize: ".72rem", fontWeight: 700, color: "#6b7280", letterSpacing: ".05em", textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" } as React.CSSProperties,
  td:    { padding: ".65rem .75rem", borderBottom: "1px solid #f3f4f6", fontSize: ".875rem", verticalAlign: "middle", color: "#111827" } as React.CSSProperties,
  card:  { background: "#fff", borderRadius: 14, padding: "1.75rem", boxShadow: "0 1px 4px rgba(0,0,0,.07)", marginBottom: "1.25rem", border: "1px solid #f0f0f0" } as React.CSSProperties,
};

function Btn({ onClick, disabled, color = "#0b1e3d", children, type = "button" }: {
  onClick?: () => void; disabled?: boolean; color?: string; children: React.ReactNode; type?: "button" | "submit";
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ padding: ".45rem .9rem", background: disabled ? "#9ca3af" : color, color: "#fff", border: "none", borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer", fontSize: ".8rem", fontWeight: 600, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: "1.25rem", paddingBottom: ".875rem", borderBottom: "1px solid #f3f4f6" }}>
      <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0b1e3d" }}>{title}</h2>
      {desc && <p style={{ margin: ".25rem 0 0", fontSize: ".8rem", color: "#6b7280" }}>{desc}</p>}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={C.label}>
      {label}
      <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
        <input type="color" value={value.match(/^#[0-9a-fA-F]{6}$/) ? value : "#000000"}
          onChange={e => onChange(e.target.value)}
          style={{ width: 38, height: 36, border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", padding: 2, flexShrink: 0, background: "none" }} />
        <input style={{ ...C.input }} value={value} onChange={e => onChange(e.target.value)} placeholder="#000000" />
      </div>
    </label>
  );
}

const TIER_COLORS: Record<string, { bg: string; color: string }> = {
  gold:   { bg: "#fef9c3", color: "#854d0e" },
  silver: { bg: "#f1f5f9", color: "#475569" },
  bronze: { bg: "#fff7ed", color: "#9a3412" },
};

function TierBadge({ tier }: { tier: string }) {
  const s = TIER_COLORS[tier] ?? { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{ padding: ".2rem .6rem", borderRadius: 100, fontSize: ".72rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: s.bg, color: s.color }}>
      {tier}
    </span>
  );
}

// ── Login View ─────────────────────────────────────────────────────────────────

export function LoginView() {
  const [pw,   setPw]   = useState("");
  const [err,  setErr]  = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (res.ok) window.location.reload();
    else { setErr("Incorrect password."); setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#fff", padding: "2.5rem", borderRadius: 14, boxShadow: "0 4px 24px rgba(0,0,0,.1)", minWidth: 340, width: "100%", maxWidth: 380 }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ margin: "0 0 .35rem", fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d" }}>ELF Admin</h1>
          <p style={{ margin: 0, fontSize: ".85rem", color: "#6b7280" }}>Enter your admin password to continue.</p>
        </div>
        <label style={{ ...C.label, marginBottom: ".75rem" }}>
          Password
          <input type="password" placeholder="••••••••" value={pw} onChange={e => setPw(e.target.value)}
            style={C.input} required autoFocus />
        </label>
        {err && <p style={{ color: "#dc2626", margin: "0 0 .75rem", fontSize: ".85rem" }}>{err}</p>}
        <Btn type="submit" disabled={busy} color="#0b1e3d">{busy ? "Logging in…" : "Login"}</Btn>
      </form>
    </div>
  );
}

// ── Admin Dashboard ────────────────────────────────────────────────────────────

export function AdminDashboard() {
  const blank: Settings = { school_name: "", sport_name: "", mascot: "", goal_cents: 0, deadline: "", primary_color: "#1B4FA8", secondary_color: "#C4A35A", location: "", season: "", logo_url: "", show_leaderboard: true, show_program_identity: true, show_share_section: true, show_fund_uses: true, show_recent_donations: true, show_sponsors: true, show_donation_card: true, layout_variant: "classic", default_athlete_goal_cents: 0 };
  const [settings, setSettings] = useState<Settings>(blank);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [toast,        setToast]        = useState("");
  const [saving,       setSaving]       = useState(false);
  const [selectedSlug, setSelectedSlug] = useState("paradise-valley-track-field-live");
  const [allSlugs,     setAllSlugs]     = useState<{ campaign_slug: string; archived: boolean }[]>([{ campaign_slug: "paradise-valley-track-field-live", archived: false }]);
  const [archived,     setArchived]     = useState(false);

  const [newAName,  setNewAName]  = useState("");
  const [newAEvent, setNewAEvent] = useState("");
  const [newAClass, setNewAClass] = useState("");
  const [newSName,  setNewSName]  = useState("");
  const [newSUrl,   setNewSUrl]   = useState("");
  const [newSTier,  setNewSTier]  = useState<Sponsor["tier"]>("gold");
  const [editA,     setEditA]     = useState<Athlete | null>(null);
  const [editS,     setEditS]     = useState<Sponsor | null>(null);
  const [fundUses,   setFundUses]   = useState<FundUse[]>([]);
  const [editFU,     setEditFU]     = useState<FundUse | null>(null);
  const [newFUTitle, setNewFUTitle] = useState("");
  const [newFUDesc,  setNewFUDesc]  = useState("");
  const [newFUIcon,  setNewFUIcon]  = useState("💰");
  const [wizardOpen,   setWizardOpen]   = useState(false);
  const [launchResult, setLaunchResult] = useState<LaunchResult | null>(null);

  const [coaches,    setCoaches]    = useState<Coach[]>([]);
  const [newCName,   setNewCName]   = useState("");
  const [newCEmail,  setNewCEmail]  = useState("");
  const [newCRole,   setNewCRole]   = useState<Coach["role"]>("head_coach");
  const [newCPass,   setNewCPass]   = useState("");
  const [coachError,       setCoachError]       = useState("");
  // invite state: keyed by coachId so multiple panels can coexist
  const [inviteCache,      setInviteCache]      = useState<Record<string, { url: string; emailSent: boolean }>>({});
  const [inviteLoading,    setInviteLoading]    = useState<string | null>(null);
  const [inviteError,      setInviteError]      = useState("");
  const [expandedInviteId, setExpandedInviteId] = useState<string | null>(null);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    fetch("/api/admin/campaign-slugs")
      .then(r => r.ok ? r.json() : [])
      .then((items: { campaign_slug: string; archived: boolean }[]) => { if (Array.isArray(items) && items.length > 0) setAllSlugs(items); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setEditA(null); setEditS(null); setEditFU(null);
    Promise.all([
      fetch(`/api/admin/campaign?slug=${selectedSlug}`).then(r => r.json()),
      fetch(`/api/admin/athletes?slug=${selectedSlug}`).then(r => r.json()),
      fetch(`/api/admin/sponsors?slug=${selectedSlug}`).then(r => r.json()),
      fetch(`/api/admin/fund-uses?slug=${selectedSlug}`).then(r => r.json()),
      fetch(`/api/admin/coaches?slug=${selectedSlug}`).then(r => r.json()),
    ]).then(([c, a, s, fu, co]) => {
      setSettings(c && !c.error ? {
        ...c,
        show_leaderboard:      c.show_leaderboard      ?? true,
        show_program_identity: c.show_program_identity ?? true,
        show_share_section:    c.show_share_section    ?? true,
        show_fund_uses:        c.show_fund_uses        ?? true,
        show_recent_donations: c.show_recent_donations ?? true,
        show_sponsors:         c.show_sponsors         ?? true,
        show_donation_card:    c.show_donation_card    ?? true,
        layout_variant:        c.layout_variant        ?? "classic",
      } : blank);
      setArchived(c?.archived === true);
      setAthletes(Array.isArray(a) ? a : []);
      setSponsors(Array.isArray(s) ? s : []);
      setFundUses(Array.isArray(fu) ? fu : []);
      setCoaches(Array.isArray(co) ? co : []);
    }).catch(() => {});
  }, [selectedSlug]);

  const saveSettings = async () => {
    setSaving(true);
    const payload = { ...settings, slug: selectedSlug };
    console.log("[saveSettings] default_athlete_goal_cents in state:", settings.default_athlete_goal_cents);
    console.log("[saveSettings] full payload:", JSON.stringify(payload));
    const res = await fetch("/api/admin/campaign", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json();
    console.log("[saveSettings] response status:", res.status, "body:", JSON.stringify(body));
    setSaving(false);
    flash(res.ok ? "Settings saved." : `Error: ${JSON.stringify(body)}`);
  };

  const addAthlete = async () => {
    if (!newAName.trim() || !newAEvent.trim()) return;
    const res = await fetch("/api/admin/athletes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_slug: selectedSlug, name: newAName.trim(), event: newAEvent.trim(), class_year: newAClass || null }) });
    if (!res.ok) { const body = await res.json().catch(() => ({})); flash(`Error: ${body.error ?? res.statusText}`); return; }
    const a = await res.json();
    setAthletes(p => [...p, a]); setNewAName(""); setNewAEvent(""); setNewAClass(""); flash("Athlete added.");
  };

  const saveAthlete = async () => {
    if (!editA) return;
    const res = await fetch(`/api/admin/athletes/${editA.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editA.name, event: editA.event, class_year: editA.class_year }) });
    if (!res.ok) { const body = await res.json().catch(() => ({})); flash(`Error: ${body.error ?? res.statusText}`); return; }
    setAthletes(p => p.map(a => a.id === editA.id ? editA : a)); setEditA(null); flash("Athlete updated.");
  };

  const deleteAthlete = async (id: string) => {
    if (!confirm("Delete this athlete?")) return;
    const res = await fetch(`/api/admin/athletes/${id}`, { method: "DELETE" });
    if (res.ok) { setAthletes(p => p.filter(a => a.id !== id)); flash("Athlete deleted."); }
  };

  const addSponsor = async () => {
    if (!newSName.trim() || !newSUrl.trim()) return;
    const res = await fetch("/api/admin/sponsors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_slug: selectedSlug, name: newSName.trim(), url: newSUrl.trim(), tier: newSTier }) });
    if (res.ok) { const s = await res.json(); setSponsors(p => [...p, s]); setNewSName(""); setNewSUrl(""); setNewSTier("gold"); flash("Sponsor added."); }
  };

  const saveSponsor = async () => {
    if (!editS) return;
    const res = await fetch(`/api/admin/sponsors/${editS.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editS.name, url: editS.url, tier: editS.tier }) });
    if (res.ok) { setSponsors(p => p.map(s => s.id === editS.id ? editS : s)); setEditS(null); flash("Sponsor updated."); }
  };

  const deleteSponsor = async (id: string) => {
    if (!confirm("Delete this sponsor?")) return;
    const res = await fetch(`/api/admin/sponsors/${id}`, { method: "DELETE" });
    if (res.ok) { setSponsors(p => p.filter(s => s.id !== id)); flash("Sponsor deleted."); }
  };

  const addFundUse = async () => {
    if (!newFUTitle.trim()) return;
    const nextOrder = fundUses.length > 0 ? Math.max(...fundUses.map(f => f.sort_order)) + 1 : 0;
    const res = await fetch("/api/admin/fund-uses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_slug: selectedSlug, title: newFUTitle.trim(), description: newFUDesc.trim(), icon: newFUIcon, sort_order: nextOrder }) });
    if (res.ok) { const f = await res.json(); setFundUses(p => [...p, f]); setNewFUTitle(""); setNewFUDesc(""); setNewFUIcon("💰"); flash("Item added."); }
  };

  const saveFundUse = async () => {
    if (!editFU) return;
    const res = await fetch(`/api/admin/fund-uses/${editFU.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: editFU.title, description: editFU.description, icon: editFU.icon, sort_order: editFU.sort_order }) });
    if (res.ok) { setFundUses(p => p.map(f => f.id === editFU.id ? editFU : f)); setEditFU(null); flash("Item updated."); }
  };

  const deleteFundUse = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const res = await fetch(`/api/admin/fund-uses/${id}`, { method: "DELETE" });
    if (res.ok) { setFundUses(p => p.filter(f => f.id !== id)); flash("Item deleted."); }
  };

  const addCoach = async () => {
    setCoachError("");
    if (!newCName.trim() || !newCEmail.trim() || !newCPass.trim()) {
      setCoachError("Name, email, and password are required.");
      return;
    }
    const res = await fetch("/api/admin/coaches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_slug: selectedSlug, name: newCName.trim(), email: newCEmail.trim(), role: newCRole, password: newCPass }),
    });
    const data = await res.json();
    if (res.ok) {
      setCoaches(p => [...p, data]);
      setNewCName(""); setNewCEmail(""); setNewCPass(""); setNewCRole("head_coach");
      flash("Coach added.");
      // Auto-generate invite link for the new coach
      void sendInvite(data.id as string);
    } else {
      setCoachError(data.error ?? "Failed to add coach.");
    }
  };

  const deleteCoach = async (id: string) => {
    if (!confirm("Remove this coach? They will no longer be able to log in to the team hub.")) return;
    const res = await fetch(`/api/admin/coaches/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCoaches(p => p.filter(c => c.id !== id));
      setInviteCache(p => { const n = { ...p }; delete n[id]; return n; });
      if (expandedInviteId === id) setExpandedInviteId(null);
      flash("Coach removed.");
    }
  };

  const sendInvite = async (coachId: string) => {
    setInviteError(""); setInviteLoading(coachId); setExpandedInviteId(coachId);
    const res  = await fetch(`/api/admin/coaches/${coachId}/invite`, { method: "POST" });
    const data = await res.json();
    setInviteLoading(null);
    if (res.ok) {
      setInviteCache(p => ({ ...p, [coachId]: { url: data.inviteUrl as string, emailSent: data.emailSent as boolean } }));
      setCoaches(p => p.map(c => c.id === coachId ? { ...c, has_pending_invite: true } : c));
      flash(data.emailSent ? "Invite email sent." : "Invite link generated — copy it below.");
    } else {
      setInviteError(data.error ?? "Failed to generate invite.");
    }
  };

  const logout = async () => { await fetch("/api/admin/logout", { method: "POST" }); window.location.reload(); };

  const archiveCampaign = async (newArchived: boolean) => {
    if (newArchived && !confirm(`Archive "${selectedSlug}"? It will no longer be publicly visible.`)) return;
    const res = await fetch("/api/admin/campaign", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: selectedSlug, archived: newArchived }) });
    if (res.ok) {
      setArchived(newArchived);
      setAllSlugs(p => p.map(s => s.campaign_slug === selectedSlug ? { ...s, archived: newArchived } : s));
      flash(newArchived ? "Campaign archived." : "Campaign restored.");
    } else {
      flash("Error updating campaign.");
    }
  };


  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ background: "#0b1e3d", padding: "0 2rem", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 800, fontSize: "1rem", color: "#fff", letterSpacing: ".02em" }}>ELF Admin</span>
        <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
          <a href={`/campaign/${selectedSlug}`} target="_blank" rel="noopener noreferrer"
            style={{ color: "rgba(255,255,255,.6)", fontSize: ".8rem", textDecoration: "none", fontWeight: 500 }}>
            View campaign ↗
          </a>
          <button onClick={logout}
            style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.18)", borderRadius: 6, padding: ".3rem .8rem", cursor: "pointer", fontSize: ".8rem", fontWeight: 600 }}>
            Logout
          </button>
        </div>
      </div>

      {/* ── Campaign selector bar ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: ".75rem 2rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <span style={{ fontSize: ".78rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap" }}>Campaign</span>
        <select value={selectedSlug} onChange={e => setSelectedSlug(e.target.value)}
          style={{ ...C.input, width: "auto", minWidth: 260, maxWidth: 380, fontWeight: 600, color: "#0b1e3d" }}>
          {allSlugs.map(s => <option key={s.campaign_slug} value={s.campaign_slug}>{s.campaign_slug}{s.archived ? " (Archived)" : ""}</option>)}
        </select>
        <a href={`/campaign/${selectedSlug}`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: ".8rem", color: "#0b1e3d", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
          ↗ Open
        </a>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", background: "#0b1e3d", color: "#fff", padding: ".65rem 1.25rem", borderRadius: 8, zIndex: 1000, fontSize: ".85rem", fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,.2)" }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 960, margin: "1.75rem auto", padding: "0 1.25rem" }}>

        {/* ── 1. Launch New School ── */}
        <div style={C.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0b1e3d" }}>Launch New School</h2>
              <p style={{ margin: ".2rem 0 0", fontSize: ".8rem", color: "#9ca3af" }}>
                Campaign · Coach account · Join code · Team hub — all in one guided flow.
              </p>
            </div>
            <Btn color="#16a34a" onClick={() => setWizardOpen(true)}>Launch New School →</Btn>
          </div>

          {launchResult && (
            <div style={{ marginTop: "1.1rem", padding: "1.1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10 }}>
              <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#15803d", marginBottom: ".7rem" }}>
                ✓ {launchResult.slug} is live
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: ".45rem", fontSize: ".85rem" }}>
                <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
                  <span style={{ fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", minWidth: 88 }}>Campaign</span>
                  <a href={`/campaign/${launchResult.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: "#0b1e3d", fontWeight: 600 }}>/campaign/{launchResult.slug} ↗</a>
                </div>
                <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
                  <span style={{ fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", minWidth: 88 }}>Team Hub</span>
                  <a href={`/team/${launchResult.slug}/home`} target="_blank" rel="noopener noreferrer" style={{ color: "#0b1e3d", fontWeight: 600 }}>/team/{launchResult.slug}/home ↗</a>
                </div>
                <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
                  <span style={{ fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", minWidth: 88 }}>Join Code</span>
                  <code style={{ background: "#dcfce7", color: "#15803d", padding: ".15rem .65rem", borderRadius: 6, fontWeight: 800, fontSize: ".9rem", letterSpacing: ".12em" }}>{launchResult.join_code}</code>
                  <span style={{ fontSize: ".75rem", color: "#6b7280" }}>/join/{launchResult.join_code}</span>
                </div>
                <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
                  <span style={{ fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", minWidth: 88 }}>Coach Login</span>
                  <span style={{ color: "#374151" }}>{launchResult.coach_email} ·</span>
                  <a href="/login" target="_blank" rel="noopener noreferrer" style={{ color: "#0b1e3d", fontWeight: 600, fontSize: ".82rem" }}>/login ↗</a>
                </div>
                <p style={{ margin: ".3rem 0 0", fontSize: ".75rem", color: "#6b7280", fontStyle: "italic" }}>
                  ⚠ Share the temporary password securely — it cannot be recovered from this panel.
                </p>
              </div>
              <div style={{ marginTop: ".85rem" }}>
                <Btn color="#6b7280" onClick={() => setLaunchResult(null)}>Dismiss</Btn>
              </div>
            </div>
          )}
        </div>

        {/* ── 2. Campaign Identity ── */}
        <div style={C.card}>
          <SectionHeader title="Campaign Identity" desc="School, sport, location, and logo" />
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1rem" }}>
            <span style={{ fontSize: ".78rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em" }}>Status</span>
            <span style={{ padding: ".2rem .75rem", borderRadius: 100, fontSize: ".78rem", fontWeight: 700, background: archived ? "#f3f4f6" : "#dcfce7", color: archived ? "#6b7280" : "#15803d" }}>
              {archived ? "Archived" : "Active"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", flex: 1 }}>
              <label style={C.label}>School Name   <input style={C.input} value={settings.school_name}  onChange={e => setSettings(s => ({ ...s, school_name: e.target.value }))} /></label>
              <label style={C.label}>Sport Name    <input style={C.input} value={settings.sport_name}   onChange={e => setSettings(s => ({ ...s, sport_name: e.target.value }))} /></label>
              <label style={C.label}>Mascot        <input style={C.input} value={settings.mascot}       onChange={e => setSettings(s => ({ ...s, mascot: e.target.value }))} placeholder="e.g. Pumas" /></label>
              <label style={C.label}>Season        <input style={C.input} value={settings.season}       onChange={e => setSettings(s => ({ ...s, season: e.target.value }))} placeholder="e.g. 2025 Season" /></label>
              <label style={C.label}>Location      <input style={C.input} value={settings.location}     onChange={e => setSettings(s => ({ ...s, location: e.target.value }))} placeholder="e.g. Paradise Valley, AZ" /></label>
              <label style={C.label}>
                Logo URL
                <input style={C.input} value={settings.logo_url} onChange={e => setSettings(s => ({ ...s, logo_url: e.target.value }))} placeholder="/logo.png or https://…" />
              </label>
            </div>

            {/* Live preview */}
            <div style={{ flexShrink: 0, width: 180 }}>
              <p style={{ margin: "0 0 .5rem", fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em" }}>Preview</p>
              <div style={{ borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,.12)" }}>
                <div style={{ background: settings.primary_color, padding: "1rem", color: "#fff" }}>
                  {settings.logo_url && (
                    <img src={settings.logo_url} alt="" style={{ width: 36, height: 36, objectFit: "contain", marginBottom: ".5rem", display: "block" }} />
                  )}
                  <div style={{ fontSize: ".65rem", opacity: .65, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".2rem" }}>
                    {settings.location || "Location"}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: ".95rem", lineHeight: 1.2 }}>
                    {settings.school_name || "School Name"}
                  </div>
                  <div style={{ fontSize: ".75rem", opacity: .8, marginTop: ".25rem" }}>
                    {settings.mascot || "Mascot"} · {settings.sport_name || "Sport"}
                  </div>
                </div>
                <div style={{ background: settings.secondary_color, padding: ".4rem 1rem" }}>
                  <span style={{ fontSize: ".68rem", fontWeight: 700, color: "#fff", letterSpacing: ".06em", textTransform: "uppercase" }}>
                    {settings.season || "Season"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: "1.25rem", display: "flex", gap: ".75rem", alignItems: "center" }}>
            <Btn onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save Identity"}</Btn>
            {archived
              ? <Btn color="#16a34a" onClick={() => archiveCampaign(false)}>Restore Campaign</Btn>
              : <Btn color="#6b7280" onClick={() => archiveCampaign(true)}>Archive Campaign</Btn>
            }
          </div>
        </div>

        {/* ── 3. Branding ── */}
        <div style={C.card}>
          <SectionHeader title="Branding" desc="Primary and secondary colors" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <ColorField label="Primary Color"   value={settings.primary_color}   onChange={v => setSettings(s => ({ ...s, primary_color: v }))} />
            <ColorField label="Secondary Color" value={settings.secondary_color} onChange={v => setSettings(s => ({ ...s, secondary_color: v }))} />
          </div>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", marginTop: "1rem", height: 48 }}>
            <div style={{ flex: 1, background: settings.primary_color, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: ".72rem", fontWeight: 700, opacity: .85 }}>Primary · {settings.primary_color}</span>
            </div>
            <div style={{ flex: 1, background: settings.secondary_color, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: ".72rem", fontWeight: 700, opacity: .85 }}>Secondary · {settings.secondary_color}</span>
            </div>
          </div>
          <div style={{ marginTop: "1.25rem" }}>
            <Btn onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save Branding"}</Btn>
          </div>
        </div>

        {/* ── 4. Fundraising Settings ── */}
        <div style={C.card}>
          <SectionHeader title="Fundraising Settings" desc="Goal amount and campaign deadline" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <label style={C.label}>
              Goal Amount ($)
              <input type="number" min="1" style={C.input}
                value={settings.goal_cents ? settings.goal_cents / 100 : ""}
                onChange={e => setSettings(s => ({ ...s, goal_cents: Math.round(parseFloat(e.target.value) * 100) || 0 }))} />
            </label>
            <label style={C.label}>
              Deadline
              <input type="date" style={C.input} value={settings.deadline}
                onChange={e => setSettings(s => ({ ...s, deadline: e.target.value }))} />
            </label>
            <label style={C.label}>
              Default Athlete Goal ($)
              <input type="number" min="1" style={C.input}
                value={settings.default_athlete_goal_cents ? settings.default_athlete_goal_cents / 100 : ""}
                onChange={e => setSettings(s => ({ ...s, default_athlete_goal_cents: Math.round(parseFloat(e.target.value) * 100) || 0 }))}
                placeholder="500" />
            </label>
          </div>
          <div style={{ marginTop: "1.25rem" }}>
            <Btn onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save Settings"}</Btn>
          </div>
        </div>

        {/* ── 5. Layout & Page Sections ── */}
        <div style={C.card}>
          <SectionHeader title="Layout & Visible Page Sections" desc="Choose a layout variant and toggle which sections appear on the public campaign page." />
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={C.label}>
              Layout Variant
              <select style={{ ...C.input, width: "auto", minWidth: 200 }}
                value={settings.layout_variant}
                onChange={e => setSettings(s => ({ ...s, layout_variant: e.target.value as "classic" | "premium" }))}>
                <option value="classic">Classic</option>
                <option value="premium">Premium</option>
              </select>
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
            {([
              ["show_leaderboard",      "Athlete Leaderboard"],
              ["show_program_identity", "Program Identity"],
              ["show_share_section",    "Share This Campaign"],
              ["show_fund_uses",        "Where Your Money Goes"],
              ["show_recent_donations", "Recent Donations"],
              ["show_sponsors",         "Sponsors"],
              ["show_donation_card",    "Donation Card"],
            ] as [keyof Settings, string][]).map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: ".6rem", cursor: "pointer", fontSize: ".875rem", fontWeight: 500, color: "#374151" }}>
                <input type="checkbox" checked={!!settings[key]}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.checked }))}
                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#0b1e3d", flexShrink: 0 }} />
                {label}
              </label>
            ))}
          </div>
          <div style={{ marginTop: "1.25rem" }}>
            <Btn onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save Visibility Settings"}</Btn>
          </div>
        </div>

        {/* ── 6. Athletes ── */}
        <div style={C.card}>
          <SectionHeader title="Athletes" desc={`${athletes.length} athlete${athletes.length !== 1 ? "s" : ""} on this campaign`} />
          <div style={{ overflowX: "auto", marginBottom: "1.25rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #f3f4f6", borderRadius: 8, overflow: "hidden" }}>
              <thead>
                <tr>
                  <th style={C.th}>Name</th>
                  <th style={C.th}>Class</th>
                  <th style={{ ...C.th, width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {athletes.map(a => (
                  editA?.id === a.id ? (
                    <tr key={a.id} style={{ background: "#fafafa" }}>
                      <td style={C.td}><input style={C.input} value={editA.name}  onChange={e => setEditA(v => v ? { ...v, name: e.target.value } : v)} /></td>
                      <td style={C.td}>
                        <select style={C.input} value={editA.class_year ?? ""} onChange={e => setEditA(v => v ? { ...v, class_year: e.target.value || null } : v)}>
                          <option value="">Select class…</option>
                          {ATHLETE_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input
                          style={{ ...C.input, marginTop: ".35rem", fontSize: ".78rem" }}
                          value={editA.event}
                          onChange={e => setEditA(v => v ? { ...v, event: e.target.value } : v)}
                          placeholder="Event / Position"
                        />
                      </td>
                      <td style={C.td}>
                        <div style={{ display: "flex", gap: ".4rem" }}>
                          <Btn onClick={saveAthlete}>Save</Btn>
                          <Btn color="#6b7280" onClick={() => setEditA(null)}>Cancel</Btn>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={a.id} style={{ transition: "background .1s" }}>
                      <td style={{ ...C.td, fontWeight: 600 }}>{a.name}</td>
                      <td style={C.td}>
                        <div>{a.class_year ?? "—"}</div>
                        {a.event && <div style={{ fontSize: ".72rem", color: "#9ca3af", marginTop: ".1rem" }}>{a.event}</div>}
                      </td>
                      <td style={C.td}>
                        <div style={{ display: "flex", gap: ".4rem" }}>
                          <Btn onClick={() => setEditA({ ...a })}>Edit</Btn>
                          <Btn color="#dc2626" onClick={() => deleteAthlete(a.id)}>Delete</Btn>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
                {athletes.length === 0 && (
                  <tr><td colSpan={3} style={{ ...C.td, color: "#9ca3af", textAlign: "center", padding: "1.5rem" }}>No athletes yet. Add one below.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: ".75rem", alignItems: "flex-end", padding: "1rem", background: "#f9fafb", borderRadius: 8, border: "1px solid #f3f4f6" }}>
            <label style={{ ...C.label, flex: 2 }}>Name <input style={C.input} value={newAName} onChange={e => setNewAName(e.target.value)} placeholder="Athlete name" /></label>
            <label style={{ ...C.label, flex: 1 }}>
              Class
              <select style={C.input} value={newAClass} onChange={e => setNewAClass(e.target.value)}>
                <option value="">Select…</option>
                {ATHLETE_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ ...C.label, flex: 1 }}>Event <input style={C.input} value={newAEvent} onChange={e => setNewAEvent(e.target.value)} placeholder="Sprints" /></label>
            <Btn color="#16a34a" onClick={addAthlete}>+ Add</Btn>
          </div>
        </div>

        {/* ── 6. Sponsors ── */}
        <div style={C.card}>
          <SectionHeader title="Sponsors" desc={`${sponsors.length} sponsor${sponsors.length !== 1 ? "s" : ""} on this campaign`} />
          <div style={{ overflowX: "auto", marginBottom: "1.25rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #f3f4f6", borderRadius: 8, overflow: "hidden" }}>
              <thead>
                <tr>
                  <th style={C.th}>Name</th>
                  <th style={C.th}>URL</th>
                  <th style={C.th}>Tier</th>
                  <th style={{ ...C.th, width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sponsors.map(s => (
                  editS?.id === s.id ? (
                    <tr key={s.id} style={{ background: "#fafafa" }}>
                      <td style={C.td}><input style={C.input} value={editS.name} onChange={e => setEditS(v => v ? { ...v, name: e.target.value } : v)} /></td>
                      <td style={C.td}><input style={C.input} value={editS.url}  onChange={e => setEditS(v => v ? { ...v, url: e.target.value } : v)} /></td>
                      <td style={C.td}>
                        <select style={C.input} value={editS.tier} onChange={e => setEditS(v => v ? { ...v, tier: e.target.value as Sponsor["tier"] } : v)}>
                          <option value="gold">Gold</option>
                          <option value="silver">Silver</option>
                          <option value="bronze">Bronze</option>
                        </select>
                      </td>
                      <td style={C.td}>
                        <div style={{ display: "flex", gap: ".4rem" }}>
                          <Btn onClick={saveSponsor}>Save</Btn>
                          <Btn color="#6b7280" onClick={() => setEditS(null)}>Cancel</Btn>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id}>
                      <td style={{ ...C.td, fontWeight: 600 }}>{s.name}</td>
                      <td style={{ ...C.td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: ".8rem" }}>{s.url}</a>
                      </td>
                      <td style={C.td}><TierBadge tier={s.tier} /></td>
                      <td style={C.td}>
                        <div style={{ display: "flex", gap: ".4rem" }}>
                          <Btn onClick={() => setEditS({ ...s })}>Edit</Btn>
                          <Btn color="#dc2626" onClick={() => deleteSponsor(s.id)}>Delete</Btn>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
                {sponsors.length === 0 && (
                  <tr><td colSpan={4} style={{ ...C.td, color: "#9ca3af", textAlign: "center", padding: "1.5rem" }}>No sponsors yet. Add one below.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: ".75rem", alignItems: "flex-end", padding: "1rem", background: "#f9fafb", borderRadius: 8, border: "1px solid #f3f4f6" }}>
            <label style={{ ...C.label, flex: 2 }}>Name <input style={C.input} value={newSName} onChange={e => setNewSName(e.target.value)} placeholder="Business name" /></label>
            <label style={{ ...C.label, flex: 2 }}>URL  <input style={C.input} value={newSUrl}  onChange={e => setNewSUrl(e.target.value)} placeholder="https://…" /></label>
            <label style={{ ...C.label, flex: 1 }}>
              Tier
              <select style={C.input} value={newSTier} onChange={e => setNewSTier(e.target.value as Sponsor["tier"])}>
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="bronze">Bronze</option>
              </select>
            </label>
            <Btn color="#16a34a" onClick={addSponsor}>+ Add</Btn>
          </div>
        </div>

        {/* ── 7. Where Your Money Goes ── */}
        <div style={{ ...C.card, marginBottom: "3rem" }}>
          <SectionHeader title="Where Your Money Goes" desc={`${fundUses.length} item${fundUses.length !== 1 ? "s" : ""} on this campaign`} />
          <div style={{ overflowX: "auto", marginBottom: "1.25rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #f3f4f6", borderRadius: 8, overflow: "hidden" }}>
              <thead>
                <tr>
                  <th style={{ ...C.th, width: 60 }}>Icon</th>
                  <th style={C.th}>Title</th>
                  <th style={C.th}>Description</th>
                  <th style={{ ...C.th, width: 72 }}>Order</th>
                  <th style={{ ...C.th, width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {fundUses.map(f => (
                  editFU?.id === f.id ? (
                    <tr key={f.id} style={{ background: "#fafafa" }}>
                      <td style={{ ...C.td, verticalAlign: "top", paddingTop: ".75rem" }}>
                        <input style={{ ...C.input, width: 54, textAlign: "center", fontSize: "1.2rem", marginBottom: ".4rem" }}
                          value={editFU.icon} onChange={e => setEditFU(v => v ? { ...v, icon: e.target.value } : v)} />
                        <div style={{ display: "flex", flexWrap: "wrap", gap: ".2rem" }}>
                          {EMOJI_PICKS.map(e => (
                            <button key={e} type="button" onClick={() => setEditFU(v => v ? { ...v, icon: e } : v)}
                              style={{ fontSize: ".9rem", padding: ".15rem .2rem", background: editFU.icon === e ? "#e0e7ff" : "#f9fafb", border: editFU.icon === e ? "2px solid #6366f1" : "1px solid #e5e7eb", borderRadius: 4, cursor: "pointer", lineHeight: 1 }}>
                              {e}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td style={C.td}><input style={C.input} value={editFU.title} onChange={e => setEditFU(v => v ? { ...v, title: e.target.value } : v)} /></td>
                      <td style={C.td}><input style={C.input} value={editFU.description} onChange={e => setEditFU(v => v ? { ...v, description: e.target.value } : v)} /></td>
                      <td style={C.td}><input type="number" style={{ ...C.input, width: 56 }} value={editFU.sort_order} onChange={e => setEditFU(v => v ? { ...v, sort_order: parseInt(e.target.value) || 0 } : v)} /></td>
                      <td style={C.td}>
                        <div style={{ display: "flex", gap: ".4rem" }}>
                          <Btn onClick={saveFundUse}>Save</Btn>
                          <Btn color="#6b7280" onClick={() => setEditFU(null)}>Cancel</Btn>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={f.id}>
                      <td style={{ ...C.td, fontSize: "1.4rem", textAlign: "center" }}>{f.icon}</td>
                      <td style={{ ...C.td, fontWeight: 600 }}>{f.title}</td>
                      <td style={{ ...C.td, color: "#6b7280" }}>{f.description}</td>
                      <td style={{ ...C.td, color: "#9ca3af", textAlign: "center" }}>{f.sort_order}</td>
                      <td style={C.td}>
                        <div style={{ display: "flex", gap: ".4rem" }}>
                          <Btn onClick={() => setEditFU({ ...f })}>Edit</Btn>
                          <Btn color="#dc2626" onClick={() => deleteFundUse(f.id)}>Delete</Btn>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
                {fundUses.length === 0 && (
                  <tr><td colSpan={5} style={{ ...C.td, color: "#9ca3af", textAlign: "center", padding: "1.5rem" }}>No items yet. Add one below.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add form */}
          <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: 8, border: "1px solid #f3f4f6" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: ".75rem" }}>
              <label style={{ ...C.label, gridColumn: "1 / -1" }}>
                Title
                <input style={C.input} value={newFUTitle} onChange={e => setNewFUTitle(e.target.value)} placeholder="e.g. Travel & Transportation" />
              </label>
              <label style={{ ...C.label, gridColumn: "1 / -1" }}>
                Description
                <input style={C.input} value={newFUDesc} onChange={e => setNewFUDesc(e.target.value)} placeholder="e.g. Away meets, regional championships, and travel to compete." />
              </label>
              <label style={{ ...C.label, gridColumn: "1 / -1" }}>
                Icon
                <div style={{ display: "flex", gap: ".5rem", alignItems: "center", marginBottom: ".35rem" }}>
                  <input style={{ ...C.input, width: 64, textAlign: "center", fontSize: "1.2rem" }} value={newFUIcon} onChange={e => setNewFUIcon(e.target.value)} />
                  <span style={{ fontSize: ".72rem", color: "#9ca3af", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>or pick one:</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: ".3rem" }}>
                  {EMOJI_PICKS.map(e => (
                    <button key={e} type="button" onClick={() => setNewFUIcon(e)}
                      style={{ fontSize: "1.1rem", padding: ".2rem .35rem", background: newFUIcon === e ? "#e0e7ff" : "#f9fafb", border: newFUIcon === e ? "2px solid #6366f1" : "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", lineHeight: 1 }}>
                      {e}
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <Btn color="#16a34a" onClick={addFundUse}>+ Add Item</Btn>
          </div>
        </div>

        {/* ── 8. Team Coaches ── */}
        <div style={{ ...C.card, marginBottom: "3rem" }}>
          <SectionHeader title="Team Coaches" desc={`${coaches.length} coach${coaches.length !== 1 ? "es" : ""} on this campaign · can log in to the team hub`} />
          <div style={{ overflowX: "auto", marginBottom: "1.25rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #f3f4f6", borderRadius: 8, overflow: "hidden" }}>
              <thead>
                <tr>
                  <th style={C.th}>Name</th>
                  <th style={C.th}>Email</th>
                  <th style={C.th}>Role</th>
                  <th style={C.th}>Status</th>
                  <th style={{ ...C.th, width: 200 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {coaches.map(c => {
                  const status = c.account_id ? "linked" : c.has_pending_invite ? "pending" : "unactivated";
                  const cached = inviteCache[c.id];
                  const isLoading = inviteLoading === c.id;
                  return (
                    <tr key={c.id}>
                      <td style={{ ...C.td, fontWeight: 600 }}>{c.name}</td>
                      <td style={{ ...C.td, color: "#6b7280" }}>{c.email}</td>
                      <td style={C.td}>
                        <span style={{ padding: ".2rem .6rem", borderRadius: 100, fontSize: ".72rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: c.role === "head_coach" ? "#dbeafe" : c.role === "booster" ? "#ccfbf1" : "#f3f4f6", color: c.role === "head_coach" ? "#1d4ed8" : c.role === "booster" ? "#0f766e" : "#374151" }}>
                          {c.role === "head_coach" ? "Head Coach" : c.role === "booster" ? "Booster" : "Asst. Coach"}
                        </span>
                      </td>
                      <td style={C.td}>
                        {status === "linked"      && <span style={{ padding: ".2rem .6rem", borderRadius: 100, fontSize: ".72rem", fontWeight: 700, background: "#dcfce7", color: "#15803d" }}>Linked</span>}
                        {status === "pending"     && <span style={{ padding: ".2rem .6rem", borderRadius: 100, fontSize: ".72rem", fontWeight: 700, background: "#dbeafe", color: "#1d4ed8" }}>Pending Invite</span>}
                        {status === "unactivated" && <span style={{ padding: ".2rem .6rem", borderRadius: 100, fontSize: ".72rem", fontWeight: 700, background: "#fef9c3", color: "#854d0e" }}>Not Activated</span>}
                      </td>
                      <td style={{ ...C.td }}>
                        <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                          {status !== "linked" && (
                            <>
                              <Btn
                                color="#4f46e5"
                                disabled={isLoading}
                                onClick={() => sendInvite(c.id)}
                              >
                                {isLoading ? "…" : status === "pending" ? "Resend Invite" : "Send Invite"}
                              </Btn>
                              {cached && (
                                <Btn color="#6b7280" onClick={() => setExpandedInviteId(expandedInviteId === c.id ? null : c.id)}>
                                  Copy Link
                                </Btn>
                              )}
                            </>
                          )}
                          <Btn color="#dc2626" onClick={() => deleteCoach(c.id)}>Remove</Btn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {coaches.length === 0 && (
                  <tr><td colSpan={5} style={{ ...C.td, color: "#9ca3af", textAlign: "center", padding: "1.5rem" }}>No coaches yet. Add one below.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Invite link panel — shown for the expanded coach */}
          {expandedInviteId && inviteCache[expandedInviteId] && (
            <div style={{ marginBottom: "1rem", padding: "1rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".65rem" }}>
                <div style={{ fontWeight: 700, fontSize: ".875rem", color: "#0b1e3d" }}>
                  Invite Link — {coaches.find(c => c.id === expandedInviteId)?.name}
                </div>
                <Btn color="#6b7280" onClick={() => setExpandedInviteId(null)}>Dismiss</Btn>
              </div>
              <p style={{ margin: "0 0 .55rem", fontSize: ".82rem", color: "#374151" }}>
                {inviteCache[expandedInviteId].emailSent
                  ? "Invite email sent. You can also share this link directly:"
                  : "Email not sent (Resend not configured). Share this link manually:"}
                {" "}Expires in 24 hours, single-use.
              </p>
              <div style={{ display: "flex", gap: ".5rem", alignItems: "center", background: "#fff", border: "1px solid #d1d5db", borderRadius: 7, padding: ".5rem .75rem" }}>
                <span style={{ flex: 1, fontSize: ".78rem", color: "#374151", wordBreak: "break-all" }}>{inviteCache[expandedInviteId].url}</span>
                <CopyBtn text={inviteCache[expandedInviteId].url} />
              </div>
            </div>
          )}
          {inviteError && (
            <p style={{ color: "#dc2626", margin: "0 0 .75rem", fontSize: ".85rem" }}>{inviteError}</p>
          )}

          <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: 8, border: "1px solid #f3f4f6" }}>
            <p style={{ margin: "0 0 .75rem", fontSize: ".78rem", color: "#6b7280", lineHeight: 1.5 }}>
              An account invite link is generated automatically after adding a coach.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: ".75rem" }}>
              <label style={C.label}>Name <input style={C.input} value={newCName} onChange={e => setNewCName(e.target.value)} placeholder="Coach name" /></label>
              <label style={C.label}>Email <input type="email" style={C.input} value={newCEmail} onChange={e => setNewCEmail(e.target.value)} placeholder="coach@school.edu" /></label>
              <label style={C.label}>
                Role
                <select style={C.input} value={newCRole} onChange={e => setNewCRole(e.target.value as Coach["role"])}>
                  <option value="head_coach">Head Coach</option>
                  <option value="assistant_coach">Assistant Coach</option>
                  <option value="booster">Booster</option>
                </select>
              </label>
              <label style={C.label}>
                Temporary Password
                <span style={{ fontSize: ".68rem", fontWeight: 400, color: "#9ca3af", textTransform: "none", letterSpacing: 0 }}>Used for legacy /coach-login</span>
                <input type="password" style={C.input} value={newCPass} onChange={e => setNewCPass(e.target.value)} placeholder="Min 8 characters" />
              </label>
            </div>
            {coachError && <p style={{ color: "#dc2626", margin: "0 0 .75rem", fontSize: ".85rem" }}>{coachError}</p>}
            <Btn color="#16a34a" onClick={addCoach}>+ Add Coach</Btn>
          </div>
        </div>

      </div>

      {wizardOpen && (
        <OnboardWizard
          onClose={() => setWizardOpen(false)}
          onComplete={(result: LaunchResult) => {
            setLaunchResult(result);
            setWizardOpen(false);
            setAllSlugs(p => p.some(s => s.campaign_slug === result.slug) ? p : [...p, { campaign_slug: result.slug, archived: false }]);
            setSelectedSlug(result.slug);
          }}
        />
      )}
    </div>
  );
}

// ── Wizard helpers ─────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".1rem" }}>{label}</div>
      <div style={{ fontSize: ".875rem", color: "#111827", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 5, cursor: "pointer", fontSize: ".72rem", color: copied ? "#15803d" : "#6b7280", padding: ".15rem .45rem", fontWeight: 600, flexShrink: 0 }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

// ── OnboardWizard ─────────────────────────────────────────────────────────────

function OnboardWizard({
  onClose,
  onComplete,
}: {
  onClose:    () => void;
  onComplete: (result: LaunchResult) => void;
}) {
  const [step,          setStep]          = useState<1 | 2 | 3 | 4 | 5>(1);
  const [d,             setD]             = useState<WizardData>(WIZARD_BLANK);
  const [stepErr,       setStepErr]       = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [launching,     setLaunching]     = useState(false);
  const [launchErr,     setLaunchErr]     = useState("");

  const upd = (patch: Partial<WizardData>) => setD(prev => ({ ...prev, ...patch }));

  const STEP_LABELS: Record<number, string> = {
    1: "Identity & Branding",
    2: "Campaign Settings",
    3: "Head Coach Account",
    4: "Starter Content",
    5: "Review & Launch",
  };

  const validate = (s: number): string | null => {
    if (s === 1) {
      const slug = d.campaign_slug.trim();
      if (!slug) return "Campaign slug is required.";
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return "Slug: lowercase letters, numbers, hyphens. Must start with a letter or number.";
      if (slug.length < 3) return "Slug must be at least 3 characters.";
      if (!d.school_name.trim()) return "School name is required.";
      if (!d.sport_name.trim())  return "Sport name is required.";
    }
    if (s === 3) {
      if (!d.coach_name.trim())                             return "Coach name is required.";
      if (!d.coach_email.trim() || !d.coach_email.includes("@")) return "Valid coach email is required.";
      if (d.coach_password.length < 8)                     return "Password must be at least 8 characters.";
    }
    return null;
  };

  const goNext = () => {
    const err = validate(step);
    if (err) { setStepErr(err); return; }
    setStepErr("");
    setStep(s => (s < 5 ? s + 1 : 5) as 1 | 2 | 3 | 4 | 5);
  };

  const goBack = () => {
    setStepErr(""); setLaunchErr("");
    setStep(s => (s > 1 ? s - 1 : 1) as 1 | 2 | 3 | 4 | 5);
  };

  const uploadLogo = async (file: File) => {
    setLogoUploading(true); setStepErr("");
    const fd = new FormData(); fd.append("logo", file);
    const res  = await fetch("/api/admin/logo-upload", { method: "POST", body: fd });
    const data = await res.json();
    setLogoUploading(false);
    if (!res.ok) { setStepErr(data.error ?? "Logo upload failed."); return; }
    upd({ logo_url: data.url });
  };

  const launch = async () => {
    setLaunchErr(""); setLaunching(true);
    const res = await fetch("/api/admin/onboard", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        campaign_slug:      d.campaign_slug.trim(),
        school_name:        d.school_name.trim(),
        sport_name:         d.sport_name.trim(),
        mascot:             d.mascot.trim(),
        season:             d.season.trim(),
        location:           d.location.trim(),
        primary_color:      d.primary_color,
        secondary_color:    d.secondary_color,
        logo_url:           d.logo_url.trim(),
        goal_cents:         d.goal_dollars ? Math.round(parseFloat(d.goal_dollars) * 100) : 0,
        deadline:           d.deadline,
        external_store_url: d.external_store_url.trim() || null,
        store_provider:     d.store_provider || null,
        coach_name:         d.coach_name.trim(),
        coach_email:        d.coach_email.trim(),
        coach_password:     d.coach_password,
        seed_fund_uses:     d.seed_fund_uses,
        starter_athletes:   d.starter_athletes.filter(a => a.name.trim()),
      }),
    });
    const data = await res.json();
    setLaunching(false);
    if (!res.ok) { setLaunchErr(data.error ?? "Launch failed. Please try again."); return; }
    onComplete(data as LaunchResult);
  };

  const I = C.input;
  const L = C.label;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,.55)", display: "flex",
      alignItems: "flex-start", justifyContent: "center",
      overflowY: "auto", padding: "2rem 1rem",
    }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 640, boxShadow: "0 24px 80px rgba(0,0,0,.35)", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ background: "#0b1e3d", padding: "1.1rem 1.5rem", display: "flex", alignItems: "center", gap: ".75rem" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "#fff" }}>Launch New School</div>
            <div style={{ fontSize: ".72rem", color: "rgba(255,255,255,.55)", marginTop: ".1rem" }}>
              Step {step} of 5 — {STEP_LABELS[step]}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#fff", borderRadius: 6, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".85rem", flexShrink: 0 }}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", height: 4, background: "#e5e7eb" }}>
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} style={{ flex: 1, background: s <= step ? "#0b1e3d" : "transparent", transition: "background .2s" }} />
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "1.5rem", overflowY: "auto", maxHeight: "66vh" }}>

          {/* ── Step 1: Identity & Branding ── */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label style={L}>
                Campaign Slug *
                <input style={I} placeholder="e.g. mesa-soccer-2026" value={d.campaign_slug}
                  onChange={e => upd({ campaign_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} autoFocus />
                <span style={{ fontSize: ".7rem", color: "#9ca3af", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>Lowercase, numbers, hyphens only · becomes the public URL</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
                <label style={L}>School Name * <input style={I} value={d.school_name} onChange={e => upd({ school_name: e.target.value })} placeholder="Mesa High School" /></label>
                <label style={L}>Sport * <input style={I} value={d.sport_name} onChange={e => upd({ sport_name: e.target.value })} placeholder="Soccer" /></label>
                <label style={L}>Mascot <input style={I} value={d.mascot} onChange={e => upd({ mascot: e.target.value })} placeholder="Jaguars" /></label>
                <label style={L}>Season <input style={I} value={d.season} onChange={e => upd({ season: e.target.value })} placeholder="2026 Season" /></label>
                <label style={{ ...L, gridColumn: "1 / -1" }}>Location <input style={I} value={d.location} onChange={e => upd({ location: e.target.value })} placeholder="Mesa, Arizona" /></label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
                <ColorField label="Primary Color"   value={d.primary_color}   onChange={v => upd({ primary_color: v })} />
                <ColorField label="Secondary Color" value={d.secondary_color} onChange={v => upd({ secondary_color: v })} />
              </div>
              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 32 }}>
                <div style={{ flex: 1, background: d.primary_color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#fff", fontSize: ".68rem", fontWeight: 700, opacity: .85 }}>Primary · {d.primary_color}</span>
                </div>
                <div style={{ flex: 1, background: d.secondary_color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#fff", fontSize: ".68rem", fontWeight: 700, opacity: .85 }}>Secondary · {d.secondary_color}</span>
                </div>
              </div>
              {/* Logo upload */}
              <div style={L}>
                Team Logo
                <div style={{ display: "flex", alignItems: "center", gap: ".65rem", marginTop: ".25rem", flexWrap: "wrap" }}>
                  {d.logo_url && (
                    <img src={d.logo_url} alt="Logo preview" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6, border: "1px solid #e5e7eb", flexShrink: 0, background: "#f9fafb" }} />
                  )}
                  <label style={{ display: "inline-block", padding: ".4rem .85rem", background: logoUploading ? "#f9fafb" : "#f3f4f6", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: ".78rem", fontWeight: 600, color: logoUploading ? "#9ca3af" : "#374151", cursor: logoUploading ? "not-allowed" : "pointer", flexShrink: 0 }}>
                    {logoUploading ? "Uploading…" : d.logo_url ? "Change" : "Upload Logo"}
                    <input type="file" accept="image/*" style={{ display: "none" }} disabled={logoUploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
                  </label>
                  <input style={{ ...I, flex: 1, minWidth: 120, fontWeight: 400, textTransform: "none" as const, letterSpacing: 0 }} type="url" placeholder="or paste URL…" value={d.logo_url}
                    onChange={e => upd({ logo_url: e.target.value })} />
                </div>
                <span style={{ fontSize: ".68rem", color: "#9ca3af", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>PNG/JPG · max 5MB · stored in athlete-photos/logos/</span>
              </div>
            </div>
          )}

          {/* ── Step 2: Campaign Settings ── */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
                <label style={L}>
                  Fundraising Goal ($)
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: ".75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: ".875rem", pointerEvents: "none" }}>$</span>
                    <input type="number" min="1" step="100" style={{ ...I, paddingLeft: "1.5rem" }} value={d.goal_dollars} onChange={e => upd({ goal_dollars: e.target.value })} placeholder="10000" autoFocus />
                  </div>
                </label>
                <label style={L}>
                  Deadline
                  <input type="date" style={I} value={d.deadline} onChange={e => upd({ deadline: e.target.value })} />
                </label>
              </div>
              <label style={L}>
                External Store URL <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: ".7rem", color: "#9ca3af" }}>optional</span>
                <input type="url" style={{ ...I, fontWeight: 400, textTransform: "none" as const, letterSpacing: 0 }} placeholder="https://yourteam.shopify.com" value={d.external_store_url}
                  onChange={e => upd({ external_store_url: e.target.value })} />
              </label>
              <label style={L}>
                Store Provider <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: ".7rem", color: "#9ca3af" }}>optional</span>
                <select style={{ ...I, fontWeight: 400, textTransform: "none" as const, letterSpacing: 0 }} value={d.store_provider} onChange={e => upd({ store_provider: e.target.value })}>
                  <option value="">None / Not listed</option>
                  {STORE_PROVIDERS_LIST.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
          )}

          {/* ── Step 3: Head Coach Account ── */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ padding: ".75rem 1rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: ".82rem", color: "#1e40af", lineHeight: 1.5 }}>
                Creates the head coach login. No email is sent automatically — share credentials securely after launch.
              </div>
              <label style={L}>Full Name * <input style={I} value={d.coach_name} onChange={e => upd({ coach_name: e.target.value })} placeholder="Jane Smith" autoFocus /></label>
              <label style={L}>Email * <input type="email" style={I} value={d.coach_email} onChange={e => upd({ coach_email: e.target.value })} placeholder="coach@school.edu" /></label>
              <label style={L}>
                Temporary Password *
                <input type="password" style={I} value={d.coach_password} onChange={e => upd({ coach_password: e.target.value })} placeholder="Minimum 8 characters" />
                <span style={{ fontSize: ".7rem", color: "#9ca3af", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>Cannot be recovered after creation — note it before launching.</span>
              </label>
            </div>
          )}

          {/* ── Step 4: Starter Content ── */}
          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: ".75rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={d.seed_fund_uses} onChange={e => upd({ seed_fund_uses: e.target.checked })}
                    style={{ width: 18, height: 18, marginTop: 1, cursor: "pointer", accentColor: "#0b1e3d", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: ".875rem", color: "#0b1e3d" }}>Seed 6 default fund uses</div>
                    <div style={{ fontSize: ".78rem", color: "#6b7280", marginTop: ".2rem", lineHeight: 1.5 }}>
                      Travel · Entry Fees · Equipment · Uniforms · Recovery Tools · Team Meals — shown on the public campaign page under &ldquo;Where Your Money Goes.&rdquo;
                    </div>
                  </div>
                </label>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".65rem" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: ".875rem", color: "#0b1e3d" }}>Starter Athletes</div>
                    <div style={{ fontSize: ".75rem", color: "#9ca3af" }}>Optional — coach can add more via team hub.</div>
                  </div>
                  <Btn color="#0b1e3d" onClick={() => upd({ starter_athletes: [...d.starter_athletes, { name: "", event: "", class_year: "" }] })}>+ Add Athlete</Btn>
                </div>
                {d.starter_athletes.length === 0 ? (
                  <div style={{ padding: "1.25rem", textAlign: "center", border: "1.5px dashed #e5e7eb", borderRadius: 8, fontSize: ".82rem", color: "#9ca3af" }}>
                    No starter athletes — tap + Add Athlete to include some.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
                    {d.starter_athletes.map((a, i) => (
                      <div key={i} style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                        <input style={{ ...I, flex: 2 }} placeholder="Athlete name" value={a.name}
                          onChange={e => { const next = [...d.starter_athletes]; next[i] = { ...next[i], name: e.target.value }; upd({ starter_athletes: next }); }} />
                        <select style={{ ...I, flex: 1 }} value={a.class_year}
                          onChange={e => { const next = [...d.starter_athletes]; next[i] = { ...next[i], class_year: e.target.value }; upd({ starter_athletes: next }); }}>
                          <option value="">Class…</option>
                          {ATHLETE_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input style={{ ...I, flex: 1 }} placeholder="Event / Position" value={a.event}
                          onChange={e => { const next = [...d.starter_athletes]; next[i] = { ...next[i], event: e.target.value }; upd({ starter_athletes: next }); }} />
                        <button onClick={() => upd({ starter_athletes: d.starter_athletes.filter((_, idx) => idx !== i) })}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#fca5a5", fontWeight: 700, fontSize: ".95rem", padding: ".1rem .3rem", flexShrink: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 5: Review & Launch ── */}
          {step === 5 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ fontSize: ".75rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }}>Campaign</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".55rem .75rem" }}>
                <ReviewRow label="Slug"     value={d.campaign_slug || "—"} />
                <ReviewRow label="School"   value={d.school_name   || "—"} />
                <ReviewRow label="Sport"    value={d.sport_name    || "—"} />
                <ReviewRow label="Mascot"   value={d.mascot        || "—"} />
                <ReviewRow label="Season"   value={d.season        || "—"} />
                <ReviewRow label="Location" value={d.location      || "—"} />
                <ReviewRow label="Goal"     value={d.goal_dollars ? `$${parseFloat(d.goal_dollars).toLocaleString()}` : "—"} />
                <ReviewRow label="Deadline" value={d.deadline      || "—"} />
              </div>
              <div style={{ display: "flex", gap: ".4rem", alignItems: "center" }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, background: d.primary_color,   border: "1px solid rgba(0,0,0,.1)", flexShrink: 0 }} />
                <div style={{ width: 20, height: 20, borderRadius: 4, background: d.secondary_color, border: "1px solid rgba(0,0,0,.1)", flexShrink: 0 }} />
                <span style={{ fontSize: ".75rem", color: "#6b7280" }}>{d.primary_color} / {d.secondary_color}</span>
                {d.logo_url && <img src={d.logo_url} alt="Logo" style={{ height: 22, objectFit: "contain", marginLeft: ".25rem" }} />}
              </div>
              {d.external_store_url && (
                <ReviewRow label="Store" value={`${d.store_provider || "External"} — ${d.external_store_url}`} />
              )}

              <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: ".75rem" }}>
                <div style={{ fontSize: ".75rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: ".5rem" }}>Head Coach</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".55rem .75rem" }}>
                  <ReviewRow label="Name"  value={d.coach_name  || "—"} />
                  <ReviewRow label="Email" value={d.coach_email || "—"} />
                </div>
                <div style={{ marginTop: ".5rem", fontSize: ".8rem", color: "#6b7280" }}>
                  Password: {d.coach_password ? "•".repeat(Math.min(d.coach_password.length, 12)) : "—"}
                </div>
              </div>

              <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: ".75rem" }}>
                <div style={{ fontSize: ".75rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: ".5rem" }}>Starter Content</div>
                <div style={{ fontSize: ".875rem", color: "#374151" }}>
                  {d.seed_fund_uses ? "6 default fund uses will be seeded" : "No fund uses seeded"} ·{" "}
                  {d.starter_athletes.filter(a => a.name.trim()).length} starter athlete{d.starter_athletes.filter(a => a.name.trim()).length !== 1 ? "s" : ""}
                </div>
              </div>

              <div style={{ padding: ".75rem 1rem", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, fontSize: ".8rem", color: "#92400e" }}>
                A join code will be auto-generated. The coach can find it in Team Settings after logging in.
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: ".875rem 1.5rem", borderTop: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: ".5rem" }}>
          {(stepErr || launchErr) && (
            <p style={{ margin: 0, padding: ".4rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 7, color: "#dc2626", fontSize: ".82rem" }}>
              {stepErr || launchErr}
              {launchErr && step < 5 ? null : launchErr && (
                <button onClick={() => { setLaunchErr(""); setStep(1); }} style={{ marginLeft: ".75rem", background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontWeight: 700, fontSize: ".82rem", textDecoration: "underline" }}>← Back to Step 1</button>
              )}
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>{step > 1 && <Btn color="#6b7280" onClick={goBack}>← Back</Btn>}</div>
            <div style={{ display: "flex", gap: ".5rem" }}>
              {step < 5 && (
                <>
                  {step === 4 && <Btn color="#6b7280" onClick={() => { setStepErr(""); setStep(5); }}>Skip →</Btn>}
                  <Btn onClick={goNext}>Next →</Btn>
                </>
              )}
              {step === 5 && (
                <Btn color="#16a34a" onClick={launch} disabled={launching}>
                  {launching ? "Launching…" : "🚀 Launch Campaign"}
                </Btn>
              )}
            </div>
          </div>
          {step === 5 && (
            <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
              <CopyBtn text={`Slug: ${d.campaign_slug}\nCampaign: /campaign/${d.campaign_slug}\nTeam Hub: /team/${d.campaign_slug}/home\nCoach: ${d.coach_email}`} />
              <span style={{ fontSize: ".72rem", color: "#9ca3af" }}>Copy summary to clipboard</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
