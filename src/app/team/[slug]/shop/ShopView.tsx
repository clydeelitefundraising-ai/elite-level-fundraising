"use client";

import { useState } from "react";
import type { CampaignSettings } from "@/lib/supabase";
import type { TeamProductRow } from "@/lib/teamData";
import { coachSession, type TeamActor } from "@/lib/permissions";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";

// ── Constants ─────────────────────────────────────────────────────────────────

const STORE_PROVIDERS = ["Shopify", "SquadLocker", "BSN Sports", "Game One", "Custom"] as const;
const CATEGORY_SUGGESTIONS = ["Apparel", "Accessories", "Training Gear", "Spirit Wear", "Custom"];

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductForm = {
  name:         string;
  description:  string;
  category:     string;
  price:        string;
  cost:         string;
  image_url:    string;
  visible:      boolean;
  external_url: string;
  variants:     { name: string; price_delta: string }[];
};

const BLANK_FORM: ProductForm = {
  name: "", description: "", category: "", price: "", cost: "",
  image_url: "", visible: true, external_url: "", variants: [],
};

// ── Styles ────────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: ".5rem .75rem", border: "1.5px solid #e5e7eb", borderRadius: 9,
  fontSize: ".875rem", width: "100%", boxSizing: "border-box", color: "#111827", background: "#fff",
};
const lbl: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".72rem",
  fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function initials(name: string) {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

function catColor(cat: string): { bg: string; color: string } {
  const map: Record<string, { bg: string; color: string }> = {
    apparel:           { bg: "#f0f4ff", color: "#1d4ed8" },
    accessories:       { bg: "#fef3c7", color: "#92400e" },
    "training gear":   { bg: "#d1fae5", color: "#065f46" },
    "spirit wear":     { bg: "#ede9fe", color: "#4c1d95" },
  };
  return map[cat.toLowerCase()] ?? { bg: "#f3f4f6", color: "#374151" };
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({
  product,
  isCoach,
  primary,
  onEdit,
  onDelete,
}: {
  product:  TeamProductRow;
  isCoach:  boolean;
  primary:  string;
  onEdit:   (p: TeamProductRow) => void;
  onDelete: (id: string) => void;
}) {
  const cat         = catColor(product.category);
  const hasVariants = product.variants.length > 0;
  const externalUrl = product.external_url ?? null;

  const body = (
    <>
      <div style={{ height: 140, background: "#f8f9fb", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        {product.image_url
          ? <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ fontSize: "2.5rem", color: "#d1d5db", fontWeight: 800 }}>{initials(product.name)}</div>
        }
        {isCoach && !product.visible && (
          <div style={{ position: "absolute", top: 8, right: 8, background: "#374151", color: "#fff", fontSize: ".58rem", fontWeight: 700, padding: ".2rem .45rem", borderRadius: 6, textTransform: "uppercase" }}>
            Hidden
          </div>
        )}
        {externalUrl && !isCoach && (
          <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: ".6rem", fontWeight: 700, padding: ".2rem .5rem", borderRadius: 6 }}>
            Shop →
          </div>
        )}
      </div>

      <div style={{ padding: ".75rem" }}>
        <span style={{ ...cat, fontSize: ".58rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".04em", borderRadius: 100, padding: ".1rem .4rem", display: "inline-block", marginBottom: ".35rem" }}>
          {product.category}
        </span>
        <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#0b1e3d", lineHeight: 1.2, marginBottom: ".25rem" }}>
          {product.name}
        </div>
        {product.description && (
          <div style={{ fontSize: ".72rem", color: "#6b7280", lineHeight: 1.4, marginBottom: ".4rem", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
            {product.description}
          </div>
        )}
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d" }}>
          {fmt(product.price_cents)}
          {hasVariants && <span style={{ fontSize: ".65rem", color: "#9ca3af", marginLeft: ".3rem", fontWeight: 400 }}>+ options</span>}
        </div>
        {isCoach && externalUrl && (
          <div style={{ marginTop: ".3rem", fontSize: ".65rem", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            🔗 {externalUrl}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div style={{
      background: "#fff", borderRadius: 14,
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      overflow: "hidden",
      opacity: !product.visible && isCoach ? .6 : 1,
    }}>
      {externalUrl && !isCoach
        ? (
          <a href={externalUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block", color: "inherit" }}>
            {body}
          </a>
        )
        : body
      }
      {isCoach && (
        <div style={{ display: "flex", gap: ".25rem", justifyContent: "flex-end", padding: "0 .75rem .6rem" }}>
          <button onClick={() => onEdit(product)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".7rem", fontWeight: 600, color: "#9ca3af", padding: ".1rem .4rem", borderRadius: 5 }}>
            Edit
          </button>
          <button onClick={() => onDelete(product.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".7rem", fontWeight: 600, color: "#fca5a5", padding: ".1rem .4rem", borderRadius: 5 }}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ── Product modal (coach only) ────────────────────────────────────────────────

function ProductModal({
  form,
  setForm,
  isEditing,
  saving,
  formError,
  imagePreview,
  imageUploading,
  imageError,
  onSave,
  onClose,
  onImageUpload,
  onRemoveVariant,
}: {
  form:            ProductForm;
  setForm:         React.Dispatch<React.SetStateAction<ProductForm>>;
  isEditing:       boolean;
  saving:          boolean;
  formError:       string;
  imagePreview:    string;
  imageUploading:  boolean;
  imageError:      string;
  onSave:          () => void;
  onClose:         () => void;
  onImageUpload:   (file: File) => void;
  onRemoveVariant: (idx: number) => void;
}) {
  const [newVName,  setNewVName]  = useState("");
  const [newVDelta, setNewVDelta] = useState("");

  const handleAddVariant = () => {
    if (!newVName.trim()) return;
    setForm(f => ({ ...f, variants: [...f.variants, { name: newVName.trim(), price_delta: newVDelta }] }));
    setNewVName(""); setNewVDelta("");
  };

  return (
    <Modal
      title={isEditing ? "Edit Product" : "Add Product"}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
          {formError && (
            <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
              {formError}
            </p>
          )}
          <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={onSave} disabled={saving || imageUploading} style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: saving || imageUploading ? "not-allowed" : "pointer", opacity: saving || imageUploading ? .7 : 1 }}>
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Product"}
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>

        <label style={lbl}>
          Product Name *
          <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Team Hoodie" autoFocus />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
          <label style={lbl}>
            Price *
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: ".75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: ".875rem", pointerEvents: "none" }}>$</span>
              <input type="number" min="0" step="0.01" style={{ ...inp, paddingLeft: "1.5rem" }} value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="45.00" />
            </div>
          </label>
          <label style={lbl}>
            Your Cost
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: ".75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: ".875rem", pointerEvents: "none" }}>$</span>
              <input type="number" min="0" step="0.01" style={{ ...inp, paddingLeft: "1.5rem" }} value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="internal" />
            </div>
          </label>
        </div>

        <label style={lbl}>
          Category
          <input list="cat-list" style={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Apparel" />
          <datalist id="cat-list">
            {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
          </datalist>
        </label>

        <label style={lbl}>
          Description
          <textarea rows={2} style={{ ...inp, resize: "none", fontWeight: 400, letterSpacing: 0, textTransform: "none" }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Comfortable team hoodie…" />
        </label>

        <label style={lbl}>
          Product Link
          <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: ".68rem", color: "#9ca3af" }}>Optional — links directly to this item in your team store</span>
          <input style={{ ...inp, fontWeight: 400, textTransform: "none", letterSpacing: 0 }} type="url" value={form.external_url} onChange={e => setForm(f => ({ ...f, external_url: e.target.value }))} placeholder="https://yourstore.com/products/team-hoodie" />
        </label>

        {/* Image upload */}
        <div style={lbl}>
          Product Image
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginTop: ".1rem" }}>
            {(imagePreview || form.image_url) && (
              <img src={imagePreview || form.image_url} alt="Preview" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: "1px solid #e5e7eb" }} />
            )}
            <div style={{ flex: 1 }}>
              <label style={{ display: "inline-block", padding: ".4rem .85rem", background: imageUploading ? "#f9fafb" : "#f3f4f6", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: ".78rem", fontWeight: 600, color: imageUploading ? "#9ca3af" : "#374151", cursor: imageUploading ? "not-allowed" : "pointer" }}>
                {imageUploading ? "Uploading…" : (imagePreview || form.image_url) ? "Change Image" : "Choose Image"}
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={imageUploading} onChange={e => { const f = e.target.files?.[0]; if (f) onImageUpload(f); }} />
              </label>
              <div style={{ fontSize: ".65rem", color: "#9ca3af", marginTop: ".25rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>JPEG, PNG · max 10MB</div>
            </div>
          </div>
          {imageError && <p style={{ margin: 0, color: "#dc2626", fontSize: ".75rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{imageError}</p>}
        </div>

        {/* Visibility */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".6rem .75rem", background: "#f9fafb", borderRadius: 10, border: "1.5px solid #e5e7eb" }}>
          <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#111827" }}>Visible in gallery</div>
          <button type="button" onClick={() => setForm(f => ({ ...f, visible: !f.visible }))} style={{ width: 44, height: 24, borderRadius: 100, border: "none", background: form.visible ? "#0b1e3d" : "#e5e7eb", cursor: "pointer", position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 3, left: form.visible ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left .15s" }} />
          </button>
        </div>

        {/* Variants */}
        <div style={lbl}>
          Sizes / Variants
          <div style={{ display: "flex", flexDirection: "column", gap: ".35rem", marginTop: ".1rem" }}>
            {form.variants.map((v, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: ".5rem", padding: ".4rem .65rem", background: "#f8f9fb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <span style={{ flex: 1, fontSize: ".82rem", fontWeight: 600, color: "#0b1e3d", textTransform: "none", letterSpacing: 0 }}>{v.name}</span>
                {parseFloat(v.price_delta || "0") !== 0 && (
                  <span style={{ fontSize: ".72rem", color: "#6b7280", fontWeight: 400 }}>
                    {parseFloat(v.price_delta) > 0 ? "+" : ""}{fmt(Math.round(parseFloat(v.price_delta) * 100))}
                  </span>
                )}
                <button onClick={() => onRemoveVariant(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#fca5a5", fontSize: ".8rem", fontWeight: 700, padding: ".1rem .25rem" }}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: ".4rem", alignItems: "flex-end" }}>
              <input style={{ ...inp, fontSize: ".8rem", flex: 2, fontWeight: 400, textTransform: "none", letterSpacing: 0 }} placeholder="e.g. Large" value={newVName} onChange={e => setNewVName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddVariant(); } }} />
              <div style={{ position: "relative", flex: 1 }}>
                <span style={{ position: "absolute", left: ".55rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: ".8rem", pointerEvents: "none" }}>+$</span>
                <input type="number" step="0.01" style={{ ...inp, fontSize: ".8rem", paddingLeft: "1.6rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }} placeholder="0" value={newVDelta} onChange={e => setNewVDelta(e.target.value)} />
              </div>
              <button onClick={handleAddVariant} style={{ padding: ".5rem .75rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".8rem", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Add</button>
            </div>
          </div>
        </div>

      </div>
    </Modal>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ShopView({
  slug,
  settings,
  initialProducts,
  actor,
}: {
  slug:            string;
  settings:        CampaignSettings;
  initialProducts: TeamProductRow[];
  actor:           TeamActor;
}) {
  const coach   = coachSession(actor);
  const isCoach = !!coach;
  const primary = settings.primary_color;

  const [products,       setProducts]       = useState<TeamProductRow[]>(initialProducts);
  const [editingProduct, setEditingProduct] = useState<TeamProductRow | null>(null);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [formError,      setFormError]      = useState("");
  const [form,           setForm]           = useState<ProductForm>(BLANK_FORM);
  const [imagePreview,   setImagePreview]   = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError,     setImageError]     = useState("");

  const [storeUrl,      setStoreUrl]      = useState(settings.external_store_url ?? "");
  const [storeProvider, setStoreProvider] = useState(settings.store_provider     ?? "");
  const [storeSaving,   setStoreSaving]   = useState(false);
  const [storeError,    setStoreError]    = useState("");
  const [storeSaved,    setStoreSaved]    = useState(false);

  // ── Store settings ────────────────────────────────────────────────────────

  const handleSaveStoreSettings = async () => {
    setStoreSaving(true); setStoreError(""); setStoreSaved(false);
    try {
      const res = await fetch(`/api/team/${slug}/shop/store`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_store_url: storeUrl.trim() || null,
          store_provider:     storeProvider   || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); setStoreError(d.error ?? "Failed to save."); }
      else { setStoreSaved(true); setTimeout(() => setStoreSaved(false), 2500); }
    } catch {
      setStoreError("Connection error.");
    } finally {
      setStoreSaving(false);
    }
  };

  // ── Product form helpers ──────────────────────────────────────────────────

  const openAdd = () => {
    setForm(BLANK_FORM);
    setFormError(""); setImagePreview(""); setImageError("");
    setShowAddModal(true);
  };

  const openEdit = (p: TeamProductRow) => {
    setForm({
      name:         p.name,
      description:  p.description  ?? "",
      category:     p.category,
      price:        String(p.price_cents / 100),
      cost:         p.cost_cents != null ? String(p.cost_cents / 100) : "",
      image_url:    p.image_url    ?? "",
      visible:      p.visible,
      external_url: p.external_url ?? "",
      variants:     p.variants.map(v => ({ name: v.name, price_delta: v.price_delta !== 0 ? String(v.price_delta / 100) : "" })),
    });
    setImagePreview(p.image_url ?? ""); setImageError(""); setFormError("");
    setEditingProduct(p);
  };

  const closeModal = () => { setShowAddModal(false); setEditingProduct(null); setFormError(""); setImagePreview(""); };

  const handleImageUpload = async (file: File) => {
    setImageUploading(true); setImageError("");
    const local = URL.createObjectURL(file);
    setImagePreview(local);
    const fd = new FormData(); fd.append("image", file);
    const res = await fetch(`/api/team/${slug}/shop/products/image`, { method: "POST", body: fd });
    const data = await res.json();
    URL.revokeObjectURL(local);
    setImageUploading(false);
    if (!res.ok) { setImageError(data.error ?? "Upload failed"); setImagePreview(form.image_url); return; }
    setImagePreview(data.url);
    setForm(f => ({ ...f, image_url: data.url }));
  };

  const buildBody = (f: ProductForm, displayOrder: number) => ({
    name:          f.name.trim(),
    description:   f.description.trim() || null,
    category:      f.category.trim()    || "general",
    price_cents:   Math.round(parseFloat(f.price) * 100),
    cost_cents:    f.cost ? Math.round(parseFloat(f.cost) * 100) : null,
    image_url:     f.image_url     || null,
    visible:       f.visible,
    display_order: displayOrder,
    external_url:  f.external_url.trim() || null,
  });

  const handleSave = async () => {
    if (!form.name.trim() || !form.price || isNaN(parseFloat(form.price))) {
      setFormError("Name and price are required."); return;
    }
    setSaving(true); setFormError("");

    if (editingProduct) {
      const res = await fetch(`/api/team/${slug}/shop/products/${editingProduct.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(form, editingProduct.display_order)),
      });
      setSaving(false);
      if (!res.ok) { setFormError("Failed to update product."); return; }
      setProducts(prev => prev.map(p =>
        p.id === editingProduct.id
          ? { ...p, ...buildBody(form, p.display_order), variants: editingProduct.variants }
          : p,
      ));
      closeModal();
    } else {
      const maxOrder = products.reduce((m, p) => Math.max(m, p.display_order), -1);
      const res = await fetch(`/api/team/${slug}/shop/products`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(form, maxOrder + 1)),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok) { setFormError(data.error ?? "Failed to add product."); return; }

      if (form.variants.length > 0) {
        await Promise.all(form.variants.map(v =>
          fetch(`/api/team/${slug}/shop/variants/${data.id}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: v.name, price_delta: v.price_delta ? Math.round(parseFloat(v.price_delta) * 100) : 0 }),
          })
        ));
        const refreshRes = await fetch(`/api/team/${slug}/shop/products`);
        if (refreshRes.ok) setProducts(await refreshRes.json());
      } else {
        setProducts(prev => [...prev, data]);
      }
      closeModal();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this product from the gallery?")) return;
    const res = await fetch(`/api/team/${slug}/shop/products/${id}`, { method: "DELETE" });
    if (res.ok) setProducts(prev => prev.filter(p => p.id !== id));
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const visibleProducts   = isCoach ? products : products.filter(p => p.visible);
  const categories        = [...new Set(visibleProducts.map(p => p.category))];
  const isEmpty           = visibleProducts.length === 0;
  const effectiveStoreUrl = isCoach ? (storeUrl.trim() || null) : (settings.external_store_url ?? null);
  const effectiveProvider = isCoach ? (storeProvider || null) : (settings.store_provider ?? null);

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>

      {/* ── Section header ── */}
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Team
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Gear Gallery
          </h2>
          {visibleProducts.length > 0 && (
            <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {visibleProducts.length} item{visibleProducts.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {isCoach && <CoachBar coach={coach} label="Add Product" onAdd={openAdd} />}
        </div>
      </div>

      {/* ── Coach: Store Settings ── */}
      {isCoach && (
        <div style={{ background: "#fff", borderRadius: 14, padding: "1rem", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".75rem" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".65rem" }}>
            Team Store Settings
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
            <label style={lbl}>
              External Store URL
              <input
                style={{ ...inp, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}
                type="url"
                value={storeUrl}
                onChange={e => setStoreUrl(e.target.value)}
                placeholder="https://yourteam.shopify.com"
              />
            </label>
            <label style={lbl}>
              Store Provider
              <select
                style={{ ...inp, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}
                value={storeProvider}
                onChange={e => setStoreProvider(e.target.value)}
              >
                <option value="">None / Not listed</option>
                {STORE_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            {storeError && (
              <p style={{ margin: 0, padding: ".4rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".8rem" }}>
                {storeError}
              </p>
            )}
            <button
              onClick={handleSaveStoreSettings}
              disabled={storeSaving}
              style={{
                padding: ".55rem", background: storeSaved ? "#059669" : "#0b1e3d",
                color: "#fff", border: "none", borderRadius: 9,
                fontSize: ".85rem", fontWeight: 700,
                cursor: storeSaving ? "not-allowed" : "pointer",
                opacity: storeSaving ? .7 : 1,
                transition: "background .2s",
              }}
            >
              {storeSaved ? "✓ Saved" : storeSaving ? "Saving…" : "Save Store Settings"}
            </button>
          </div>
        </div>
      )}

      {/* ── Store banner (coach preview + visitor view) ── */}
      {effectiveStoreUrl && (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "1.25rem",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
          marginBottom: ".75rem", borderTop: `3px solid ${primary}`,
        }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d", marginBottom: ".15rem" }}>
            Official Team Store
          </div>
          {effectiveProvider && (
            <div style={{ fontSize: ".75rem", color: "#6b7280", marginBottom: ".65rem" }}>
              Powered by {effectiveProvider}
            </div>
          )}
          {!effectiveProvider && <div style={{ marginBottom: ".65rem" }} />}
          <a
            href={effectiveStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block", width: "100%", padding: ".65rem", boxSizing: "border-box",
              background: primary, color: "#fff", borderRadius: 10,
              fontSize: ".9rem", fontWeight: 700, textAlign: "center", textDecoration: "none",
              marginBottom: ".6rem",
            }}
          >
            Visit Team Store →
          </a>
          <div style={{ fontSize: ".72rem", color: "#9ca3af", lineHeight: 1.5 }}>
            Orders, shipping, and fulfillment are handled through the team store.
          </div>
        </div>
      )}

      {/* ── Gallery ── */}
      {isEmpty ? (
        <div style={{ background: "#fff", borderRadius: 14, padding: "3rem 1.5rem", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
          <div style={{ fontSize: "2.25rem", marginBottom: ".75rem", opacity: .3 }}>👕</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            {isCoach ? "No products yet" : "Gallery coming soon"}
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            {isCoach ? "Add your first product above." : "Check back soon."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {categories.map(cat => {
            const items = visibleProducts.filter(p => p.category === cat);
            return (
              <div key={cat}>
                <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: ".45rem" }}>
                  {cat}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: ".65rem" }}>
                  {items.map(p => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      isCoach={isCoach}
                      primary={primary}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Product modal (coach only) ── */}
      {(showAddModal || editingProduct) && (
        <ProductModal
          form={form}
          setForm={setForm}
          isEditing={!!editingProduct}
          saving={saving}
          formError={formError}
          imagePreview={imagePreview}
          imageUploading={imageUploading}
          imageError={imageError}
          onSave={handleSave}
          onClose={closeModal}
          onImageUpload={handleImageUpload}
          onRemoveVariant={i => setForm(f => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }))}
        />
      )}
    </div>
  );
}
