"use client";

import { useState } from "react";
import type { SponsorRow } from "@/lib/teamData";
import type { CoachSession } from "@/lib/teamSession";
import { coachSession, type TeamActor } from "@/lib/permissions";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";

// ── Tier config ───────────────────────────────────────────────────────────────

const TIER_ORDER = [
  "title", "platinum", "gold", "silver", "bronze", "community_partner",
] as const;

type Tier = typeof TIER_ORDER[number];

const TIER_META: Record<Tier, { label: string; color: string; bg: string }> = {
  title:             { label: "Title Sponsor",     color: "#4c1d95", bg: "#ede9fe" },
  platinum:          { label: "Platinum",          color: "#0c4a6e", bg: "#e0f2fe" },
  gold:              { label: "Gold",              color: "#92400e", bg: "#fef3c7" },
  silver:            { label: "Silver",            color: "#374151", bg: "#f3f4f6" },
  bronze:            { label: "Bronze",            color: "#7c2d12", bg: "#ffedd5" },
  community_partner: { label: "Community Partner", color: "#065f46", bg: "#d1fae5" },
};

// ── Style tokens ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 9,
  fontSize: ".875rem",
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

// ── Form type ─────────────────────────────────────────────────────────────────

type SponForm = {
  name: string;
  url: string;
  tier: Tier;
  description: string;
  logo_url: string;
  visible: boolean;
  sponsorship_amount: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
};

const BLANK: SponForm = {
  name: "", url: "", tier: "gold", description: "", logo_url: "",
  visible: true, sponsorship_amount: "",
  contact_name: "", contact_email: "", contact_phone: "",
};

function fromRow(s: SponsorRow): SponForm {
  return {
    name:               s.name,
    url:                s.url,
    tier:               s.tier,
    description:        s.description ?? "",
    logo_url:           s.logo_url ?? "",
    visible:            s.visible,
    sponsorship_amount: s.sponsorship_amount_cents != null
      ? String(s.sponsorship_amount_cents / 100)
      : "",
    contact_name:  s.contact_name  ?? "",
    contact_email: s.contact_email ?? "",
    contact_phone: s.contact_phone ?? "",
  };
}

