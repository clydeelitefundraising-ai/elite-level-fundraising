"use client";

import { useState } from "react";
import type { CampaignSettings } from "@/lib/supabase";
import type { TeamProductRow, TeamVariantRow } from "@/lib/teamData";
import { coachSession, type TeamActor } from "@/lib/permissions";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";

// ── Types ─────────────────────────────────────────────────────────────────────

type CartItem = {
  key:          string;
  product_id:   string;
  product_name: string;
  variant_id:   string | null;
  variant_name: string | null;
  unit_cents:   number;
  quantity:     number;
  image_url:    string | null;
};

type ProductForm = {
  name:        string;
  description: string;
  category:    string;
  price:       string;
  cost:        string;
  image_url:   string;
  visible:     boolean;
  variants:    { name: string; price_delta: string }[];
};

const BLANK_FORM: ProductForm = {
  name: "", description: "", category: "", price: "", cost: "",
  image_url: "", visible: true, variants: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function initials(name: string) {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

const CATEGORY_SUGGESTIONS = ["Apparel", "Accessories", "Training Gear", "Spirit Wear", "Custom"];

const inp: React.CSSProperties = {
  padding: ".5rem .75rem", border: "1.5px solid #e5e7eb", borderRadius: 9,
  fontSize: ".875rem", width: "100%", boxSizing: "border-box", color: "#111827", background: "#fff",
};
const lbl: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".72rem",
  fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em",
};

// ── Category chip colors ──────────────────────────────────────────────────────

function catColor(cat: string): { bg: string; color: string } {
  const map: Record<string, { bg: string; color: string }> = {
    apparel:      { bg: "#f0f4ff", color: "#1d4ed8" },
    accessories:  { bg: "#fef3c7", color: "#92400e" },
    "training gear": { bg: "#d1fae5", color: "#065f46" },
    "spirit wear": { bg: "#ede9fe", color: "#4c1d95" },
  };
  return map[cat.toLowerCase()] ?? { bg: "#f3f4f6", color: "#374151" };
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({
  product,
  isCoach,
  primary,
  onAddToCart,
  onEdit,
  onDelete,
  addedFlash,
}: {
  product:    TeamProductRow;
  isCoach:    boolean;
  primary:    string;
  onAddToCart: (p: TeamProductRow) => void;
  onEdit:     (p: TeamProductRow) => void;
  onDelete:   (id: string) => void;
  addedFlash: boolean;
}) {
  const cat = catColor(product.category);
  const hasVariants = product.variants.length > 0;

  return (
    <div style={{
      background: "#fff", borderRadius: 14,
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      overflow: "hidden",
      opacity: !product.visible && isCoach ? .6 : 1,
    }}>
      {/* Image */}
      <div style={{ height: 140, background: "#f8f9fb", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ fontSize: "2.5rem", color: "#d1d5db", fontWeight: 800 }}>{initials(product.name)}</div>
        )}
        {isCoach && !product.visible && (
          <div style={{ position: "absolute", top: 8, right: 8, background: "#374151", color: "#fff", fontSize: ".58rem", fontWeight: 700, padding: ".2rem .45rem", borderRadius: 6, textTransform: "uppercase" }}>
            Hidden
          </div>
        )}
      </div>

      <div style={{ padding: ".75rem" }}>
        {/* Category + name */}
        <span style={{ ...cat, fontSize: ".58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", borderRadius: 100, padding: ".1rem .4rem", display: "inline-block", marginBottom: ".35rem" }}>
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d" }}>{fmt(product.price_cents)}</span>
            {hasVariants && <span style={{ fontSize: ".65rem", color: "#9ca3af", marginLeft: ".3rem" }}>+ options</span>}
          </div>
        </div>

        <button
          onClick={() => onAddToCart(product)}
          style={{
            marginTop: ".6rem", width: "100%", padding: ".55rem",
            background: addedFlash ? "#059669" : primary,
            color: "#fff", border: "none", borderRadius: 9,
            fontSize: ".82rem", fontWeight: 700, cursor: "pointer",
            transition: "background .2s",
          }}
        >
          {addedFlash ? "✓ Added!" : hasVariants ? "Select Options" : "Add to Cart"}
        </button>

        {isCoach && (
          <div style={{ display: "flex", gap: ".25rem", justifyContent: "flex-end", marginTop: ".45rem" }}>
            <button onClick={() => onEdit(product)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".7rem", fontWeight: 600, color: "#9ca3af", padding: ".1rem .4rem", borderRadius: 5 }}>
              Edit
            </button>
            <button onClick={() => onDelete(product.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".7rem", fontWeight: 600, color: "#fca5a5", padding: ".1rem .4rem", borderRadius: 5 }}>
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Variant picker modal ──────────────────────────────────────────────────────

function VariantPickerModal({
  product,
  primary,
  onAdd,
  onClose,
}: {
  product: TeamProductRow;
  primary: string;
  onAdd:   (variant: TeamVariantRow) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Modal title={product.name} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
        {product.image_url && (
          <img src={product.image_url} alt={product.name} style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 10 }} />
        )}
        {product.description && (
          <p style={{ margin: 0, fontSize: ".82rem", color: "#6b7280", lineHeight: 1.5 }}>{product.description}</p>
        )}

        <div style={lbl}>
          Select Option
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginTop: ".25rem" }}>
            {product.variants.map(v => {
              const unitCents = product.price_cents + v.price_delta;
              const active    = selected === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelected(v.id)}
                  style={{
                    padding: ".45rem .85rem", borderRadius: 9, cursor: "pointer",
                    border:      active ? `2px solid ${primary}` : "2px solid #e5e7eb",
                    background:  active ? `${primary}10`          : "#fff",
                    color:       active ? primary                  : "#374151",
                    fontSize: ".82rem", fontWeight: 700,
                  }}
                >
                  {v.name}
                  {v.price_delta !== 0 && (
                    <span style={{ fontWeight: 400, marginLeft: ".3rem" }}>
                      ({v.price_delta > 0 ? "+" : ""}{fmt(v.price_delta)})
                    </span>
                  )}
                  {" — "}{fmt(unitCents)}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => {
            const v = product.variants.find(v => v.id === selected);
            if (v) { onAdd(v); onClose(); }
          }}
          disabled={!selected}
          style={{
            padding: ".7rem", background: selected ? primary : "#e5e7eb",
            color: selected ? "#fff" : "#9ca3af", border: "none", borderRadius: 12,
            fontSize: ".95rem", fontWeight: 700, cursor: selected ? "pointer" : "not-allowed",
          }}
        >
          Add to Cart
        </button>
      </div>
    </Modal>
  );
}

