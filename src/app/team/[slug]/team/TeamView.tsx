"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamAthleteRow } from "@/lib/teamData";
import type { CoachSession } from "@/lib/teamSession";
import { isStaff, isHeadCoach, type TeamActor } from "@/lib/permissions";
import { ATHLETE_CLASS_OPTIONS } from "@/lib/supabase";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";

// This page is intentionally athlete-focused for now. Future phases will
// expand "Team" to include coaches, assistant coaches, managers, volunteers,
// booster reps, and parents (view-only) — the section-header + card-grid
// structure below is built so those can be added as additional sections
// without restructuring what's here.

// ── Style tokens ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 9,
  // 16px minimum — iOS WebKit auto-zooms the viewport when focusing a form
  // control smaller than this (Phase 8).
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
  color: "#111827",
  background: "#fff",
};

const lbl: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".72rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function avatarColor(name: string): string {
  const palette = ["#0b2044", "#92400e", "#1e3a8a", "#5b21b6", "#065f46", "#9f1239", "#1e4d7b", "#78350f"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[hash % palette.length];
}

// ── Form type ─────────────────────────────────────────────────────────────────

type AthForm = {
  name: string;
  event: string;
  class_year: string;
  jersey_number: string;
  grad_year: string;
  goal_cents: string;   // stored as dollars in UI
  profile_photo: string;
  contact_phone: string;
  contact_email: string;
};

const BLANK: AthForm = {
  name: "", event: "", class_year: "", jersey_number: "", grad_year: "", goal_cents: "", profile_photo: "",
  contact_phone: "", contact_email: "",
};

function fromRow(a: TeamAthleteRow): AthForm {
  return {
    name:          a.name,
    event:         a.event ?? "",
    class_year:    a.class_year ?? "",
    jersey_number: a.jersey_number != null ? String(a.jersey_number) : "",
    grad_year:     a.grad_year     != null ? String(a.grad_year)     : "",
    goal_cents:    a.goal_cents    != null ? String(a.goal_cents / 100) : "",
    profile_photo: a.profile_photo ?? "",
    contact_phone: a.contact_phone ?? "",
    contact_email: a.contact_email ?? "",
  };
}

// ── Athlete card ──────────────────────────────────────────────────────────────

