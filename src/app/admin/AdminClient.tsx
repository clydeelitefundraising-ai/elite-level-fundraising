"use client";

import { useState, useEffect } from "react";

type Settings = { school_name: string; sport_name: string; mascot: string; goal_cents: number; deadline: string; primary_color: string; secondary_color: string; location: string; season: string; logo_url: string };
type Athlete  = { id: string; name: string; event: string };
type Sponsor  = { id: string; name: string; url: string; tier: "gold" | "silver" | "bronze" };

// ── Shared micro-styles ────────────────────────────────────────────────────────

const S = {
  input: { padding: ".4rem .6rem", border: "1px solid #ccc", borderRadius: 4, fontSize: ".9rem", width: "100%", boxSizing: "border-box" } as React.CSSProperties,
  th:    { textAlign: "left", padding: "0.4rem 0.75rem", background: "#f0f0f0", fontSize: ".85rem", fontWeight: 600, whiteSpace: "nowrap" } as React.CSSProperties,
  td:    { padding: "0.4rem 0.75rem", borderBottom: "1px solid #eee", fontSize: ".9rem", verticalAlign: "middle" } as React.CSSProperties,
  card:  { background: "#fff", borderRadius: 10, padding: "1.5rem", boxShadow: "0 2px 12px rgba(0,0,0,.07)", marginBottom: "1.5rem" } as React.CSSProperties,
  title: { margin: "0 0 1rem", fontSize: "1.1rem", fontWeight: 700, fontFamily: "system-ui, sans-serif" } as React.CSSProperties,
  label: { display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".85rem", fontWeight: 600 } as React.CSSProperties,
};

const btn = (color = "#0b1e3d", extra?: React.CSSProperties): React.CSSProperties => ({
  padding: ".35rem .75rem", background: color, color: "#fff", border: "none",
  borderRadius: 4, cursor: "pointer", fontSize: ".85rem", whiteSpace: "nowrap", ...extra,
});

// ── Login View ─────────────────────────────────────────────────────────────────

export function LoginView() {
  const [pw,   setPw]   = useState("");
  const [err,  setErr]  = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) window.location.reload();
    else { setErr("Incorrect password."); setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#fff", padding: "2rem 2.5rem", borderRadius: 12, boxShadow: "0 2px 16px rgba(0,0,0,.1)", minWidth: 320 }}>
        <h1 style={{ margin: "0 0 .5rem", fontSize: "1.4rem" }}>ELF Admin</h1>
        <p style={{ margin: "0 0 1.25rem", fontSize: ".85rem", color: "#666" }}>Enter your admin password to continue.</p>
        <input
          type="password"
          placeholder="Admin password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          style={{ ...S.input, marginBottom: ".75rem" }}
          required
          autoFocus
        />
        {err && <p style={{ color: "#c00", margin: "0 0 .75rem", fontSize: ".9rem" }}>{err}</p>}
        <button type="submit" disabled={busy} style={{ ...btn(), width: "100%", padding: ".7rem", fontSize: "1rem" }}>
          {busy ? "Logging in…" : "Login"}
        </button>
      </form>
    </div>
  );
}

// ── Admin Dashboard ────────────────────────────────────────────────────────────