// ── Cart modal ────────────────────────────────────────────────────────────────

function CartModal({
  cart,
  primary,
  checkingOut,
  checkoutError,
  onUpdateQty,
  onRemove,
  onCheckout,
  onClose,
}: {
  cart:          CartItem[];
  primary:       string;
  checkingOut:   boolean;
  checkoutError: string;
  onUpdateQty:   (key: string, delta: number) => void;
  onRemove:      (key: string) => void;
  onCheckout:    () => void;
  onClose:       () => void;
}) {
  const total = cart.reduce((s, i) => s + i.unit_cents * i.quantity, 0);

  return (
    <Modal title="Your Cart" onClose={onClose}>
      {cart.length === 0 ? (
        <div style={{ textAlign: "center", padding: "1.5rem 0", color: "#9ca3af", fontSize: ".85rem" }}>
          Your cart is empty.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
          {cart.map((item, i) => (
            <div key={item.key} style={{
              display: "flex", gap: ".65rem", alignItems: "center",
              paddingBottom: i < cart.length - 1 ? ".65rem" : 0,
              borderBottom: i < cart.length - 1 ? "1px solid #f3f4f6" : "none",
            }}>
              {/* Thumbnail */}
              <div style={{ width: 44, height: 44, borderRadius: 8, background: "#f3f4f6", flexShrink: 0, overflow: "hidden" }}>
                {item.image_url
                  ? <img src={item.image_url} alt={item.product_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", color: "#9ca3af" }}>{initials(item.product_name)}</div>
                }
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: ".83rem", color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.product_name}
                </div>
                {item.variant_name && (
                  <div style={{ fontSize: ".68rem", color: "#6b7280" }}>{item.variant_name}</div>
                )}
                <div style={{ fontWeight: 800, fontSize: ".88rem", color: "#059669", marginTop: ".1rem" }}>
                  {fmt(item.unit_cents * item.quantity)}
                </div>
              </div>

              {/* Qty controls */}
              <div style={{ display: "flex", alignItems: "center", gap: ".3rem", flexShrink: 0 }}>
                <button onClick={() => onUpdateQty(item.key, -1)} style={{ width: 26, height: 26, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: ".9rem", color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>−</button>
                <span style={{ fontWeight: 700, fontSize: ".88rem", color: "#0b1e3d", minWidth: 18, textAlign: "center" }}>{item.quantity}</span>
                <button onClick={() => onUpdateQty(item.key, 1)} style={{ width: 26, height: 26, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: ".9rem", color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
              </div>

              <button onClick={() => onRemove(item.key)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".75rem", color: "#fca5a5", fontWeight: 700, flexShrink: 0, padding: ".2rem" }}>✕</button>
            </div>
          ))}

          {/* Total */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: ".5rem", borderTop: "2px solid #f3f4f6" }}>
            <span style={{ fontWeight: 700, fontSize: ".85rem", color: "#374151" }}>Subtotal</span>
            <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "#0b1e3d" }}>{fmt(total)}</span>
          </div>

          {checkoutError && (
            <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
              {checkoutError}
            </p>
          )}

          <button
            onClick={onCheckout}
            disabled={checkingOut}
            style={{
              padding: ".8rem", background: checkingOut ? "#e5e7eb" : primary,
              color: checkingOut ? "#9ca3af" : "#fff", border: "none",
              borderRadius: 12, fontSize: "1rem", fontWeight: 700,
              cursor: checkingOut ? "not-allowed" : "pointer",
            }}
          >
            {checkingOut ? "Redirecting to Stripe…" : `Checkout — ${fmt(total)}`}
          </button>
        </div>
      )}
    </Modal>
  );
}