// ── Tier badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: Tier }) {
  const { label, color, bg } = TIER_META[tier];
  return (
    <span style={{
      display: "inline-block",
      padding: ".1rem .45rem",
      borderRadius: 100,
      fontSize: ".58rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: ".04em",
      color,
      background: bg,
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

// ── Logo placeholder ──────────────────────────────────────────────────────────

function LogoPlaceholder({ name, size }: { name: string; size: number }) {
  const initial = name.trim()[0]?.toUpperCase() ?? "S";
  const palette = ["#0b2044", "#4c1d95", "#065f46", "#7c2d12", "#0c4a6e", "#92400e"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  const bg = palette[hash % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.38, color: "#fff", flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

// ── Coach sponsor card ────────────────────────────────────────────────────────

function CoachCard({
  s,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onMove,
}: {
  s: SponsorRow;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (s: SponsorRow) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
}) {
  const fmt = (cents: number) =>
    (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const hasContact = s.contact_name || s.contact_email || s.contact_phone;

  return (
    <div style={{
      background: "#fff",
      borderRadius: 14,
      padding: ".85rem",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      borderLeft: `3px solid ${TIER_META[s.tier].color}`,
      opacity: s.visible ? 1 : 0.6,
    }}>
      {/* Main row */}
      <div style={{ display: "flex", gap: ".75rem", alignItems: "flex-start" }}>
        {s.logo_url ? (
          <img
            src={s.logo_url}
            alt={s.name}
            style={{ width: 44, height: 44, borderRadius: 8, objectFit: "contain", flexShrink: 0, background: "#f9fafb", border: "1px solid #e5e7eb" }}
          />
        ) : (
          <LogoPlaceholder name={s.name} size={44} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap", marginBottom: ".2rem" }}>
            <span style={{ fontWeight: 700, fontSize: ".88rem", color: "#0b1e3d" }}>{s.name}</span>
            <TierBadge tier={s.tier} />
            {!s.visible && (
              <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#9ca3af", background: "#f3f4f6", padding: ".1rem .35rem", borderRadius: 100, textTransform: "uppercase", letterSpacing: ".04em" }}>
                Hidden
              </span>
            )}
          </div>

          {s.description && (
            <div style={{ fontSize: ".75rem", color: "#6b7280", marginBottom: ".2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.description}
            </div>
          )}

          <div style={{ fontSize: ".72rem", color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.url.replace(/^https?:\/\//, "")}
          </div>

          {s.sponsorship_amount_cents != null && (
            <div style={{ fontSize: ".72rem", color: "#065f46", fontWeight: 600, marginTop: ".18rem" }}>
              {fmt(s.sponsorship_amount_cents)}
            </div>
          )}

          {hasContact && (
            <div style={{ fontSize: ".7rem", color: "#6b7280", marginTop: ".18rem" }}>
              {[s.contact_name, s.contact_email, s.contact_phone].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: "flex", alignItems: "center", gap: ".25rem", marginTop: ".65rem", paddingTop: ".55rem", borderTop: "1px solid #f3f4f6" }}>
        <button
          disabled={isFirst}
          onClick={() => onMove(s.id, "up")}
          style={{ background: "none", border: "none", cursor: isFirst ? "default" : "pointer", fontSize: ".75rem", color: isFirst ? "#d1d5db" : "#9ca3af", padding: ".2rem .3rem", borderRadius: 5 }}
        >↑</button>
        <button
          disabled={isLast}
          onClick={() => onMove(s.id, "down")}
          style={{ background: "none", border: "none", cursor: isLast ? "default" : "pointer", fontSize: ".75rem", color: isLast ? "#d1d5db" : "#9ca3af", padding: ".2rem .3rem", borderRadius: 5 }}
        >↓</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => onEdit(s)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", fontWeight: 600, color: "#6b7280", padding: ".2rem .5rem", borderRadius: 6 }}
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(s.id)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", fontWeight: 600, color: "#fca5a5", padding: ".2rem .5rem", borderRadius: 6 }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ── Public sponsor card ───────────────────────────────────────────────────────

function PublicCard({ s }: { s: SponsorRow }) {
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        gap: ".75rem",
        alignItems: "center",
        background: "#fff",
        borderRadius: 14,
        padding: ".85rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        textDecoration: "none",
        borderLeft: `3px solid ${TIER_META[s.tier].color}`,
      }}
    >
      {s.logo_url ? (
        <img
          src={s.logo_url}
          alt={s.name}
          style={{ width: 44, height: 44, borderRadius: 8, objectFit: "contain", flexShrink: 0, background: "#f9fafb", border: "1px solid #e5e7eb" }}
        />
      ) : (
        <LogoPlaceholder name={s.name} size={44} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap", marginBottom: ".15rem" }}>
          <span style={{ fontWeight: 700, fontSize: ".88rem", color: "#0b1e3d" }}>{s.name}</span>
          <TierBadge tier={s.tier} />
        </div>
        {s.description && (
          <div style={{ fontSize: ".75rem", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.description}
          </div>
        )}
      </div>

      <span style={{ fontSize: ".72rem", color: "#9ca3af", flexShrink: 0 }}>↗</span>
    </a>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SponsorsView({
  slug,
  initialSponsors,
  actor,
}: {
  slug: string;
  initialSponsors: SponsorRow[];
  actor: TeamActor;
}) {
  const coach = coachSession(actor);
  const [sponsors,       setSponsors]       = useState<SponsorRow[]>(initialSponsors);
  const [form,           setForm]           = useState<SponForm>(BLANK);
  const [editing,        setEditing]        = useState<SponsorRow | null>(null);
  const [showAdd,        setShowAdd]        = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState("");
  const [logoPreview,    setLogoPreview]    = useState("");
  const [logoUploading,  setLogoUploading]  = useState(false);
  const [logoError,      setLogoError]      = useState("");

  const resetLogo = () => { setLogoPreview(""); setLogoError(""); setLogoUploading(false); };

  const openAdd = () => {
    const maxOrder = sponsors.reduce((m, s) => Math.max(m, s.display_order), -1);
    setForm({ ...BLANK });
    setError(""); resetLogo(); setShowAdd(true);
    // store maxOrder for use in handleAdd
    void maxOrder;
  };

  const openEdit = (s: SponsorRow) => {
    setForm(fromRow(s));
    setLogoPreview(s.logo_url ?? "");
    setLogoError(""); setLogoUploading(false);
    setEditing(s); setError("");
  };

  const closeModal = () => {
    setShowAdd(false); setEditing(null); setError(""); resetLogo();
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true); setLogoError("");
    const local = URL.createObjectURL(file);
    setLogoPreview(local);
    const fd = new FormData();
    fd.append("logo", file);
    const res = await fetch(`/api/team/${slug}/sponsors/logo`, { method: "POST", body: fd });
    const data = await res.json();
    URL.revokeObjectURL(local);
    setLogoUploading(false);
    if (!res.ok) {
      setLogoError(data.error ?? "Upload failed");
      setLogoPreview(form.logo_url);
      return;
    }
    setLogoPreview(data.url);
    setForm(f => ({ ...f, logo_url: data.url }));
  };

  const buildBody = (f: SponForm, displayOrder: number) => ({
    name:    f.name.trim(),
    url:     f.url.trim(),
    tier:    f.tier,
    description:            f.description.trim()  || null,
    logo_url:               f.logo_url.trim()      || null,
    visible:                f.visible,
    display_order:          displayOrder,
    sponsorship_amount_cents: f.sponsorship_amount
      ? Math.round(parseFloat(f.sponsorship_amount) * 100)
      : null,
    contact_name:  f.contact_name.trim()  || null,
    contact_email: f.contact_email.trim() || null,
    contact_phone: f.contact_phone.trim() || null,
  });

  const handleAdd = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setError("Name and URL are required."); return;
    }
    setSaving(true); setError("");
    const maxOrder = sponsors.reduce((m, s) => Math.max(m, s.display_order), -1);
    const res = await fetch(`/api/team/${slug}/sponsors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(form, maxOrder + 1)),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to add sponsor."); return; }
    setSponsors(prev => [...prev, data]);
    closeModal();
  };

  const handleEdit = async () => {
    if (!editing || !form.name.trim() || !form.url.trim()) {
      setError("Name and URL are required."); return;
    }
    setSaving(true); setError("");
    const res = await fetch(`/api/team/${slug}/sponsors/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(form, editing.display_order)),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to update sponsor."); return; }
    setSponsors(prev => prev.map(s =>
      s.id === editing.id
        ? { ...s, ...buildBody(form, editing.display_order), id: s.id, campaign_slug: s.campaign_slug, created_at: s.created_at }
        : s,
    ));
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this sponsor?")) return;
    const res = await fetch(`/api/team/${slug}/sponsors/${id}`, { method: "DELETE" });
    if (res.ok) setSponsors(prev => prev.filter(s => s.id !== id));
  };

  const handleMove = async (id: string, dir: "up" | "down") => {
    const idx = sponsors.findIndex(s => s.id === id);
    if (idx < 0) return;
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sponsors.length) return;

    const a = sponsors[idx];
    const b = sponsors[swapIdx];
    const newOrder = a.display_order;
    const swapOrder = b.display_order === a.display_order
      ? (dir === "up" ? a.display_order - 1 : a.display_order + 1)
      : b.display_order;

    // Optimistic update
    const next = [...sponsors];
    next[idx]     = { ...a, display_order: swapOrder };
    next[swapIdx] = { ...b, display_order: newOrder };
    next.sort((x, y) => x.display_order - y.display_order || x.created_at.localeCompare(y.created_at));
    setSponsors(next);

    await Promise.all([
      fetch(`/api/team/${slug}/sponsors/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_order: swapOrder }),
      }),
      fetch(`/api/team/${slug}/sponsors/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_order: newOrder }),
      }),
    ]);
  };

  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;

  // Public view: only visible sponsors grouped by tier
  const visibleSponsors = coach
    ? sponsors
    : sponsors.filter(s => s.visible);

  const grouped = TIER_ORDER.reduce<Record<string, SponsorRow[]>>((acc, t) => {
    const items = visibleSponsors.filter(s => s.tier === t);
    if (items.length) acc[t] = items;
    return acc;
  }, {});

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* ── Section header ── */}
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Community
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Sponsors
          </h2>
          {sponsors.length > 0 && (
            <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {visibleSponsors.length} sponsor{visibleSponsors.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar coach={coach} label="Add Sponsor" onAdd={openAdd} />
        </div>
      </div>

      {/* ── Content ── */}
      {visibleSponsors.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "3rem 1.5rem",
          textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2.25rem", marginBottom: ".75rem", opacity: .3 }}>🤝</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            No sponsors yet
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            {coach ? "Add your first sponsor above." : "Sponsors coming soon."}
          </div>
        </div>
      ) : coach ? (
        /* ── Coach management list ── */
        <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
          {sponsors.map((s, i) => (
            <CoachCard
              key={s.id}
              s={s}
              isFirst={i === 0}
              isLast={i === sponsors.length - 1}
              onEdit={openEdit}
              onDelete={handleDelete}
              onMove={handleMove}
            />
          ))}
        </div>
      ) : (
        /* ── Public grouped view ── */
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {(Object.entries(grouped) as [Tier, SponsorRow[]][]).map(([tier, items]) => (
            <div key={tier}>
              <div style={{
                fontSize: ".65rem", fontWeight: 700, color: TIER_META[tier].color,
                textTransform: "uppercase", letterSpacing: ".08em",
                marginBottom: ".45rem",
              }}>
                {TIER_META[tier].label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: ".45rem" }}>
                {items.map(s => <PublicCard key={s.id} s={s} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {modalOpen && (
        <Modal title={isEditing ? "Edit Sponsor" : "Add Sponsor"} onClose={closeModal}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>

            {/* Business name */}
            <label style={lbl}>
              Business Name *
              <input
                style={inp}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Acme Local Business"
                autoFocus
              />
            </label>

            {/* Website URL */}
            <label style={lbl}>
              Website URL *
              <input
                style={inp}
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://example.com"
              />
            </label>

            {/* Tier */}
            <div style={lbl}>
              Tier *
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: ".35rem" }}>
                {TIER_ORDER.map(t => {
                  const active = form.tier === t;
                  const { label, color, bg } = TIER_META[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, tier: t }))}
                      style={{
                        padding: ".4rem .25rem",
                        borderRadius: 8,
                        border: active ? `2px solid ${color}` : "2px solid #e5e7eb",
                        background: active ? bg : "#fff",
                        color: active ? color : "#6b7280",
                        fontSize: ".65rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        textTransform: "uppercase",
                        letterSpacing: ".03em",
                        lineHeight: 1.3,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <label style={lbl}>
              Description
              <textarea
                rows={2}
                style={{ ...inp, resize: "none", fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Supporting student athletes since 2010"
              />
            </label>

            {/* Logo upload */}
            <div style={lbl}>
              Logo
              <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginTop: ".1rem" }}>
                {(logoPreview || form.logo_url) ? (
                  <img
                    src={logoPreview || form.logo_url}
                    alt="Preview"
                    style={{ width: 52, height: 52, borderRadius: 8, objectFit: "contain", flexShrink: 0, background: "#f9fafb", border: "1px solid #e5e7eb" }}
                  />
                ) : null}
                <div style={{ flex: 1 }}>
                  <label style={{
                    display: "inline-block", padding: ".4rem .85rem",
                    background: logoUploading ? "#f9fafb" : "#f3f4f6",
                    border: "1.5px solid #e5e7eb", borderRadius: 8,
                    fontSize: ".78rem", fontWeight: 600,
                    color: logoUploading ? "#9ca3af" : "#374151",
                    cursor: logoUploading ? "not-allowed" : "pointer",
                  }}>
                    {logoUploading ? "Uploading…" : (logoPreview || form.logo_url) ? "Change Logo" : "Choose Logo"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={logoUploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }}
                    />
                  </label>
                  <div style={{ fontSize: ".65rem", color: "#9ca3af", marginTop: ".25rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                    JPEG, PNG · max 5MB · auto-resized
                  </div>
                </div>
              </div>
              {logoError && (
                <p style={{ margin: 0, color: "#dc2626", fontSize: ".75rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  {logoError}
                </p>
              )}
            </div>

            {/* Visibility */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".65rem .75rem", background: "#f9fafb", borderRadius: 10, border: "1.5px solid #e5e7eb" }}>
              <div>
                <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#111827" }}>Visible to public</div>
                <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>Show on campaign page and team app</div>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, visible: !f.visible }))}
                style={{
                  width: 44, height: 24, borderRadius: 100, border: "none",
                  background: form.visible ? "#0b1e3d" : "#e5e7eb",
                  cursor: "pointer", position: "relative", flexShrink: 0, transition: "background .15s",
                }}
              >
                <span style={{
                  position: "absolute", top: 3,
                  left: form.visible ? 23 : 3,
                  width: 18, height: 18, borderRadius: "50%", background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                  transition: "left .15s",
                }} />
              </button>
            </div>

            {/* ── Coach-only: Sponsorship & Contact ── */}
            <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: ".875rem" }}>
              <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".65rem" }}>
                Coach Info Only
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
                {/* Sponsorship amount */}
                <label style={lbl}>
                  Sponsorship Amount
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: ".75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: ".875rem", pointerEvents: "none" }}>$</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      style={{ ...inp, paddingLeft: "1.5rem" }}
                      value={form.sponsorship_amount}
                      onChange={e => setForm(f => ({ ...f, sponsorship_amount: e.target.value }))}
                      placeholder="1000"
                    />
                  </div>
                </label>

                <label style={lbl}>
                  Contact Name
                  <input
                    style={inp}
                    value={form.contact_name}
                    onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                    placeholder="Jane Smith"
                  />
                </label>

                <label style={lbl}>
                  Contact Email
                  <input
                    type="email"
                    style={inp}
                    value={form.contact_email}
                    onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                    placeholder="jane@example.com"
                  />
                </label>

                <label style={lbl}>
                  Contact Phone
                  <input
                    type="tel"
                    style={inp}
                    value={form.contact_phone}
                    onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                    placeholder="(555) 000-0000"
                  />
                </label>
              </div>
            </div>

            {error && (
              <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
              <button
                onClick={closeModal}
                style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={isEditing ? handleEdit : handleAdd}
                disabled={saving || logoUploading}
                style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: saving || logoUploading ? "not-allowed" : "pointer", opacity: saving || logoUploading ? .7 : 1 }}
              >
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Sponsor"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