export function AdminDashboard() {
  const [settings, setSettings] = useState<Settings>({ school_name: "", sport_name: "", mascot: "", goal_cents: 0, deadline: "", primary_color: "#1B4FA8", secondary_color: "#C4A35A", location: "", season: "", logo_url: "" });
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [toast,    setToast]    = useState("");
  const [saving,   setSaving]   = useState(false);

  const [newAName,  setNewAName]  = useState("");
  const [newAEvent, setNewAEvent] = useState("");

  const [newSName, setNewSName] = useState("");
  const [newSUrl,  setNewSUrl]  = useState("");
  const [newSTier, setNewSTier] = useState<Sponsor["tier"]>("gold");

  const [editA, setEditA] = useState<Athlete | null>(null);
  const [editS, setEditS] = useState<Sponsor | null>(null);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/campaign").then(r => r.json()),
      fetch("/api/admin/athletes").then(r => r.json()),
      fetch("/api/admin/sponsors").then(r => r.json()),
    ]).then(([c, a, s]) => {
      if (c && !c.error) setSettings(c);
      if (Array.isArray(a)) setAthletes(a);
      if (Array.isArray(s)) setSponsors(s);
    }).catch(() => {});
  }, []);

  // ── Campaign settings ──

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/admin/campaign", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    flash(res.ok ? "Settings saved." : "Error saving settings.");
  };

  // ── Athletes ──

  const addAthlete = async () => {
    if (!newAName.trim() || !newAEvent.trim()) return;
    const res = await fetch("/api/admin/athletes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newAName.trim(), event: newAEvent.trim() }),
    });
    if (res.ok) {
      const athlete = await res.json();
      setAthletes(prev => [...prev, athlete]);
      setNewAName(""); setNewAEvent("");
      flash("Athlete added.");
    }
  };

  const saveAthlete = async () => {
    if (!editA) return;
    const res = await fetch(`/api/admin/athletes/${editA.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editA.name, event: editA.event }),
    });
    if (res.ok) { setAthletes(prev => prev.map(a => a.id === editA.id ? editA : a)); setEditA(null); flash("Athlete updated."); }
  };

  const deleteAthlete = async (id: string) => {
    if (!confirm("Delete this athlete?")) return;
    const res = await fetch(`/api/admin/athletes/${id}`, { method: "DELETE" });
    if (res.ok) { setAthletes(prev => prev.filter(a => a.id !== id)); flash("Athlete deleted."); }
  };

  // ── Sponsors ──

  const addSponsor = async () => {
    if (!newSName.trim() || !newSUrl.trim()) return;
    const res = await fetch("/api/admin/sponsors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSName.trim(), url: newSUrl.trim(), tier: newSTier }),
    });
    if (res.ok) {
      const sponsor = await res.json();
      setSponsors(prev => [...prev, sponsor]);
      setNewSName(""); setNewSUrl(""); setNewSTier("gold");
      flash("Sponsor added.");
    }
  };

  const saveSponsor = async () => {
    if (!editS) return;
    const res = await fetch(`/api/admin/sponsors/${editS.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editS.name, url: editS.url, tier: editS.tier }),
    });
    if (res.ok) { setSponsors(prev => prev.map(s => s.id === editS.id ? editS : s)); setEditS(null); flash("Sponsor updated."); }
  };

  const deleteSponsor = async (id: string) => {
    if (!confirm("Delete this sponsor?")) return;
    const res = await fetch(`/api/admin/sponsors/${id}`, { method: "DELETE" });
    if (res.ok) { setSponsors(prev => prev.filter(s => s.id !== id)); flash("Sponsor deleted."); }
  };

  const logout = async () => { await fetch("/api/admin/logout", { method: "POST" }); window.location.reload(); };

  // ── Render ──

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#0b1e3d", color: "#fff", padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>ELF Admin</span>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <a href="/campaign/paradise-valley-track-field-live" target="_blank" rel="noopener noreferrer"
            style={{ color: "rgba(255,255,255,.7)", fontSize: ".85rem", textDecoration: "none" }}>
            View campaign →
          </a>
          <button onClick={logout} style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: "none", borderRadius: 4, padding: ".4rem .9rem", cursor: "pointer" }}>
            Logout
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", background: "#222", color: "#fff", padding: ".6rem 1.2rem", borderRadius: 6, zIndex: 1000, fontSize: ".9rem" }}>
          {toast}
        </div>
      )}

      <div style={{ maxWidth: 900, margin: "2rem auto", padding: "0 1rem" }}>

        {/* Campaign Settings */}
        <div style={S.card}>
          <h2 style={S.title}>Campaign Settings</h2>
          <form onSubmit={saveSettings}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <label style={S.label}>
                School Name
                <input style={S.input} value={settings.school_name}
                  onChange={e => setSettings(s => ({ ...s, school_name: e.target.value }))} />
              </label>
              <label style={S.label}>
                Sport Name
                <input style={S.input} value={settings.sport_name}
                  onChange={e => setSettings(s => ({ ...s, sport_name: e.target.value }))} />
              </label>
              <label style={S.label}>
                Mascot
                <input style={S.input} value={settings.mascot}
                  onChange={e => setSettings(s => ({ ...s, mascot: e.target.value }))} placeholder="e.g. Pumas" />
              </label>
              <label style={S.label}>
                Goal Amount ($)
                <input type="number" min="1" style={S.input}
                  value={settings.goal_cents ? settings.goal_cents / 100 : ""}
                  onChange={e => setSettings(s => ({ ...s, goal_cents: Math.round(parseFloat(e.target.value) * 100) || 0 }))} />
              </label>
              <label style={S.label}>
                Deadline
                <input type="date" style={S.input} value={settings.deadline}
                  onChange={e => setSettings(s => ({ ...s, deadline: e.target.value }))} />
              </label>
              <label style={S.label}>
                Primary Color
                <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                  <input style={S.input} value={settings.primary_color} placeholder="#1B4FA8"
                    onChange={e => setSettings(s => ({ ...s, primary_color: e.target.value }))} />
                  <span style={{ width: 28, height: 28, borderRadius: 4, background: settings.primary_color, border: "1px solid #ccc", flexShrink: 0 }} />
                </div>
              </label>
              <label style={S.label}>
                Secondary Color
                <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                  <input style={S.input} value={settings.secondary_color} placeholder="#C4A35A"
                    onChange={e => setSettings(s => ({ ...s, secondary_color: e.target.value }))} />
                  <span style={{ width: 28, height: 28, borderRadius: 4, background: settings.secondary_color, border: "1px solid #ccc", flexShrink: 0 }} />
                </div>
              </label>
              <label style={S.label}>
                Location
                <input style={S.input} value={settings.location}
                  onChange={e => setSettings(s => ({ ...s, location: e.target.value }))} placeholder="e.g. Paradise Valley, Arizona" />
              </label>
              <label style={S.label}>
                Season
                <input style={S.input} value={settings.season}
                  onChange={e => setSettings(s => ({ ...s, season: e.target.value }))} placeholder="e.g. 2025 Season" />
              </label>
              <label style={{ ...S.label, gridColumn: "1 / -1" }}>
                School Logo URL
                <input style={S.input} value={settings.logo_url}
                  onChange={e => setSettings(s => ({ ...s, logo_url: e.target.value }))} placeholder="e.g. /pvcc-logo.png or https://..." />
              </label>
            </div>
            <button type="submit" disabled={saving} style={btn()}>
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </form>
        </div>

        {/* Athletes */}
        <div style={S.card}>
          <h2 style={S.title}>Athletes</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Event</th>
                <th style={{ ...S.th, width: 150 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map(a => (
                editA?.id === a.id ? (
                  <tr key={a.id}>
                    <td style={S.td}><input style={S.input} value={editA.name} onChange={e => setEditA(v => v ? { ...v, name: e.target.value } : v)} /></td>
                    <td style={S.td}><input style={S.input} value={editA.event} onChange={e => setEditA(v => v ? { ...v, event: e.target.value } : v)} /></td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: ".4rem" }}>
                        <button style={btn()} onClick={saveAthlete}>Save</button>
                        <button style={btn("#666")} onClick={() => setEditA(null)}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={a.id}>
                    <td style={S.td}>{a.name}</td>
                    <td style={S.td}>{a.event}</td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: ".4rem" }}>
                        <button style={btn()} onClick={() => setEditA({ ...a })}>Edit</button>
                        <button style={btn("#c00")} onClick={() => deleteAthlete(a.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
              {athletes.length === 0 && (
                <tr><td colSpan={3} style={{ ...S.td, color: "#999", textAlign: "center", padding: "1rem" }}>No athletes yet.</td></tr>
              )}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: ".5rem", alignItems: "flex-end" }}>
            <label style={{ ...S.label, flex: 2 }}>
              Name
              <input style={S.input} value={newAName} onChange={e => setNewAName(e.target.value)} placeholder="Athlete name" />
            </label>
            <label style={{ ...S.label, flex: 1 }}>
              Event
              <input style={S.input} value={newAEvent} onChange={e => setNewAEvent(e.target.value)} placeholder="Sprints" />
            </label>
            <button style={btn("#2a7a2a", { flexShrink: 0 })} onClick={addAthlete}>+ Add</button>
          </div>
        </div>

        {/* Sponsors */}
        <div style={S.card}>
          <h2 style={S.title}>Sponsors</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>URL</th>
                <th style={S.th}>Tier</th>
                <th style={{ ...S.th, width: 150 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sponsors.map(s => (
                editS?.id === s.id ? (
                  <tr key={s.id}>
                    <td style={S.td}><input style={S.input} value={editS.name} onChange={e => setEditS(v => v ? { ...v, name: e.target.value } : v)} /></td>
                    <td style={S.td}><input style={S.input} value={editS.url}  onChange={e => setEditS(v => v ? { ...v, url:  e.target.value } : v)} /></td>
                    <td style={S.td}>
                      <select style={S.input} value={editS.tier} onChange={e => setEditS(v => v ? { ...v, tier: e.target.value as Sponsor["tier"] } : v)}>
                        <option value="gold">Gold</option>
                        <option value="silver">Silver</option>
                        <option value="bronze">Bronze</option>
                      </select>
                    </td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: ".4rem" }}>
                        <button style={btn()} onClick={saveSponsor}>Save</button>
                        <button style={btn("#666")} onClick={() => setEditS(null)}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td style={S.td}>{s.name}</td>
                    <td style={{ ...S.td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0b1e3d" }}>{s.url}</a>
                    </td>
                    <td style={S.td}>{s.tier}</td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: ".4rem" }}>
                        <button style={btn()} onClick={() => setEditS({ ...s })}>Edit</button>
                        <button style={btn("#c00")} onClick={() => deleteSponsor(s.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
              {sponsors.length === 0 && (
                <tr><td colSpan={4} style={{ ...S.td, color: "#999", textAlign: "center", padding: "1rem" }}>No sponsors yet.</td></tr>
              )}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: ".5rem", alignItems: "flex-end" }}>
            <label style={{ ...S.label, flex: 2 }}>
              Name
              <input style={S.input} value={newSName} onChange={e => setNewSName(e.target.value)} placeholder="Business name" />
            </label>
            <label style={{ ...S.label, flex: 2 }}>
              URL
              <input style={S.input} value={newSUrl} onChange={e => setNewSUrl(e.target.value)} placeholder="https://..." />
            </label>
            <label style={{ ...S.label, flex: 1 }}>
              Tier
              <select style={S.input} value={newSTier} onChange={e => setNewSTier(e.target.value as Sponsor["tier"])}>
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="bronze">Bronze</option>
              </select>
            </label>
            <button style={btn("#2a7a2a", { flexShrink: 0 })} onClick={addSponsor}>+ Add</button>
          </div>
        </div>

      </div>
    </div>
  );
}
