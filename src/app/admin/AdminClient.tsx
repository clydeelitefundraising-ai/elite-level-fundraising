"use client";

import { useState, useEffect } from "react";

type Settings   = { school_name: string; sport_name: string; mascot: string; goal_cents: number; deadline: string; primary_color: string; secondary_color: string; location: string; season: string; logo_url: string; show_leaderboard: boolean; show_program_identity: boolean; show_share_section: boolean; show_fund_uses: boolean; show_recent_donations: boolean; show_sponsors: boolean; show_donation_card: boolean; layout_variant: "classic" | "premium" };
type Athlete    = { id: string; name: string; event: string };
type Sponsor    = { id: string; name: string; url: string; tier: "gold" | "silver" | "bronze" };
type FundUse    = { id: string; title: string; description: string; icon: string; sort_order: number };
type Coach      = { id: string; name: string; email: string; role: "head_coach" | "assistant_coach"; campaign_slug: string; created_at: string };

const EMOJI_PICKS = ["✈️","🚌","👟","🎽","🏆","🥇","💪","🧊","🍽️","🏟️","📋","🧢","🏋️","🏃","⚽","🏀","🏈","⚾","🥎","🎾","🏐","💰","🎯","📚","🛡️","❤️"];

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
  const blank: Settings = { school_name: "", sport_name: "", mascot: "", goal_cents: 0, deadline: "", primary_color: "#1B4FA8", secondary_color: "#C4A35A", location: "", season: "", logo_url: "", show_leaderboard: true, show_program_identity: true, show_share_section: true, show_fund_uses: true, show_recent_donations: true, show_sponsors: true, show_donation_card: true, layout_variant: "classic" };
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
  const [createOpen, setCreateOpen] = useState(false);

  const [coaches,    setCoaches]    = useState<Coach[]>([]);
  const [newCName,   setNewCName]   = useState("");
  const [newCEmail,  setNewCEmail]  = useState("");
  const [newCRole,   setNewCRole]   = useState<Coach["role"]>("head_coach");
  const [newCPass,   setNewCPass]   = useState("");
  const [coachError, setCoachError] = useState("");

  type NewCampaign = { campaign_slug: string; school_name: string; sport_name: string; mascot: string; goal_dollars: string; deadline: string; primary_color: string; secondary_color: string; location: string; season: string; logo_url: string };
  const nc0: NewCampaign = { campaign_slug: "", school_name: "", sport_name: "", mascot: "", goal_dollars: "", deadline: "", primary_color: "#1B4FA8", secondary_color: "#C4A35A", location: "", season: "", logo_url: "" };
  const [newC,        setNewC]        = useState<NewCampaign>(nc0);
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

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
    const res = await fetch("/api/admin/campaign", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, slug: selectedSlug }) });
    setSaving(false);
    flash(res.ok ? "Settings saved." : "Error saving settings.");
  };

  const addAthlete = async () => {
    if (!newAName.trim() || !newAEvent.trim()) return;
    const res = await fetch("/api/admin/athletes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_slug: selectedSlug, name: newAName.trim(), event: newAEvent.trim() }) });
    if (res.ok) { const a = await res.json(); setAthletes(p => [...p, a]); setNewAName(""); setNewAEvent(""); flash("Athlete added."); }
  };

  const saveAthlete = async () => {
    if (!editA) return;
    const res = await fetch(`/api/admin/athletes/${editA.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editA.name, event: editA.event }) });
    if (res.ok) { setAthletes(p => p.map(a => a.id === editA.id ? editA : a)); setEditA(null); flash("Athlete updated."); }
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
    } else {
      setCoachError(data.error ?? "Failed to add coach.");
    }
  };

  const deleteCoach = async (id: string) => {
    if (!confirm("Remove this coach? They will no longer be able to log in to the team hub.")) return;
    const res = await fetch(`/api/admin/coaches/${id}`, { method: "DELETE" });
    if (res.ok) { setCoaches(p => p.filter(c => c.id !== id)); flash("Coach removed."); }
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

  const createCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(""); setCreating(true);
    const res = await fetch("/api/admin/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaign_slug: newC.campaign_slug.trim(), school_name: newC.school_name, sport_name: newC.sport_name, mascot: newC.mascot, goal_cents: Math.round(parseFloat(newC.goal_dollars || "0") * 100) || 0, deadline: newC.deadline, primary_color: newC.primary_color, secondary_color: newC.secondary_color, location: newC.location, season: newC.season, logo_url: newC.logo_url }) });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setCreateError(data.error ?? "Failed to create campaign."); return; }
    setCreatedSlug(data.slug);
    setAllSlugs(p => p.some(s => s.campaign_slug === data.slug) ? p : [...p, { campaign_slug: data.slug, archived: false }]);
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

        {/* ── 1. Create New Campaign ── */}
        <div style={C.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => { if (!createdSlug) setCreateOpen(o => !o); }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0b1e3d" }}>Create New Campaign</h2>
              {!createOpen && !createdSlug && <p style={{ margin: ".2rem 0 0", fontSize: ".8rem", color: "#9ca3af" }}>Add a new fundraising campaign</p>}
            </div>
            {!createdSlug && (
              <span style={{ fontSize: "1.25rem", color: "#6b7280", lineHeight: 1, userSelect: "none" }}>{createOpen ? "−" : "+"}</span>
            )}
          </div>

          {createdSlug && (
            <div style={{ marginTop: "1rem", padding: "1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
              <p style={{ margin: "0 0 .5rem", color: "#15803d", fontWeight: 700, fontSize: ".9rem" }}>✓ Campaign created successfully.</p>
              <a href={`/campaign/${createdSlug}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: ".85rem", color: "#0b1e3d", fontWeight: 600 }}>
                /campaign/{createdSlug} ↗
              </a>
              <div style={{ marginTop: ".75rem" }}>
                <Btn color="#6b7280" onClick={() => { setCreatedSlug(null); setNewC(nc0); setCreateError(""); setCreateOpen(false); }}>+ Create Another</Btn>
              </div>
            </div>
          )}

          {createOpen && !createdSlug && (
            <form onSubmit={createCampaign} style={{ marginTop: "1.25rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <label style={{ ...C.label, gridColumn: "1 / -1" }}>
                  Campaign Slug <span style={{ color: "#dc2626", fontWeight: 400 }}>*</span>
                  <input style={C.input} required value={newC.campaign_slug} placeholder="e.g. mesa-soccer-2026"
                    onChange={e => setNewC(v => ({ ...v, campaign_slug: e.target.value }))} />
                  <span style={{ fontSize: ".72rem", color: "#9ca3af", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>Lowercase letters, numbers, and hyphens only · becomes the URL</span>
                </label>
                <label style={C.label}>School Name <input style={C.input} value={newC.school_name} onChange={e => setNewC(v => ({ ...v, school_name: e.target.value }))} /></label>
                <label style={C.label}>Sport Name  <input style={C.input} value={newC.sport_name}  onChange={e => setNewC(v => ({ ...v, sport_name: e.target.value }))} /></label>
                <label style={C.label}>Mascot      <input style={C.input} value={newC.mascot} placeholder="e.g. Jaguars" onChange={e => setNewC(v => ({ ...v, mascot: e.target.value }))} /></label>
                <label style={C.label}>Goal ($)    <input type="number" min="1" style={C.input} value={newC.goal_dollars} onChange={e => setNewC(v => ({ ...v, goal_dollars: e.target.value }))} /></label>
                <label style={C.label}>Deadline    <input type="date" style={C.input} value={newC.deadline} onChange={e => setNewC(v => ({ ...v, deadline: e.target.value }))} /></label>
                <label style={C.label}>Location    <input style={C.input} value={newC.location} placeholder="e.g. Mesa, Arizona" onChange={e => setNewC(v => ({ ...v, location: e.target.value }))} /></label>
                <label style={C.label}>Season      <input style={C.input} value={newC.season} placeholder="e.g. 2026 Season" onChange={e => setNewC(v => ({ ...v, season: e.target.value }))} /></label>
                <ColorField label="Primary Color"   value={newC.primary_color}   onChange={v => setNewC(x => ({ ...x, primary_color: v }))} />
                <ColorField label="Secondary Color" value={newC.secondary_color} onChange={v => setNewC(x => ({ ...x, secondary_color: v }))} />
                <label style={{ ...C.label, gridColumn: "1 / -1" }}>
                  Logo URL
                  <input style={C.input} value={newC.logo_url} placeholder="/logo.png or https://…" onChange={e => setNewC(v => ({ ...v, logo_url: e.target.value }))} />
                </label>
              </div>
              {createError && <p style={{ color: "#dc2626", margin: "0 0 .75rem", fontSize: ".85rem" }}>{createError}</p>}
              <Btn type="submit" disabled={creating} color="#16a34a">{creating ? "Creating…" : "Create Campaign"}</Btn>
            </form>
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
                  <th style={C.th}>Event / Position</th>
                  <th style={{ ...C.th, width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {athletes.map(a => (
                  editA?.id === a.id ? (
                    <tr key={a.id} style={{ background: "#fafafa" }}>
                      <td style={C.td}><input style={C.input} value={editA.name}  onChange={e => setEditA(v => v ? { ...v, name: e.target.value } : v)} /></td>
                      <td style={C.td}><input style={C.input} value={editA.event} onChange={e => setEditA(v => v ? { ...v, event: e.target.value } : v)} /></td>
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
                      <td style={{ ...C.td, color: "#6b7280" }}>{a.event}</td>
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
                  <th style={{ ...C.th, width: 110 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {coaches.map(c => (
                  <tr key={c.id}>
                    <td style={{ ...C.td, fontWeight: 600 }}>{c.name}</td>
                    <td style={{ ...C.td, color: "#6b7280" }}>{c.email}</td>
                    <td style={C.td}>
                      <span style={{ padding: ".2rem .6rem", borderRadius: 100, fontSize: ".72rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: c.role === "head_coach" ? "#dbeafe" : "#f3f4f6", color: c.role === "head_coach" ? "#1d4ed8" : "#374151" }}>
                        {c.role === "head_coach" ? "Head Coach" : "Asst. Coach"}
                      </span>
                    </td>
                    <td style={C.td}>
                      <Btn color="#dc2626" onClick={() => deleteCoach(c.id)}>Remove</Btn>
                    </td>
                  </tr>
                ))}
                {coaches.length === 0 && (
                  <tr><td colSpan={4} style={{ ...C.td, color: "#9ca3af", textAlign: "center", padding: "1.5rem" }}>No coaches yet. Add one below.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "1rem", background: "#f9fafb", borderRadius: 8, border: "1px solid #f3f4f6" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: ".75rem" }}>
              <label style={C.label}>Name <input style={C.input} value={newCName} onChange={e => setNewCName(e.target.value)} placeholder="Coach name" /></label>
              <label style={C.label}>Email <input type="email" style={C.input} value={newCEmail} onChange={e => setNewCEmail(e.target.value)} placeholder="coach@school.edu" /></label>
              <label style={C.label}>
                Role
                <select style={C.input} value={newCRole} onChange={e => setNewCRole(e.target.value as Coach["role"])}>
                  <option value="head_coach">Head Coach</option>
                  <option value="assistant_coach">Assistant Coach</option>
                </select>
              </label>
              <label style={C.label}>
                Temporary Password
                <input type="password" style={C.input} value={newCPass} onChange={e => setNewCPass(e.target.value)} placeholder="Set a login password" />
              </label>
            </div>
            {coachError && <p style={{ color: "#dc2626", margin: "0 0 .75rem", fontSize: ".85rem" }}>{coachError}</p>}
            <Btn color="#16a34a" onClick={addCoach}>+ Add Coach</Btn>
          </div>
        </div>

      </div>
    </div>
  );
}
