"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { TeamAthleteRow } from "@/lib/teamData";

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberRow = {
  id: string;
  name: string;
  role: string;
  athlete_id: string | null;
};

type FundraisingContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  relationship: string | null;
  relationship_other: string | null;
  notes: string | null;
  added_by_type: string;
  created_at: string;
};

type OutreachRow = {
  id: string;
  status: "contacted" | "needs_follow_up" | "resolved";
  note: string | null;
  contacted_by: string | null;
  created_at: string;
};

// ── Style tokens ──────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "1.1rem",
  boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
  marginBottom: ".75rem",
};

const sectionTitle: React.CSSProperties = {
  fontSize: ".62rem",
  fontWeight: 700,
  color: "#9ca3af",
  textTransform: "uppercase" as const,
  letterSpacing: ".08em",
  marginBottom: ".6rem",
};

const inp: React.CSSProperties = {
  padding: ".45rem .65rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 8,
  fontSize: ".82rem",
  width: "100%",
  boxSizing: "border-box" as const,
  color: "#111827",
  background: "#fff",
};

const lbl: React.CSSProperties = {
  display: "flex",
  flexDirection: "column" as const,
  gap: ".25rem",
  fontSize: ".68rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase" as const,
  letterSpacing: ".05em",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function avatarBg(name: string) {
  const palette = ["#0b2044", "#92400e", "#1e3a8a", "#5b21b6", "#065f46", "#9f1239"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

function relLabel(c: FundraisingContact) {
  if (!c.relationship) return null;
  if (c.relationship === "Other" && c.relationship_other) return `Other: ${c.relationship_other}`;
  return c.relationship;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ALLOWED_RELATIONSHIPS = ["Family","Friend","Coworker","Neighbor","Coach","Teacher","Business","Other"];

const OUTREACH_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  contacted:       { label: "Contacted",   bg: "#dbeafe", color: "#1e40af" },
  needs_follow_up: { label: "Follow Up",   bg: "#fef3c7", color: "#92400e" },
  resolved:        { label: "Resolved",    bg: "#d1fae5", color: "#065f46" },
};

// ── Contact form modal ────────────────────────────────────────────────────────

type ContactForm = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  relationship: string;
  relationship_other: string;
  notes: string;
};

const BLANK_CONTACT: ContactForm = {
  first_name: "", last_name: "", phone: "", email: "",
  relationship: "", relationship_other: "", notes: "",
};

function fromContact(c: FundraisingContact): ContactForm {
  return {
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    relationship: c.relationship ?? "",
    relationship_other: c.relationship_other ?? "",
    notes: c.notes ?? "",
  };
}

function ContactModal({
  slug,
  athleteId,
  editing,
  onClose,
  onSaved,
}: {
  slug: string;
  athleteId: string;
  editing: FundraisingContact | null;
  onClose: () => void;
  onSaved: (c: FundraisingContact, wasEdit: boolean) => void;
}) {
  const [form, setForm] = useState<ContactForm>(editing ? fromContact(editing) : BLANK_CONTACT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => phoneRef.current?.focus(), 50);
  }, []);

  const handleSave = async () => {
    if (!form.phone.trim() && !form.email.trim()) {
      setError("At least one of phone or email is required.");
      return;
    }
    setSaving(true);
    setError("");

    const body = {
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      relationship: form.relationship || null,
      relationship_other: form.relationship === "Other" ? (form.relationship_other.trim() || null) : null,
      notes: form.notes.trim() || null,
      added_by_type: "coach",
    };

    const isEdit = editing !== null;
    const url = isEdit
      ? `/api/team/${slug}/contacts/${editing.id}`
      : `/api/team/${slug}/contacts/coach/athlete/${athleteId}`;

    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? "Failed to save contact.");
      return;
    }
    const saved: FundraisingContact = await res.json();
    onSaved(saved, isEdit);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,.45)", display: "flex",
        alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: "18px 18px 0 0",
        padding: "1.25rem 1.1rem 2rem", width: "100%", maxWidth: 480,
        boxShadow: "0 -4px 32px rgba(0,0,0,.12)",
        maxHeight: "88vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: "1rem" }}>
          <span style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d" }}>
            {editing ? "Edit Contact" : "Add Contact"}
          </span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: "1.3rem", color: "#9ca3af", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".6rem" }}>
            <label style={lbl}>
              First Name
              <input style={inp} value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="Optional" />
            </label>
            <label style={lbl}>
              Last Name
              <input style={inp} value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Optional" />
            </label>
          </div>
          <label style={lbl}>
            Phone
            <input ref={phoneRef} type="tel" style={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number" />
          </label>
          <label style={lbl}>
            Email
            <input type="email" style={inp} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address" />
          </label>
          <label style={lbl}>
            Relationship
            <select style={inp} value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value, relationship_other: "" }))}>
              <option value="">Select…</option>
              {ALLOWED_RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          {form.relationship === "Other" && (
            <label style={lbl}>
              Describe relationship
              <input style={inp} value={form.relationship_other} onChange={e => setForm(f => ({ ...f, relationship_other: e.target.value }))} placeholder="e.g. Personal trainer" />
            </label>
          )}
          <label style={lbl}>
            Notes
            <textarea
              style={{ ...inp, minHeight: 60, resize: "vertical" as const, fontFamily: "inherit" }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes…"
            />
          </label>
        </div>

        {error && (
          <p style={{ margin: ".6rem 0 0", padding: ".4rem .6rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".8rem" }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button onClick={onClose} style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: ".84rem", fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: ".5rem 1.1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".84rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Contacts section ──────────────────────────────────────────────────────────

function ContactsSection({
  slug,
  athleteId,
  primaryColor,
}: {
  slug: string;
  athleteId: string;
  primaryColor: string;
}) {
  const [contacts, setContacts] = useState<FundraisingContact[]>([]);
  const [goal, setGoal] = useState(10);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FundraisingContact | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [contactsRes, goalRes] = await Promise.all([
      fetch(`/api/team/${slug}/contacts/coach/athlete/${athleteId}`),
      fetch(`/api/team/${slug}/contacts/coach/summary`),
    ]);
    if (contactsRes.ok) {
      const d = await contactsRes.json();
      setContacts(d.contacts ?? []);
    }
    if (goalRes.ok) {
      const d = await goalRes.json();
      const athleteSummary = (d.athletes ?? []).find((a: { athlete_id: string; goal: number }) => a.athlete_id === athleteId);
      if (athleteSummary) setGoal(athleteSummary.goal);
    }
    setLoading(false);
  }, [slug, athleteId]);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (saved: FundraisingContact, wasEdit: boolean) => {
    if (wasEdit) {
      setContacts(prev => prev.map(c => c.id === saved.id ? saved : c));
    } else {
      setContacts(prev => [saved, ...prev]);
    }
    setShowModal(false);
    setEditing(null);
  };

  const handleDelete = async (contactId: string) => {
    if (!confirm("Delete this contact?")) return;
    const res = await fetch(`/api/team/${slug}/contacts/${contactId}`, { method: "DELETE" });
    if (res.ok) setContacts(prev => prev.filter(c => c.id !== contactId));
  };

  const count = contacts.length;
  const pct = goal > 0 ? Math.min(100, Math.round((count / goal) * 100)) : 0;
  const status = count === 0 ? "Not Started" : count >= goal ? "Goal Met" : "In Progress";
  const statusColor = status === "Goal Met" ? "#16a34a" : status === "In Progress" ? "#92400e" : "#6b7280";
  const statusBg = status === "Goal Met" ? "#dcfce7" : status === "In Progress" ? "#fef3c7" : "#f3f4f6";

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".75rem" }}>
        <span style={sectionTitle}>Fundraising Contacts</span>
        <span style={{ marginLeft: "auto", background: statusBg, color: statusColor, borderRadius: 100, fontSize: ".6rem", fontWeight: 700, padding: ".12rem .45rem" }}>
          {status}
        </span>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: ".9rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", fontWeight: 700, color: "#374151", marginBottom: ".35rem" }}>
          <span>{count} contact{count !== 1 ? "s" : ""}</span>
          <span style={{ color: "#9ca3af", fontWeight: 500 }}>Goal: {goal}</span>
        </div>
        <div style={{ height: 6, background: "#f3f4f6", borderRadius: 100, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: primaryColor, borderRadius: 100, transition: "width .4s ease" }} />
        </div>
        <div style={{ fontSize: ".65rem", color: primaryColor, fontWeight: 700, marginTop: ".2rem" }}>{pct}%</div>
      </div>

      {/* Contact list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: ".75rem", fontSize: ".8rem", color: "#9ca3af" }}>Loading…</div>
      ) : contacts.length === 0 ? (
        <div style={{ textAlign: "center", padding: ".75rem", fontSize: ".8rem", color: "#9ca3af" }}>No contacts yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".45rem", marginBottom: ".75rem" }}>
          {contacts.map(c => (
            <div key={c.id} style={{ background: "#f8f9fb", borderRadius: 10, padding: ".6rem .75rem", display: "flex", alignItems: "flex-start", gap: ".5rem" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: ".82rem", color: "#111827" }}>
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                </div>
                {c.phone && <div style={{ fontSize: ".72rem", color: "#6b7280" }}>{c.phone}</div>}
                {c.email && <div style={{ fontSize: ".72rem", color: "#6b7280" }}>{c.email}</div>}
                {relLabel(c) && (
                  <span style={{ display: "inline-block", marginTop: ".2rem", background: "#e0e7ff", color: "#3730a3", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".08rem .38rem" }}>
                    {relLabel(c)}
                  </span>
                )}
                {c.notes && <div style={{ fontSize: ".68rem", color: "#9ca3af", marginTop: ".2rem" }}>{c.notes}</div>}
                <div style={{ fontSize: ".6rem", color: "#d1d5db", marginTop: ".2rem" }}>
                  Added by {c.added_by_type} · {fmtDate(c.created_at)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: ".15rem", flexShrink: 0 }}>
                <button
                  onClick={() => { setEditing(c); setShowModal(true); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".65rem", fontWeight: 600, color: "#b0b7c3", padding: ".1rem .3rem", borderRadius: 5 }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".65rem", fontWeight: 600, color: "#fca5a5", padding: ".1rem .3rem", borderRadius: 5 }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => { setEditing(null); setShowModal(true); }}
        style={{ width: "100%", padding: ".5rem", background: "#f0f4ff", color: "#1d4ed8", border: "1.5px dashed #93c5fd", borderRadius: 9, fontSize: ".82rem", fontWeight: 600, cursor: "pointer" }}
      >
        + Add Contact
      </button>

      {showModal && (
        <ContactModal
          slug={slug}
          athleteId={athleteId}
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ── Outreach section ──────────────────────────────────────────────────────────

function OutreachSection({ slug, athleteId }: { slug: string; athleteId: string }) {
  const [history, setHistory] = useState<OutreachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"contacted" | "needs_follow_up" | "resolved">("contacted");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/team/${slug}/outreach/${athleteId}`);
    if (res.ok) {
      const d = await res.json();
      setHistory(Array.isArray(d) ? d : []);
    }
    setLoading(false);
  }, [slug, athleteId]);

  useEffect(() => { load(); }, [load]);

  const handlePost = async () => {
    setPosting(true);
    const res = await fetch(`/api/team/${slug}/outreach/${athleteId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: note.trim() || null }),
    });
    if (res.ok) {
      const row: OutreachRow = await res.json();
      setHistory(prev => [row, ...prev]);
      setNote("");
      setStatus("contacted");
    }
    setPosting(false);
  };

  return (
    <div style={card}>
      <div style={sectionTitle}>Outreach History</div>

      {/* Add note */}
      <div style={{ marginBottom: ".75rem", display: "flex", flexDirection: "column", gap: ".45rem" }}>
        <select
          value={status}
          onChange={e => setStatus(e.target.value as "contacted" | "needs_follow_up" | "resolved")}
          style={{ ...inp, fontSize: ".78rem" }}
        >
          <option value="contacted">Contacted</option>
          <option value="needs_follow_up">Needs Follow-Up</option>
          <option value="resolved">Resolved</option>
        </select>
        <textarea
          style={{ ...inp, minHeight: 52, resize: "vertical" as const, fontFamily: "inherit", fontSize: ".78rem" }}
          placeholder="Optional note…"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <button
          onClick={handlePost}
          disabled={posting}
          style={{ alignSelf: "flex-end", padding: ".4rem .9rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".8rem", fontWeight: 600, cursor: posting ? "not-allowed" : "pointer", opacity: posting ? .7 : 1 }}
        >
          {posting ? "Saving…" : "Log Outreach"}
        </button>
      </div>

      {/* History */}
      {loading ? (
        <div style={{ fontSize: ".78rem", color: "#9ca3af", textAlign: "center", padding: ".5rem" }}>Loading…</div>
      ) : history.length === 0 ? (
        <div style={{ fontSize: ".78rem", color: "#9ca3af", textAlign: "center", padding: ".5rem" }}>No outreach logged yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
          {history.map(h => {
            const cfg = OUTREACH_CONFIG[h.status] ?? OUTREACH_CONFIG.contacted;
            return (
              <div key={h.id} style={{ display: "flex", gap: ".5rem", alignItems: "flex-start" }}>
                <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".1rem .4rem", flexShrink: 0, marginTop: ".15rem" }}>
                  {cfg.label}
                </span>
                <div style={{ flex: 1 }}>
                  {h.note && <div style={{ fontSize: ".78rem", color: "#374151" }}>{h.note}</div>}
                  <div style={{ fontSize: ".62rem", color: "#9ca3af" }}>
                    {h.contacted_by && `${h.contacted_by} · `}{fmtDate(h.created_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CoachAthleteView({
  slug,
  athlete,
  members,
  raisedCents,
  goalCents,
  donorCount,
  rank,
  totalAthletes,
  primaryColor,
  canDelete,
}: {
  slug: string;
  athlete: TeamAthleteRow;
  members: MemberRow[];
  raisedCents: number;
  goalCents: number;
  donorCount: number;
  rank: number;
  totalAthletes: number;
  primaryColor: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const pct = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;
  const bg = avatarBg(athlete.name);

  const athleteMember = members.find(m => m.role === "athlete");
  const parentMembers = members.filter(m => m.role === "parent");

  return (
    <div style={{ paddingBottom: "2rem", animation: "elf-fadeUp .22s ease both" }}>
      {/* ── Back nav ── */}
      <button
        onClick={() => router.push(`/team/${slug}/team`)}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".8rem", fontWeight: 600, color: "#6b7280", padding: "0 0 .75rem", display: "flex", alignItems: "center", gap: ".3rem" }}
      >
        ← Team
      </button>

      {/* ── Athlete header card ── */}
      <div style={{ ...card, borderTop: `4px solid ${primaryColor}`, padding: "1.25rem 1.1rem" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
          {/* Avatar */}
          <div style={{ flexShrink: 0 }}>
            {athlete.profile_photo ? (
              <img src={athlete.profile_photo} alt={athlete.name} style={{ width: 62, height: 62, borderRadius: "50%", objectFit: "cover", boxShadow: "0 2px 8px rgba(0,0,0,.12)" }} />
            ) : (
              <div style={{ width: 62, height: 62, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.1rem", color: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>
                {initials(athlete.name)}
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#0b1e3d", lineHeight: 1.2 }}>{athlete.name}</div>
            {/* Class is the primary attribute; Event/Position is secondary */}
            {(athlete.class_year || athlete.event) && (
              <span style={{ display: "inline-block", marginTop: ".25rem", background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", padding: ".1rem .45rem" }}>
                {athlete.class_year || athlete.event}
              </span>
            )}
            <div style={{ display: "flex", gap: ".75rem", marginTop: ".4rem", flexWrap: "wrap" as const }}>
              {athlete.class_year && athlete.event && (
                <span style={{ fontSize: ".72rem", color: "#6b7280" }}>{athlete.event}</span>
              )}
              {athlete.jersey_number != null && (
                <span style={{ fontSize: ".72rem", color: "#6b7280" }}>#{athlete.jersey_number}</span>
              )}
              {athlete.grad_year != null && (
                <span style={{ fontSize: ".72rem", color: "#6b7280" }}>Class of &apos;{String(athlete.grad_year).slice(-2)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Contact details */}
        {(athlete.contact_phone || athlete.contact_email) && (
          <div style={{ marginTop: ".85rem", paddingTop: ".85rem", borderTop: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: ".3rem" }}>
            {athlete.contact_phone && (
              <a href={`tel:${athlete.contact_phone}`} style={{ fontSize: ".8rem", color: "#1d4ed8", textDecoration: "none", display: "flex", alignItems: "center", gap: ".35rem" }}>
                <span style={{ fontSize: ".85rem" }}>📞</span> {athlete.contact_phone}
              </a>
            )}
            {athlete.contact_email && (
              <a href={`mailto:${athlete.contact_email}`} style={{ fontSize: ".8rem", color: "#1d4ed8", textDecoration: "none", display: "flex", alignItems: "center", gap: ".35rem" }}>
                <span style={{ fontSize: ".85rem" }}>✉️</span> {athlete.contact_email}
              </a>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div style={{ display: "flex", gap: ".5rem", marginTop: ".9rem" }}>
          <a
            href={`/team/${slug}/communications?tab=messages`}
            style={{ flex: 1, textAlign: "center", padding: ".42rem", background: primaryColor, color: "#fff", borderRadius: 8, fontSize: ".78rem", fontWeight: 700, textDecoration: "none" }}
          >
            Messages
          </a>
          <a
            href={`/team/${slug}/athlete/${athlete.id}`}
            target="_blank"
            rel="noreferrer"
            style={{ flex: 1, textAlign: "center", padding: ".42rem", background: "#f3f4f6", color: "#374151", borderRadius: 8, fontSize: ".78rem", fontWeight: 700, textDecoration: "none" }}
          >
            Donor Page ↗
          </a>
        </div>
      </div>

      {/* ── Members section ── */}
      {members.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}>Linked Members</div>
          <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
            {athleteMember && (
              <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".6rem", fontWeight: 800, color: "#1e40af", flexShrink: 0 }}>
                  {initials(athleteMember.name)}
                </div>
                <div>
                  <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#111827" }}>{athleteMember.name}</div>
                  <div style={{ fontSize: ".64rem", color: "#9ca3af" }}>Athlete account</div>
                </div>
              </div>
            )}
            {parentMembers.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".6rem", fontWeight: 800, color: "#065f46", flexShrink: 0 }}>
                  {initials(m.name)}
                </div>
                <div>
                  <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#111827" }}>{m.name}</div>
                  <div style={{ fontSize: ".64rem", color: "#9ca3af" }}>Parent / guardian</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fundraising progress ── */}
      <div style={card}>
        <div style={sectionTitle}>Fundraising Progress</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: ".4rem", marginBottom: ".35rem" }}>
          <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d" }}>{fmt(raisedCents)}</span>
          <span style={{ fontSize: ".8rem", color: "#9ca3af" }}>of {fmt(goalCents)}</span>
        </div>
        <div style={{ height: 7, background: "#f3f4f6", borderRadius: 100, overflow: "hidden", marginBottom: ".4rem" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}cc)`, borderRadius: 100, transition: "width .4s ease" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: ".4rem" }}>
          {[
            { label: "Donors", value: String(donorCount) },
            { label: "Funded", value: `${pct}%` },
            { label: `Rank`, value: `#${rank} of ${totalAthletes}` },
          ].map((s, i) => (
            <div key={i} style={{ background: "#f8f9fb", borderRadius: 9, padding: ".5rem .6rem" }}>
              <div style={{ fontSize: ".95rem", fontWeight: 800, color: "#111827" }}>{s.value}</div>
              <div style={{ fontSize: ".6rem", color: "#9ca3af", marginTop: ".1rem" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Contacts section ── */}
      <ContactsSection slug={slug} athleteId={athlete.id} primaryColor={primaryColor} />

      {/* ── Outreach section ── */}
      <OutreachSection slug={slug} athleteId={athlete.id} />
    </div>
  );
}
