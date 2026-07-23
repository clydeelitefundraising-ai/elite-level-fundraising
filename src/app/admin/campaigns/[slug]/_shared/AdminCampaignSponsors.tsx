"use client";

import { useState, useEffect } from "react";
import Modal from "@/app/team/[slug]/_components/Modal";
import { T, SectionHeader, Field, useToast, Toast } from "./ui";

// ── Types ─────────────────────────────────────────────────────────────────────

const TIER_ORDER = ["title", "platinum", "gold", "silver", "bronze", "community_partner"] as const;
type Tier = typeof TIER_ORDER[number];

const TIER_META: Record<Tier, { label: string; color: string; bg: string }> = {
  title:             { label: "Title Sponsor",     color: "#4c1d95", bg: "#ede9fe" },
  platinum:          { label: "Platinum",          color: "#0c4a6e", bg: "#e0f2fe" },
  gold:              { label: "Gold",              color: "#92400e", bg: "#fef3c7" },
  silver:            { label: "Silver",            color: "#374151", bg: "#f3f4f6" },
  bronze:            { label: "Bronze",            color: "#7c2d12", bg: "#ffedd5" },
  community_partner: { label: "Community Partner", color: "#065f46", bg: "#d1fae5" },
};

type SponsorRow = {
  id: string;
  campaign_slug: string;
  name: string;
  url: string;
  tier: Tier;
  logo_url: string | null;
  description: string | null;
  display_order: number;
  visible: boolean;
  sponsorship_amount_cents: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
};

type SponForm = {
  name: string; url: string; tier: Tier; description: string; logo_url: string;
  visible: boolean; sponsorship_amount: string;
  contact_name: string; contact_email: string; contact_phone: string;
};

const BLANK: SponForm = {
  name: "", url: "", tier: "gold", description: "", logo_url: "",
  visible: true, sponsorship_amount: "", contact_name: "", contact_email: "", contact_phone: "",
};

function fromRow(s: SponsorRow): SponForm {
  return {
    name: s.name, url: s.url, tier: s.tier, description: s.description ?? "", logo_url: s.logo_url ?? "",
    visible: s.visible,
    sponsorship_amount: s.sponsorship_amount_cents != null ? String(s.sponsorship_amount_cents / 100) : "",
    contact_name: s.contact_name ?? "", contact_email: s.contact_email ?? "", contact_phone: s.contact_phone ?? "",
  };
}

function buildBody(f: SponForm, displayOrder: number) {
  return {
    name: f.name.trim(), url: f.url.trim(), tier: f.tier,
    description: f.description.trim() || null,
    logo_url: f.logo_url.trim() || null,
    visible: f.visible,
    display_order: displayOrder,
    sponsorship_amount_cents: f.sponsorship_amount ? Math.round(parseFloat(f.sponsorship_amount) * 100) : null,
    contact_name: f.contact_name.trim() || null,
    contact_email: f.contact_email.trim() || null,
    contact_phone: f.contact_phone.trim() || null,
  };
}

// ── Logo thumbnail (falls back to an initial-letter avatar on missing/broken URL) ──