function AthleteCard({
  a,
  slug,
  staffMode,
  canDelete,
  onEdit,
  onDelete,
}: {
  a: TeamAthleteRow;
  slug: string;
  staffMode: boolean;
  canDelete: boolean;
  onEdit: (a: TeamAthleteRow) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const router  = useRouter();
  const bg      = avatarColor(a.name);

  return (
    <div
      onClick={staffMode ? () => router.push(`/team/${slug}/team/${a.id}`) : undefined}
      onMouseEnter={staffMode ? () => setHovered(true) : undefined}
      onMouseLeave={staffMode ? () => setHovered(false) : undefined}
      style={{
        background: "#fff",
        borderRadius: 14,
        padding: ".9rem .8rem .75rem",
        boxShadow: (staffMode && hovered)
          ? "0 6px 20px rgba(0,0,0,.10), 0 0 0 1px rgba(0,0,0,.05)"
          : "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderTop: "3px solid #0b1e3d",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        position: "relative",
        transform: (staffMode && hovered) ? "translateY(-2px)" : "none",
        transition: "transform .15s ease, box-shadow .15s ease",
        cursor: staffMode ? "pointer" : "default",
      }}
    >
      {a.jersey_number != null && (
        <span style={{
          position: "absolute", top: ".55rem", right: ".6rem",
          background: "#0b1e3d", color: "#fff", borderRadius: 6,
          fontSize: ".55rem", fontWeight: 800, padding: ".1rem .34rem",
          lineHeight: 1.4, letterSpacing: ".03em",
        }}>
          #{a.jersey_number}
        </span>
      )}

      <div style={{ marginBottom: ".5rem" }}>
        {a.profile_photo ? (
          <img
            src={a.profile_photo}
            alt={a.name}
            style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", display: "block", boxShadow: "0 2px 8px rgba(0,0,0,.12)" }}
          />
        ) : (
          <div style={{
            width: 54, height: 54, borderRadius: "50%", background: bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: "1rem", color: "#fff", letterSpacing: ".02em",
            boxShadow: "0 2px 8px rgba(0,0,0,.15)",
          }}>
            {initials(a.name)}
          </div>
        )}
      </div>

      <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#0b1e3d", lineHeight: 1.2, marginBottom: ".28rem" }}>
        {a.name}
      </div>

      {/* Class is the primary attribute shown; Event/Position is secondary */}
      {(a.class_year || a.event) && (
        <span style={{
          display: "inline-block", padding: ".07rem .42rem", borderRadius: 100,
          fontSize: ".55rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: ".04em", background: "#f0f4ff", color: "#1d4ed8",
          marginBottom: ".2rem",
        }}>
          {a.class_year || a.event}
        </span>
      )}
      {a.class_year && a.event && (
        <div style={{ fontSize: ".6rem", color: "#9ca3af" }}>{a.event}</div>
      )}

      {a.grad_year != null && (
        <div style={{ fontSize: ".63rem", color: "#9ca3af" }}>
          Class of &apos;{String(a.grad_year).slice(-2)}
        </div>
      )}

      {staffMode && (
        <div style={{ display: "flex", gap: ".1rem", justifyContent: "center", marginTop: ".45rem" }}>
          <button
            onClick={e => { e.stopPropagation(); onEdit(a); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#b0b7c3", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
          >
            Edit
          </button>
          {canDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(a.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#fca5a5", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TeamView({
  slug,
  initialAthletes,
  actor,
  pendingRequestCount = 0,
}: {
  slug: string;
  initialAthletes: TeamAthleteRow[];
  actor: TeamActor;
  // Phase 3B-1: the Requests Center (/team/[slug]/requests) is now the
  // canonical place to review/approve pending athlete requests — this is
  // only a small contextual pointer, not the approval workflow itself
  // (moved there in full, not duplicated).
  pendingRequestCount?: number;
}) {
  const staffMode = isStaff(actor);
  const canDelete = isHeadCoach(actor);
  const [athletes,       setAthletes]       = useState<TeamAthleteRow[]>(initialAthletes);
  const [form,           setForm]           = useState<AthForm>(BLANK);
  const [editing,        setEditing]        = useState<TeamAthleteRow | null>(null);
  const [showAdd,        setShowAdd]        = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState("");
  const [photoPreview,   setPhotoPreview]   = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError,     setPhotoError]     = useState("");

  const resetPhoto = () => { setPhotoPreview(""); setPhotoError(""); setPhotoUploading(false); };

  const openAdd = () => {
    setForm(BLANK); setError(""); resetPhoto(); setShowAdd(true);
  };

  const openEdit = (a: TeamAthleteRow) => {
    setForm(fromRow(a)); setError("");
    setPhotoPreview(a.profile_photo ?? ""); setPhotoError(""); setPhotoUploading(false);
    setEditing(a);
  };

  const closeModal = () => { setShowAdd(false); setEditing(null); setError(""); resetPhoto(); };

  const handlePhotoUpload = async (file: File) => {
    setPhotoUploading(true);
    setPhotoError("");
    const localPreview = URL.createObjectURL(file);
    setPhotoPreview(localPreview);

    const fd = new FormData();
    fd.append("photo", file);
    const res = await fetch(`/api/team/${slug}/roster/photo`, { method: "POST", body: fd });
    const data = await res.json();

    URL.revokeObjectURL(localPreview);
    setPhotoUploading(false);

    if (!res.ok) {
      setPhotoError(data.error ?? "Upload failed");
      setPhotoPreview(form.profile_photo);
      return;
    }

    setPhotoPreview(data.url);
    setForm(f => ({ ...f, profile_photo: data.url }));
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.class_year.trim()) { setError("Name and class are required."); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/team/${slug}/roster`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:          form.name.trim(),
        event:         form.event.trim(),
        class_year:    form.class_year || null,
        jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
        grad_year:     form.grad_year     ? parseInt(form.grad_year)     : null,
        goal_cents:    form.goal_cents    ? Math.round(parseFloat(form.goal_cents) * 100) : null,
        profile_photo: form.profile_photo || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to add athlete."); return; }
    setAthletes(prev => [...prev, data]);
    closeModal();
  };

  const handleEdit = async () => {
    if (!editing || !form.name.trim() || !form.class_year.trim()) { setError("Name and class are required."); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/team/${slug}/roster/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:          form.name.trim(),
        event:         form.event.trim(),
        class_year:    form.class_year || null,
        jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
        grad_year:     form.grad_year     ? parseInt(form.grad_year)     : null,
        goal_cents:    form.goal_cents    ? Math.round(parseFloat(form.goal_cents) * 100) : null,
        profile_photo: form.profile_photo || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to update athlete."); return; }
    setAthletes(prev => prev.map(a =>
      a.id === editing.id
        ? {
            ...a,
            name:          form.name.trim(),
            event:         form.event.trim(),
            class_year:    form.class_year || null,
            jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
            grad_year:     form.grad_year     ? parseInt(form.grad_year)     : null,
            goal_cents:    form.goal_cents    ? Math.round(parseFloat(form.goal_cents) * 100) : null,
            profile_photo: form.profile_photo || null,
            contact_phone: form.contact_phone.trim() || null,
            contact_email: form.contact_email.trim() || null,
          }
        : a
    ));
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this athlete from the team?")) return;
    const res = await fetch(`/api/team/${slug}/roster/${id}`, { method: "DELETE" });
    if (res.ok) setAthletes(prev => prev.filter(a => a.id !== id));
  };

  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* Phase 3B-1: full approve/decline workflow moved to the Requests
          Center — this is a small contextual pointer only, shown to the
          Head Coach (canDelete === isHeadCoach(actor)) exactly when there's
          something to review, not a duplicate of the approval UI. */}
      {canDelete && pendingRequestCount > 0 && (
        <a
          href={`/team/${slug}/requests`}
          style={{
            display: "flex", alignItems: "center", gap: ".5rem",
            background: "#fff", borderRadius: 12, padding: ".7rem .9rem",
            marginBottom: "1rem", textDecoration: "none",
            boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
            borderLeft: "3px solid #dc2626",
          }}
        >
          <span style={{
            background: "#fee2e2", color: "#b91c1c", borderRadius: 100,
            fontSize: ".68rem", fontWeight: 700, padding: ".15rem .5rem", flexShrink: 0,
          }}>
            {pendingRequestCount}
          </span>
          <span style={{ flex: 1, fontSize: ".82rem", fontWeight: 700, color: "#0b1e3d" }}>
            Pending athlete request{pendingRequestCount !== 1 ? "s" : ""} — review in Requests
          </span>
          <span style={{ fontSize: ".85rem", color: "#c1c7d0" }}>→</span>
        </a>
      )}

      {/* ── Section header ── */}
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Team Hub
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team
          </h2>
          {athletes.length > 0 && (
            <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {athletes.length} athlete{athletes.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar show={staffMode} label="Add Athlete" onAdd={openAdd} />
        </div>
      </div>

      {/* ── Grid ── */}
      {athletes.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "3rem 1.5rem",
          textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2.25rem", marginBottom: ".75rem", opacity: .3 }}>👥</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            Team is empty
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            {staffMode ? "Add your first athlete above." : "Team roster coming soon."}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: ".65rem" }}>
          {athletes.map(a => (
            <AthleteCard
              key={a.id}
              a={a}
              slug={slug}
              staffMode={staffMode}
              canDelete={canDelete}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {modalOpen && (
        <Modal title={isEditing ? "Edit Athlete" : "Add Athlete"} onClose={closeModal}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
              <label style={{ ...lbl, gridColumn: "1 / -1" }}>
                Name *
                <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Athlete name" autoFocus />
              </label>
              <label style={{ ...lbl, gridColumn: "1 / -1" }}>
                Class *
                <select style={inp} value={form.class_year} onChange={e => setForm(f => ({ ...f, class_year: e.target.value }))}>
                  <option value="">Select class…</option>
                  {ATHLETE_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label style={{ ...lbl, gridColumn: "1 / -1" }}>
                Event / Position
                <input style={inp} value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} placeholder="e.g. Sprints, Distance, Jumps" />
              </label>
              <label style={lbl}>
                Jersey #
                <input type="number" style={inp} value={form.jersey_number} onChange={e => setForm(f => ({ ...f, jersey_number: e.target.value }))} placeholder="Optional" />
              </label>
              <label style={lbl}>
                Grad Year
                <input type="number" style={inp} value={form.grad_year} onChange={e => setForm(f => ({ ...f, grad_year: e.target.value }))} placeholder="e.g. 2027" />
              </label>
              <label style={{ ...lbl, gridColumn: "1 / -1" }}>
                Fundraising Goal
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: ".75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: ".875rem", pointerEvents: "none" }}>$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    style={{ ...inp, paddingLeft: "1.5rem" }}
                    value={form.goal_cents}
                    onChange={e => setForm(f => ({ ...f, goal_cents: e.target.value }))}
                    placeholder="500"
                  />
                </div>
              </label>
              <label style={lbl}>
                Contact Phone
                <input
                  type="tel"
                  style={inp}
                  value={form.contact_phone}
                  onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label style={lbl}>
                Contact Email
                <input
                  type="email"
                  style={inp}
                  value={form.contact_email}
                  onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
            </div>

            {/* ── Photo upload ── */}
            <div style={lbl}>
              Photo
              <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginTop: ".1rem" }}>
                {(photoPreview || form.profile_photo) && (
                  <img
                    src={photoPreview || form.profile_photo}
                    alt="Preview"
                    style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", flexShrink: 0, boxShadow: "0 2px 6px rgba(0,0,0,.12)" }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: "inline-block", padding: ".4rem .85rem",
                    background: photoUploading ? "#f9fafb" : "#f3f4f6",
                    border: "1.5px solid #e5e7eb", borderRadius: 8,
                    fontSize: ".78rem", fontWeight: 600, color: photoUploading ? "#9ca3af" : "#374151",
                    cursor: photoUploading ? "not-allowed" : "pointer",
                  }}>
                    {photoUploading ? "Uploading…" : photoPreview || form.profile_photo ? "Change Photo" : "Choose Photo"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={photoUploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }}
                    />
                  </label>
                  <div style={{ fontSize: ".65rem", color: "#9ca3af", marginTop: ".25rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                    JPEG, PNG, HEIC · max 10MB · auto-resized
                  </div>
                </div>
              </div>
              {photoError && (
                <p style={{ margin: 0, color: "#dc2626", fontSize: ".75rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  {photoError}
                </p>
              )}
            </div>

            {error && (
              <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
              <button onClick={closeModal} style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={isEditing ? handleEdit : handleAdd} disabled={saving || photoUploading} style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: saving || photoUploading ? "not-allowed" : "pointer", opacity: saving || photoUploading ? .7 : 1 }}>
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Athlete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
