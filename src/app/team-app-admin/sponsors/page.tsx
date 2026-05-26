"use client";

import { useState } from "react";
import { useAppStore } from "../../_store/AppStore";

type Tier = "Gold" | "Silver" | "Bronze";
type Sponsor = { id: number; name: string; tagline: string; initials: string; accentColor: string; tier: Tier };

const tierConfig: Record<Tier, { color: string; bg: string; label: string }> = {
  Gold:   { color: "#92700A", bg: "rgba(201,168,76,0.14)", label: "Gold" },
  Silver: { color: "#374151", bg: "rgba(107,114,128,0.12)", label: "Silver" },
  Bronze: { color: "#7C3AED", bg: "rgba(124,58,237,0.09)", label: "Bronze" },
};

const emptyForm = { name: "", tagline: "", initials: "", accentColor: "#C9A84C", tier: "Gold" as Tier };

function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>{children}</p>;
}

export default function AdminSponsorsPage() {
  const { sponsors: list, setSponsors } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });

  function F(setter: typeof setForm) {
    return (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setter(f => ({ ...f, [field]: e.target.value }));
  }
  const setF = F(setForm);
  const setEF = F(setEditForm);

  function handleAdd() {
    if (!form.name.trim()) return;
    setSponsors([...list, { ...form, id: Date.now() }]);
    setForm({ ...emptyForm });
    setAdding(false);
  }

  function startEdit(s: Sponsor) {
    setEditForm({ name: s.name, tagline: s.tagline, initials: s.initials, accentColor: s.accentColor, tier: s.tier });
    setEditingId(s.id);
  }

  function handleSaveEdit() {
    setSponsors(list.map(s => s.id === editingId ? { ...s, ...editForm } : s));
    setEditingId(null);
  }

  function SponsorForm({ f, set, onSubmit, onCancel, submitLabel }: {
    f: typeof emptyForm;
    set: (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onSubmit: () => void; onCancel: () => void; submitLabel: string;
  }) {
    return (
      <div className="ta-adm-card" style={{ padding: "20px 24px", border: "1.5px solid #C9A84C" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 0.7fr 0.8fr 0.8fr", gap: 14, marginBottom: 16 }}>
          <div>
            <Label>Sponsor Name</Label>
            <input className="ta-adm-input" placeholder="Organization name" value={f.name} onChange={set("name")} />
          </div>
          <div>
            <Label>Tagline</Label>
            <input className="ta-adm-input" placeholder="Short tagline" value={f.tagline} onChange={set("tagline")} />
          </div>
          <div>
            <Label>Initials</Label>
            <input className="ta-adm-input" maxLength={3} placeholder="ABC" value={f.initials} onChange={e => set("initials")({ ...e, target: { ...e.target, value: e.target.value.toUpperCase() } })} />
          </div>
          <div>
            <Label>Accent Color</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 22, height: 22, borderRadius: 5, background: f.accentColor, border: "1px solid rgba(0,0,0,0.1)", flexShrink: 0 }} />
              <input className="ta-adm-input" value={f.accentColor} onChange={set("accentColor")} style={{ fontFamily: "monospace", fontSize: 12 }} />
            </div>
          </div>
          <div>
            <Label>Tier</Label>
            <select className="ta-adm-select" value={f.tier} onChange={set("tier")}>
              {(["Gold", "Silver", "Bronze"] as Tier[]).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "9px 20px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={onSubmit} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: "#0B1E3D", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{submitLabel}</button>
        </div>
      </div>
    );
  }

  const tiers: Tier[] = ["Gold", "Silver", "Bronze"];

  return (
    <div className="ta-adm-page">
      <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid #E8E4DC", background: "#FFFFFF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0A0A0A" }}>Sponsors</h1>
          <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>{list.length} partners &middot; {list.filter(s => s.tier === "Gold").length} Gold</p>
        </div>
        {!adding && editingId === null && (
          <button onClick={() => setAdding(true)} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#0B1E3D", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Sponsor
          </button>
        )}
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

        {adding && (
          <SponsorForm f={form} set={setF} onSubmit={handleAdd} onCancel={() => { setAdding(false); setForm({ ...emptyForm }); }} submitLabel="Add Sponsor" />
        )}

        {tiers.map(tier => {
          const tierItems = list.filter(s => s.tier === tier);
          if (tierItems.length === 0 && !adding) return null;
          const cfg = tierConfig[tier];

          return (
            <div key={tier}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span className="ta-adm-badge" style={{ background: cfg.bg, color: cfg.color }}>{tier} Sponsors</span>
                <div style={{ flex: 1, height: 1, background: "#EDE9E3" }} />
                <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>{tierItems.length}</span>
              </div>

              <div className="ta-adm-card" style={{ overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2.5fr 2.5fr 1fr 100px", padding: "10px 20px", borderBottom: "1px solid #F0EDE8", background: "#FAFAF9" }}>
                  {["Organization", "Tagline", "Tier", "Actions"].map(h => (
                    <p key={h} style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.07em", textTransform: "uppercase" }}>{h}</p>
                  ))}
                </div>

                {tierItems.map((s, i) => {
                  const isEditing = editingId === s.id;
                  const isDeleting = deletingId === s.id;

                  if (isEditing) {
                    return (
                      <div key={s.id} style={{ padding: "14px 20px", borderBottom: i < tierItems.length - 1 ? "1px solid #F0EDE8" : "none", background: "rgba(201,168,76,0.04)" }}>
                        <SponsorForm f={editForm} set={setEF} onSubmit={handleSaveEdit} onCancel={() => setEditingId(null)} submitLabel="Save" />
                      </div>
                    );
                  }

                  return (
                    <div key={s.id} className="ta-adm-row" style={{ display: "grid", gridTemplateColumns: "2.5fr 2.5fr 1fr 100px", padding: "12px 20px", alignItems: "center", borderBottom: i < tierItems.length - 1 ? "1px solid #F0EDE8" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: `${s.accentColor}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: s.accentColor, border: `1.5px solid ${s.accentColor}44` }}>
                          {s.initials}
                        </div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#0A0A0A" }}>{s.name}</p>
                      </div>
                      <p style={{ fontSize: 13, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.tagline}</p>
                      <span className="ta-adm-badge" style={{ background: cfg.bg, color: cfg.color }}>{s.tier}</span>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button className="ta-adm-icon-btn" onClick={() => startEdit(s as Sponsor)} title="Edit">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        {isDeleting ? (
                          <div style={{ display: "flex", gap: 5 }}>
                            <button onClick={() => { setSponsors(list.filter(x => x.id !== s.id)); setDeletingId(null); }} style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", background: "rgba(220,38,38,0.08)", border: "none", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>Del</button>
                            <button onClick={() => setDeletingId(null)} style={{ fontSize: 11, color: "#6B7280", background: "#F3F4F6", border: "none", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>No</button>
                          </div>
                        ) : (
                          <button className="ta-adm-icon-btn danger" onClick={() => setDeletingId(s.id)} title="Remove">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {tierItems.length === 0 && (
                  <div style={{ padding: "20px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                    No {tier} sponsors yet.
                  </div>
                )}
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}