function SponsorLogoThumb({ name, logoUrl, size = 40 }: { name: string; logoUrl: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <img src={logoUrl} alt={name} onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: 8, objectFit: "contain", flexShrink: 0, background: "#f9fafb", border: "1px solid #e5e7eb" }} />
    );
  }
  const initial = name.trim()[0]?.toUpperCase() ?? "S";
  const palette = ["#0b2044", "#4c1d95", "#065f46", "#7c2d12", "#0c4a6e", "#92400e"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: palette[hash % palette.length], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.4, color: "#fff", flexShrink: 0 }}>
      {initial}
    </div>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  const { label, color, bg } = TIER_META[tier];
  return (
    <span style={{ padding: ".15rem .55rem", borderRadius: 100, fontSize: ".64rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color, background: bg }}>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminCampaignSponsors({ slug }: { slug: string }) {
  const { toast, show } = useToast();
  const [sponsors, setSponsors] = useState<SponsorRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");

  const [form, setForm]         = useState<SponForm>(BLANK);
  const [editing, setEditing]   = useState<SponsorRow | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState("");

  const [logoPreview, setLogoPreview]     = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError]         = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/campaigns/${slug}/sponsors`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((rows: SponsorRow[]) => { if (!cancelled) { setSponsors(rows); setLoadError(""); } })
      .catch(() => { if (!cancelled) setLoadError("Failed to load sponsors."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const resetLogo = () => { setLogoPreview(""); setLogoError(""); setLogoUploading(false); };

  const openAdd = () => { setForm({ ...BLANK }); setFormError(""); resetLogo(); setShowAdd(true); };
  const openEdit = (s: SponsorRow) => { setForm(fromRow(s)); setLogoPreview(s.logo_url ?? ""); setLogoError(""); setLogoUploading(false); setEditing(s); setFormError(""); };
  const closeModal = () => { setShowAdd(false); setEditing(null); setFormError(""); resetLogo(); };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true); setLogoError("");
    const local = URL.createObjectURL(file);
    setLogoPreview(local);
    const fd = new FormData();
    fd.append("logo", file);
    const res = await fetch(`/api/admin/campaigns/${slug}/sponsors/logo`, { method: "POST", body: fd });
    const data = await res.json();
    URL.revokeObjectURL(local);
    setLogoUploading(false);
    if (!res.ok) { setLogoError(data.error ?? "Upload failed"); setLogoPreview(form.logo_url); return; }
    setLogoPreview(data.url);
    setForm(f => ({ ...f, logo_url: data.url }));
  };

  const handleRemoveLogo = () => { setLogoPreview(""); setForm(f => ({ ...f, logo_url: "" })); };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.url.trim()) { setFormError("Name and URL are required."); return; }
    setSaving(true); setFormError("");
    const maxOrder = sponsors.reduce((m, s) => Math.max(m, s.display_order), -1);
    const res = await fetch(`/api/admin/campaigns/${slug}/sponsors`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(form, maxOrder + 1)),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setFormError(data.error ?? "Failed to add sponsor."); return; }
    setSponsors(prev => [...prev, data]);
    closeModal();
    show("Sponsor added.");
  };

  const handleEdit = async () => {
    if (!editing || !form.name.trim() || !form.url.trim()) { setFormError("Name and URL are required."); return; }
    setSaving(true); setFormError("");
    const res = await fetch(`/api/admin/campaigns/${slug}/sponsors/${editing.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(form, editing.display_order)),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setFormError(data.error ?? "Failed to update sponsor."); return; }
    setSponsors(prev => prev.map(s => s.id === editing.id ? { ...s, ...buildBody(form, editing.display_order) } : s));
    closeModal();
    show("Sponsor updated.");
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove sponsor "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/campaigns/${slug}/sponsors/${id}`, { method: "DELETE" });
    if (res.ok) { setSponsors(prev => prev.filter(s => s.id !== id)); show("Sponsor removed."); }
    else show("Failed to remove sponsor.", "error");
  };

  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;

  return (
    <div style={T.card}>
      <SectionHeader
        title="Sponsors"
        desc={`${sponsors.length} sponsor${sponsors.length !== 1 ? "s" : ""} on this campaign`}
        action={<button onClick={openAdd} style={{ padding: ".4rem .85rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".76rem", fontWeight: 600, cursor: "pointer" }}>+ Add Sponsor</button>}
      />

      {loading ? (
        <div style={{ padding: "1.5rem", textAlign: "center", fontSize: ".8rem", color: "#98989d" }}>Loading sponsors…</div>
      ) : loadError ? (
        <div style={{ padding: "1rem", textAlign: "center", fontSize: ".8rem", color: "#dc2626" }}>{loadError}</div>
      ) : sponsors.length === 0 ? (
        <div style={{ padding: "1.75rem", textAlign: "center", fontSize: ".82rem", color: "#98989d" }}>
          No sponsors yet. Add the first one above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
          {sponsors.map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".65rem", borderRadius: 10, border: "1px solid #f0f0f2", opacity: s.visible ? 1 : 0.55 }}>
              <SponsorLogoThumb name={s.name} logoUrl={s.logo_url} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: ".85rem", color: "#1d1d1f" }}>{s.name}</span>
                  <TierBadge tier={s.tier} />
                  {!s.visible && <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#9ca3af", background: "#f3f4f6", padding: ".1rem .4rem", borderRadius: 100, textTransform: "uppercase" }}>Hidden</span>}
                </div>
                <div style={{ fontSize: ".7rem", color: "#98989d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.url.replace(/^https?:\/\//, "")}
                </div>
              </div>
              <div style={{ display: "flex", gap: ".4rem", flexShrink: 0 }}>
                <button onClick={() => openEdit(s)} style={{ padding: ".35rem .65rem", background: "#f5f5f7", border: "none", borderRadius: 7, fontSize: ".72rem", fontWeight: 600, color: "#374151", cursor: "pointer" }}>Edit</button>
                <button onClick={() => handleDelete(s.id, s.name)} style={{ padding: ".35rem .65rem", background: "#fef2f2", border: "none", borderRadius: 7, fontSize: ".72rem", fontWeight: 600, color: "#dc2626", cursor: "pointer" }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal title={isEditing ? "Edit Sponsor" : "Add Sponsor"} onClose={closeModal}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
            <Field label="Business Name *">
              <input style={T.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Local Business" autoFocus />
            </Field>

            <Field label="Website URL *">
              <input style={T.input} value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com" />
            </Field>

            <div>
              <label style={T.label}>Tier *</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: ".35rem" }}>
                {TIER_ORDER.map(t => {
                  const active = form.tier === t;
                  const { label, color, bg } = TIER_META[t];
                  return (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tier: t }))}
                      style={{ padding: ".4rem .25rem", borderRadius: 8, border: active ? `2px solid ${color}` : "2px solid #e5e7eb", background: active ? bg : "#fff", color: active ? color : "#6b7280", fontSize: ".62rem", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: ".02em" }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label="Description">
              <textarea rows={2} style={{ ...T.input, resize: "none" }} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Supporting student athletes since 2010" />
            </Field>

            <div>
              <label style={T.label}>Logo</label>
              <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
                {(logoPreview || form.logo_url) ? (
                  <img src={logoPreview || form.logo_url} alt="Preview" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "contain", background: "#f9fafb", border: "1px solid #e5e7eb", flexShrink: 0 }} />
                ) : null}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                    <label style={{ display: "inline-block", padding: ".4rem .85rem", background: logoUploading ? "#f9fafb" : "#f3f4f6", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: ".76rem", fontWeight: 600, color: logoUploading ? "#9ca3af" : "#374151", cursor: logoUploading ? "not-allowed" : "pointer" }}>
                      {logoUploading ? "Uploading…" : (logoPreview || form.logo_url) ? "Change Logo" : "Upload Logo"}
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" style={{ display: "none" }} disabled={logoUploading}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }} />
                    </label>
                    {(logoPreview || form.logo_url) && !logoUploading && (
                      <button type="button" onClick={handleRemoveLogo} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", fontWeight: 600, color: "#dc2626" }}>Remove</button>
                    )}
                  </div>
                  <div style={{ fontSize: ".65rem", color: "#9ca3af", marginTop: ".3rem" }}>JPEG, PNG, WebP, SVG · max 5MB · transparency preserved</div>
                </div>
              </div>
              {logoError && <p style={{ margin: ".4rem 0 0", color: "#dc2626", fontSize: ".75rem" }}>{logoError}</p>}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".65rem .75rem", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
              <div>
                <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#111827" }}>Visible to public</div>
                <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".1rem" }}>Show on the campaign page and team hub</div>
              </div>
              <button type="button" onClick={() => setForm(f => ({ ...f, visible: !f.visible }))}
                style={{ width: 44, height: 24, borderRadius: 100, border: "none", background: form.visible ? "#0b1e3d" : "#e5e7eb", cursor: "pointer", position: "relative", flexShrink: 0 }}>
                <span style={{ position: "absolute", top: 3, left: form.visible ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left .15s" }} />
              </button>
            </div>

            <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: ".875rem", display: "flex", flexDirection: "column", gap: ".75rem" }}>
              <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>Sponsorship &amp; Contact</div>
              <Field label="Sponsorship Amount ($)">
                <input type="number" min="0" step="1" style={T.input} value={form.sponsorship_amount}
                  onChange={e => setForm(f => ({ ...f, sponsorship_amount: e.target.value }))} placeholder="1000" />
              </Field>
              <Field label="Contact Name">
                <input style={T.input} value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Jane Smith" />
              </Field>
              <Field label="Contact Email">
                <input type="email" style={T.input} value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="jane@example.com" />
              </Field>
              <Field label="Contact Phone">
                <input type="tel" style={T.input} value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="(555) 000-0000" />
              </Field>
            </div>

            {formError && (
              <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>{formError}</p>
            )}

            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
              <button onClick={closeModal} style={{ padding: ".5rem 1rem", background: "#f5f5f7", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={isEditing ? handleEdit : handleAdd} disabled={saving || logoUploading}
                style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: saving || logoUploading ? "not-allowed" : "pointer", opacity: saving || logoUploading ? .7 : 1 }}>
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Sponsor"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  );
}
