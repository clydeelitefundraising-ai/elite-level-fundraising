"use client";

import { useState } from "react";
import { useAppStore } from "../../_store/AppStore";
import type { TeamUpdate, UpdateCategory, UpdatePriority, AuthorRole } from "../../team-app/_data/mockData";

const categoryConfig: Record<UpdateCategory, { label: string; color: string; bg: string }> = {
  "schedule":   { label: "Schedule",   color: "#1A3A5C", bg: "rgba(26,58,92,0.10)"    },
  "fundraiser": { label: "Fundraiser", color: "#C9A84C", bg: "rgba(201,168,76,0.14)" },
  "travel":     { label: "Travel",     color: "#7C3AED", bg: "rgba(124,58,237,0.09)" },
  "meet-info":  { label: "Meet Info",  color: "#0369A1", bg: "rgba(3,105,161,0.10)"  },
  "team-alert": { label: "Team Alert", color: "#DC2626", bg: "rgba(220,38,38,0.09)"  },
};

const emptyForm = {
  title: "", body: "", author: "Coach Williams",
  authorRole: "Head Coach" as AuthorRole,
  authorInitials: "CW",
  category: "schedule" as UpdateCategory,
  priority: "normal" as UpdatePriority,
};

function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>{children}</p>;
}

export default function AdminUpdatesPage() {
  const { teamUpdates: updates, setTeamUpdates } = useAppStore();
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function F(field: keyof typeof emptyForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));
  }

  function handlePost() {
    if (!form.title.trim() || !form.body.trim()) return;
    const newUpdate: TeamUpdate = {
      ...form,
      id: Date.now(),
      timestamp: "Just now",
      timeGroup: "today",
      read: false,
    };
    setTeamUpdates([newUpdate, ...updates]);
    setForm({ ...emptyForm });
    setComposing(false);
  }

  function handleSaveEdit() {
    setTeamUpdates(updates.map(item => item.id === editingId ? { ...item, ...form } : item));
    setEditingId(null);
  }

  function startEdit(u: TeamUpdate) {
    setForm({ title: u.title, body: u.body, author: u.author, authorRole: u.authorRole, authorInitials: u.authorInitials, category: u.category, priority: u.priority });
    setEditingId(u.id);
    setComposing(false);
  }

  function handleDelete(id: number) {
    setTeamUpdates(updates.filter(item => item.id !== id));
    setDeletingId(null);
  }

  function ComposeForm({ onSubmit, onCancel, submitLabel }: { onSubmit: () => void; onCancel: () => void; submitLabel: string }) {
    return (
      <div className="ta-adm-card" style={{ padding: "22px 24px", border: "1.5px solid #C9A84C" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Title</Label>
            <input className="ta-adm-input" placeholder="Update title…" value={form.title} onChange={F("title")} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Message</Label>
            <textarea className="ta-adm-textarea" placeholder="Write your update…" value={form.body} onChange={F("body")} style={{ minHeight: 110 }} />
          </div>
          <div>
            <Label>Author Name</Label>
            <input className="ta-adm-input" value={form.author} onChange={F("author")} />
          </div>
          <div>
            <Label>Author Role</Label>
            <select className="ta-adm-select" value={form.authorRole} onChange={F("authorRole")}>
              {(["Head Coach", "Assistant Coach", "Admin", "Booster Club"] as AuthorRole[]).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Author Initials</Label>
            <input className="ta-adm-input" maxLength={2} value={form.authorInitials} onChange={e => setForm(f => ({ ...f, authorInitials: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <Label>Category</Label>
            <select className="ta-adm-select" value={form.category} onChange={F("category")}>
              {(Object.entries(categoryConfig) as [UpdateCategory, { label: string }][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Priority</Label>
            <select className="ta-adm-select" value={form.priority} onChange={F("priority")}>
              <option value="normal">Normal</option>
              <option value="high">High — ⚡ Important</option>
              <option value="pinned">Pinned — 📌</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {(["PDF", "Heat Sheet", "Drive Link", "Image"] as const).map(t => (
            <button key={t} style={{
              padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: "1.5px dashed #D1D5DB", background: "#F9F8F6", color: "#9CA3AF", cursor: "default",
            }} title="Attachment upload — Supabase Storage coming soon">
              + {t}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "9px 20px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={onSubmit} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: "#0B1E3D", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {submitLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ta-adm-page">
      <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid #E8E4DC", background: "#FFFFFF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0A0A0A" }}>Updates</h1>
          <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>Post and manage team announcements.</p>
        </div>
        {!composing && editingId === null && (
          <button onClick={() => setComposing(true)} style={{
            padding: "9px 20px", borderRadius: 10, border: "none",
            background: "#0B1E3D", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Update
          </button>
        )}
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 14 }}>

        {composing && (
          <ComposeForm onSubmit={handlePost} onCancel={() => { setComposing(false); setForm({ ...emptyForm }); }} submitLabel="Post Update" />
        )}

        {updates.map((u) => {
          const cfg = categoryConfig[u.category];
          const isEditing = editingId === u.id;
          const isDeleting = deletingId === u.id;

          if (isEditing) {
            return (
              <div key={u.id}>
                <ComposeForm onSubmit={handleSaveEdit} onCancel={() => setEditingId(null)} submitLabel="Save Changes" />
              </div>
            );
          }

          return (
            <div key={u.id} className="ta-adm-card" style={{ display: "flex", alignItems: "stretch", overflow: "hidden" }}>
              <div style={{ width: 4, flexShrink: 0, background: cfg.color }} />
              <div style={{ flex: 1, padding: "14px 18px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      {u.priority === "pinned" && (
                        <span className="ta-adm-badge" style={{ background: "rgba(201,168,76,0.14)", color: "#92700A" }}>📌 Pinned</span>
                      )}
                      {u.priority === "high" && (
                        <span className="ta-adm-badge" style={{ background: "rgba(220,38,38,0.09)", color: "#B91C1C" }}>⚡ Important</span>
                      )}
                      <span className="ta-adm-badge" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                      {!u.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#0369A1", display: "inline-block" }} />}
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A", lineHeight: 1.3 }}>{u.title}</p>
                    <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 3 }}>{u.author} · {u.authorRole} · {u.timestamp}</p>
                    <p style={{ fontSize: 13, color: "#4B5563", marginTop: 8, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
                      {u.body}
                    </p>
                    {u.attachments && u.attachments.length > 0 && (
                      <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
                        📎 {u.attachments.map(a => a.label).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button className="ta-adm-icon-btn" onClick={() => startEdit(u)} title="Edit">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    {isDeleting ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>Delete?</span>
                        <button onClick={() => handleDelete(u.id)} style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", background: "rgba(220,38,38,0.08)", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Yes</button>
                        <button onClick={() => setDeletingId(null)} style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", background: "#F3F4F6", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>No</button>
                      </div>
                    ) : (
                      <button className="ta-adm-icon-btn danger" onClick={() => setDeletingId(u.id)} title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {updates.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF" }}>
            <p style={{ fontSize: 15, fontWeight: 600 }}>No updates yet</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Click &quot;New Update&quot; to post the first one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