// ── Product modal (add / edit — coach only) ────────────────────────────────────

function ProductModal({
  form,
  setForm,
  isEditing,
  editingProduct,
  slug,
  saving,
  formError,
  imagePreview,
  imageUploading,
  imageError,
  onSave,
  onClose,
  onImageUpload,
  onAddVariant,
  onRemoveVariant,
}: {
  form:              ProductForm;
  setForm:           React.Dispatch<React.SetStateAction<ProductForm>>;
  isEditing:         boolean;
  editingProduct:    TeamProductRow | null;
  slug:              string;
  saving:            boolean;
  formError:         string;
  imagePreview:      string;
  imageUploading:    boolean;
  imageError:        string;
  onSave:            () => void;
  onClose:           () => void;
  onImageUpload:     (file: File) => void;
  onAddVariant:      () => void;
  onRemoveVariant:   (idx: number) => void;
}) {
  const [newVName,  setNewVName]  = useState("");
  const [newVDelta, setNewVDelta] = useState("");

  const handleAddVariant = () => {
    if (!newVName.trim()) return;
    setForm(f => ({ ...f, variants: [...f.variants, { name: newVName.trim(), price_delta: newVDelta }] }));
    setNewVName(""); setNewVDelta("");
    onAddVariant();
  };

  return (
    <Modal title={isEditing ? "Edit Product" : "Add Product"} onClose={onClose}>
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
          <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#111827" }}>Visible in shop</div>
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

            {/* Add variant form */}
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

        {formError && (
          <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
            {formError}
          </p>
        )}

        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
          <button onClick={onClose} style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={onSave} disabled={saving || imageUploading} style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: saving || imageUploading ? "not-allowed" : "pointer", opacity: saving || imageUploading ? .7 : 1 }}>
            {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Product"}
          </button>
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
  slug:             string;
  settings:         CampaignSettings;
  initialProducts:  TeamProductRow[];
  actor:            TeamActor;
}) {
  const coach   = coachSession(actor);
  const isCoach = !!coach;
  const primary = settings.primary_color;

  const [products,       setProducts]       = useState<TeamProductRow[]>(initialProducts);
  const [cart,           setCart]           = useState<CartItem[]>([]);
  const [showCart,       setShowCart]       = useState(false);
  const [checkingOut,    setCheckingOut]    = useState(false);
  const [checkoutError,  setCheckoutError]  = useState("");
  const [variantPicker,  setVariantPicker]  = useState<TeamProductRow | null>(null);
  const [addedFlash,     setAddedFlash]     = useState<Record<string, boolean>>({});
  const [editingProduct, setEditingProduct] = useState<TeamProductRow | null>(null);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [formError,      setFormError]      = useState("");
  const [form,           setForm]           = useState<ProductForm>(BLANK_FORM);
  const [imagePreview,   setImagePreview]   = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError,     setImageError]     = useState("");

  // ── Cart helpers ──────────────────────────────────────────────────────────

  const addToCart = (product: TeamProductRow, variant?: TeamVariantRow) => {
    const key = `${product.id}:${variant?.id ?? ""}`;
    setCart(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) return prev.map(i => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        key,
        product_id:   product.id,
        product_name: product.name,
        variant_id:   variant?.id   ?? null,
        variant_name: variant?.name ?? null,
        unit_cents:   product.price_cents + (variant?.price_delta ?? 0),
        quantity:     1,
        image_url:    product.image_url,
      }];
    });
    setAddedFlash(f => ({ ...f, [product.id]: true }));
    setTimeout(() => setAddedFlash(f => ({ ...f, [product.id]: false })), 1200);
  };

  const removeFromCart = (key: string) => setCart(prev => prev.filter(i => i.key !== key));

  const updateQty = (key: string, delta: number) =>
    setCart(prev => prev.map(i => i.key === key ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0));

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const handleAddToCart = (product: TeamProductRow) => {
    if (product.variants.length > 0) { setVariantPicker(product); return; }
    addToCart(product);
  };

  const handleCheckout = async () => {
    setCheckingOut(true); setCheckoutError("");
    try {
      const res = await fetch(`/api/team/${slug}/shop/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart: cart.map(i => ({ product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity })) }),
      });
      const data = await res.json();
      if (!res.ok) { setCheckoutError(data.error ?? "Checkout failed."); setCheckingOut(false); return; }
      window.location.href = data.url;
    } catch {
      setCheckoutError("Connection error. Please try again."); setCheckingOut(false);
    }
  };

  // ── Coach form helpers ─────────────────────────────────────────────────────

  const openAdd = () => {
    const maxOrder = products.reduce((m, p) => Math.max(m, p.display_order), -1);
    setForm({ ...BLANK_FORM });
    setFormError(""); setImagePreview(""); setImageError(""); setImageUploading(false);
    setShowAddModal(true);
    void maxOrder;
  };

  const openEdit = (p: TeamProductRow) => {
    setForm({
      name:        p.name,
      description: p.description ?? "",
      category:    p.category,
      price:       String(p.price_cents / 100),
      cost:        p.cost_cents != null ? String(p.cost_cents / 100) : "",
      image_url:   p.image_url ?? "",
      visible:     p.visible,
      variants:    p.variants.map(v => ({ name: v.name, price_delta: v.price_delta !== 0 ? String(v.price_delta / 100) : "" })),
    });
    setImagePreview(p.image_url ?? ""); setImageError(""); setImageUploading(false); setFormError("");
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
    image_url:     f.image_url || null,
    visible:       f.visible,
    display_order: displayOrder,
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

      // Batch-create variants if any were added in the form
      if (form.variants.length > 0) {
        await Promise.all(form.variants.map(v =>
          fetch(`/api/team/${slug}/shop/variants/${data.id}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: v.name, price_delta: v.price_delta ? Math.round(parseFloat(v.price_delta) * 100) : 0 }),
          })
        ));
        // Refresh product to get variant IDs
        const refreshRes = await fetch(`/api/team/${slug}/shop/products`);
        if (refreshRes.ok) {
          const all: TeamProductRow[] = await refreshRes.json();
          setProducts(all);
        }
      } else {
        setProducts(prev => [...prev, data]);
      }
      closeModal();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this product from the shop?")) return;
    const res = await fetch(`/api/team/${slug}/shop/products/${id}`, { method: "DELETE" });
    if (res.ok) setProducts(prev => prev.filter(p => p.id !== id));
  };

  // ── Filtered view ─────────────────────────────────────────────────────────

  const visibleProducts = isCoach ? products : products.filter(p => p.visible);

  const categories = [...new Set(visibleProducts.map(p => p.category))];

  const isEmpty = visibleProducts.length === 0;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>

      {/* ── Section header ── */}
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Team
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Shop
          </h2>
          {visibleProducts.length > 0 && (
            <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {visibleProducts.length} item{visibleProducts.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {isCoach && (
            <>
              <a href={`/team/${slug}/shop/orders`} style={{ fontSize: ".72rem", fontWeight: 700, color: "#6b7280", textDecoration: "none", padding: ".3rem .6rem", background: "#f3f4f6", borderRadius: 7 }}>
                Orders
              </a>
              <CoachBar coach={coach} label="Add Product" onAdd={openAdd} />
            </>
          )}
        </div>
      </div>

      {/* ── Empty state ── */}
      {isEmpty ? (
        <div style={{ background: "#fff", borderRadius: 14, padding: "3rem 1.5rem", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
          <div style={{ fontSize: "2.25rem", marginBottom: ".75rem", opacity: .3 }}>🛍️</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>Shop coming soon</div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>{isCoach ? "Add your first product above." : "Check back soon."}</div>
        </div>
      ) : (
        /* ── Products by category ── */
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
                      onAddToCart={handleAddToCart}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      addedFlash={!!addedFlash[p.id]}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Cart bar (sticky above nav) ── */}
      {cartCount > 0 && (
        <div
          onClick={() => setShowCart(true)}
          style={{
            position: "fixed",
            bottom: "calc(58px + env(safe-area-inset-bottom, 0px))",
            left: "50%",
            transform: "translateX(-50%)",
            width: "calc(min(430px, 100%) - 2rem)",
            background: primary,
            color: "#fff",
            borderRadius: 14,
            padding: ".75rem 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(0,0,0,.25)",
            zIndex: 45,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: ".65rem" }}>
            <span style={{ background: "rgba(255,255,255,.25)", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".72rem", fontWeight: 800 }}>
              {cartCount}
            </span>
            <span style={{ fontWeight: 700, fontSize: ".88rem" }}>View Cart</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: ".95rem" }}>
            {fmt(cart.reduce((s, i) => s + i.unit_cents * i.quantity, 0))}
          </span>
        </div>
      )}

      {/* ── Variant picker modal ── */}
      {variantPicker && (
        <VariantPickerModal
          product={variantPicker}
          primary={primary}
          onAdd={v => addToCart(variantPicker, v)}
          onClose={() => setVariantPicker(null)}
        />
      )}

      {/* ── Cart modal ── */}
      {showCart && (
        <CartModal
          cart={cart}
          primary={primary}
          checkingOut={checkingOut}
          checkoutError={checkoutError}
          onUpdateQty={updateQty}
          onRemove={removeFromCart}
          onCheckout={handleCheckout}
          onClose={() => setShowCart(false)}
        />
      )}

      {/* ── Product add/edit modal (coach only) ── */}
      {(showAddModal || editingProduct) && (
        <ProductModal
          form={form}
          setForm={setForm}
          isEditing={!!editingProduct}
          editingProduct={editingProduct}
          slug={slug}
          saving={saving}
          formError={formError}
          imagePreview={imagePreview}
          imageUploading={imageUploading}
          imageError={imageError}
          onSave={handleSave}
          onClose={closeModal}
          onImageUpload={handleImageUpload}
          onAddVariant={() => {}} // handled inline
          onRemoveVariant={i => setForm(f => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }))}
        />
      )}
    </div>
  );
}
