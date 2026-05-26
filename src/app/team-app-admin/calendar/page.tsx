"use client";

import { useState } from "react";
import { useAppStore } from "../../_store/AppStore";

type EventType = "game" | "practice" | "fundraiser" | "team";
type CalEvent = { id: number; title: string; date: string; time: string; location: string; type: EventType };

const typeConfig: Record<EventType, { label: string; color: string; bg: string }> = {
  game:       { label: "Game",       color: "#1A3A5C", bg: "rgba(26,58,92,0.10)"    },
  practice:   { label: "Practice",   color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
  fundraiser: { label: "Fundraiser", color: "#C9A84C", bg: "rgba(201,168,76,0.14)" },
  team:       { label: "Team Event", color: "#0B1E3D", bg: "rgba(11,30,61,0.08)"   },
};

const emptyEvent = { title: "", date: "", time: "", location: "", type: "practice" as EventType };

function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>{children}</p>;
}

export default function AdminCalendarPage() {
  const { calendarEvents: events, setCalendarEvents } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyEvent });
  const [editForm, setEditForm] = useState({ ...emptyEvent });

  function setF(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [field]: e.target.value }));
  }
  function setEF(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEditForm(f => ({ ...f, [field]: e.target.value }));
  }

  function handleAdd() {
    if (!form.title.trim() || !form.date.trim()) return;
    setCalendarEvents([...events, { ...form, id: Date.now() }]);
    setForm({ ...emptyEvent });
    setAdding(false);
  }

  function startEdit(e: CalEvent) {
    setEditForm({ title: e.title, date: e.date, time: e.time, location: e.location, type: e.type });
    setEditingId(e.id);
  }

  function handleSaveEdit() {
    setCalendarEvents(events.map(e => e.id === editingId ? { ...e, ...editForm } : e));
    setEditingId(null);
  }

  function EventFormRow({ f, set, onSubmit, onCancel, submitLabel }: {
    f: typeof emptyEvent;
    set: (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onSubmit: () => void; onCancel: () => void; submitLabel: string;
  }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 0.9fr 1.5fr 1fr 100px", gap: 10, alignItems: "end" }}>
        <div><Label>Title</Label><input className="ta-adm-input" placeholder="Event title" value={f.title} onChange={set("title")} /></div>
        <div><Label>Date</Label><input className="ta-adm-input" placeholder="May 1, 2025" value={f.date} onChange={set("date")} /></div>
        <div><Label>Time</Label><input className="ta-adm-input" placeholder="6:00 AM" value={f.time} onChange={set("time")} /></div>
        <div><Label>Location</Label><input className="ta-adm-input" placeholder="PV Track" value={f.location} onChange={set("location")} /></div>
        <div>
          <Label>Type</Label>
          <select className="ta-adm-select" value={f.type} onChange={set("type")}>
            {(Object.entries(typeConfig) as [EventType, { label: string }][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 6, paddingBottom: 1 }}>
          <button onClick={onSubmit} style={{ padding: "9px 14px", borderRadius: 9, border: "none", background: "#0B1E3D", color: "#FFFFFF", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{submitLabel}</button>
          <button onClick={onCancel} style={{ padding: "9px 12px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#6B7280", fontSize: 12, cursor: "pointer" }}>✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ta-adm-page">
      <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid #E8E4DC", background: "#FFFFFF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0A0A0A" }}>Calendar</h1>
          <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>Manage scheduled events for the season.</p>
        </div>
        {!adding && editingId === null && (
          <button onClick={() => setAdding(true)} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#0B1E3D", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Event
          </button>
        )}
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Type legend */}
        <div style={{ display: "flex", gap: 8 }}>
          {(Object.entries(typeConfig) as [EventType, { label: string; color: string; bg: string }][]).map(([k, v]) => (
            <span key={k} className="ta-adm-badge" style={{ background: v.bg, color: v.color }}>{v.label}</span>
          ))}
        </div>

        <div className="ta-adm-card" style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 0.9fr 1.5fr 1fr 100px", padding: "12px 20px", borderBottom: "1px solid #F0EDE8", background: "#FAFAF9" }}>
            {["Event", "Date", "Time", "Location", "Type", "Actions"].map(h => (
              <p key={h} style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.07em", textTransform: "uppercase" }}>{h}</p>
            ))}
          </div>

          {adding && (
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #F0EDE8", background: "rgba(201,168,76,0.04)" }}>
              <EventFormRow f={form} set={setF} onSubmit={handleAdd} onCancel={() => { setAdding(false); setForm({ ...emptyEvent }); }} submitLabel="Add" />
            </div>
          )}

          {events.map((e, i) => {
            const cfg = typeConfig[e.type as EventType];
            const isEditing = editingId === e.id;
            const isDeleting = deletingId === e.id;

            if (isEditing) {
              return (
                <div key={e.id} style={{ padding: "14px 20px", borderBottom: i < events.length - 1 ? "1px solid #F0EDE8" : "none", background: "rgba(201,168,76,0.04)" }}>
                  <EventFormRow f={editForm} set={setEF} onSubmit={handleSaveEdit} onCancel={() => setEditingId(null)} submitLabel="Save" />
                </div>
              );
            }

            return (
              <div key={e.id} className="ta-adm-row" style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 0.9fr 1.5fr 1fr 100px", padding: "12px 20px", alignItems: "center", borderBottom: i < events.length - 1 ? "1px solid #F0EDE8" : "none" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#0A0A0A" }}>{e.title}</p>
                <p style={{ fontSize: 13, color: "#374151" }}>{e.date}</p>
                <p style={{ fontSize: 13, color: "#374151" }}>{e.time}</p>
                <p style={{ fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.location}</p>
                <span className="ta-adm-badge" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button className="ta-adm-icon-btn" onClick={() => startEdit(e as CalEvent)} title="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  {isDeleting ? (
                    <div style={{ display: "flex", gap: 5 }}>
                      <button onClick={() => { setCalendarEvents(events.filter(x => x.id !== e.id)); setDeletingId(null); }} style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", background: "rgba(220,38,38,0.08)", border: "none", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>Del</button>
                      <button onClick={() => setDeletingId(null)} style={{ fontSize: 11, color: "#6B7280", background: "#F3F4F6", border: "none", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>No</button>
                    </div>
                  ) : (
                    <button className="ta-adm-icon-btn danger" onClick={() => setDeletingId(e.id)} title="Delete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {events.length === 0 && !adding && (
            <div style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>
              <p style={{ fontSize: 14, fontWeight: 600 }}>No events yet. Add your first one above.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
