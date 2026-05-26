"use client";

import { useState } from "react";
import { useAppStore } from "../../_store/AppStore";

type Status = "available" | "coming_soon";
type Product = { id: number; name: string; price: number; category: string; description: string; status: Status; swatchColor: string };

const emptyProduct: Omit<Product, "id"> = {
  name: "", price: 0, category: "", description: "",
  status: "available" as Status, swatchColor: "#0B1E3D",
};

const categories = ["Outerwear", "Tops", "Bottoms", "Accessories", "Footwear", "Gear"];

function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>{children}</p>;
}

export default function AdminShopPage() {
  const { products: items, setProducts } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<Product, "id">>({ ...emptyProduct });
  const [editForm, setEditForm] = useState<Omit<Product, "id">>({ ...emptyProduct });

  function setF(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: field === "price" ? Number(e.target.value) : e.target.value }));
  }
  function setEF(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setEditForm(f => ({ ...f, [field]: field === "price" ? Number(e.target.value) : e.target.value }));
  }

  function handleAdd() {
    if (!form.name.trim()) return;
    setProducts([...items, { ...form, id: Date.now() }]);
    setForm({ ...emptyProduct });
    setAdding(false);
  }

  function startEdit(p: Product) {
    setEditForm({ name: p.name, price: p.price, category: p.category, description: p.description, status: p.status, swatchColor: p.swatchColor });
    setEditingId(p.id);
  }

  function handleSaveEdit() {
    setProducts(items.map(p => p.id === editingId ? { ...p, ...editForm } : p));
    setEditingId(null);
  }

  function toggleStatus(id: number) {
    setProducts(items.map(p => p.id === id ? { ...p, status: p.status === "available" ? "coming_soon" : "available" } : p));
  }

  function ProductForm({ f, set, onSubmit, onCancel, submitLabel }: {
    f: Omit<Product, "id">;
    set: (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
    onSubmit: () => void; onCancel: () => void; submitLabel: string;
  }) {
    return (
      <div className="ta-adm-card" style={{ padding: "20px 24px", border: "1.5px solid #C9A84C" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <Label>Product Name</Label>
            <input className="ta-adm-input" placeholder="Product name" value={f.name} onChange={set("name")} />
          </div>
          <div>
            <Label>Price ($)</Label>
            <input className="ta-adm-input" type="number" placeholder="0" value={f.price} onChange={set("price")} />
          </div>
          <div>
            <Label>Category</Label>
            <select className="ta-adm-select" value={f.category} onChange={set("category")}>
              <option value="">Select…</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label>Status</Label>
            <select className="ta-adm-select" value={f.status} onChange={set("status")}>
              <option value="available">Available</option>
              <option value="coming_soon">Coming Soon</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / 4" }}>
            <Label>Description</Label>
            <input className="ta-adm-input" placeholder="Short product description" value={f.description} onChange={set("description")} />
          </div>
          <div>
            <Label>Swatch Color</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: f.swatchColor, border: "1px solid rgba(0,0,0,0.1)", flexShrink: 0 }} />
              <input className="ta-adm-input" value={f.swatchColor} onChange={set("swatchColor")} style={{ fontFamily: "monospace", fontSize: 12 }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "9px 20px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={onSubmit} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: "#0B1E3D", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{submitLabel}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ta-adm-page">
      <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid #E8E4DC", background: "#FFFFFF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0A0A0A" }}>Shop</h1>
          <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>{items.length} products &middot; {items.filter(p => p.status === "available").length} available</p>
        </div>
        {!adding && editingId === null && (
          <button onClick={() => setAdding(true)} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#0B1E3D", color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Product
          </button>
        )}
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        {adding && (
          <ProductForm f={form} set={setF} onSubmit={handleAdd} onCancel={() => { setAdding(false); setForm({ ...emptyProduct }); }} submitLabel="Add Product" />
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {items.map((p) => {
            const isEditing = editingId === p.id;
            if (isEditing) return (
              <div key={p.id} style={{ gridColumn: "1 / -1" }}>
                <ProductForm f={editForm} set={setEF} onSubmit={handleSaveEdit} onCancel={() => setEditingId(null)} submitLabel="Save Changes" />
              </div>
            );

            const isDeleting = deletingId === p.id;
            return (
              <div key={p.id} className="ta-adm-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: p.swatchColor, border: "1px solid rgba(0,0,0,0.08)" }} />
                  <label className="ta-adm-toggle" title="Toggle availability">
                    <input type="checkbox" checked={p.status === "available"} onChange={() => toggleStatus(p.id)} />
                    <span className="ta-adm-toggle-track" />
                  </label>
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#0A0A0A" }}>{p.name}</p>
                  <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{p.category}</p>
                  <p style={{ fontSize: 12, color: "#4B5563", marginTop: 4, lineHeight: 1.4 }}>{p.description}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ fontSize: 18, fontWeight: 800, color: "#0A0A0A" }}>${p.price}</p>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                    background: p.status === "available" ? "rgba(22,101,52,0.09)" : "rgba(107,114,128,0.1)",
                    color: p.status === "available" ? "#166534" : "#6B7280",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    {p.status === "available" ? "Available" : "Coming Soon"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                  <button onClick={() => startEdit(p as Product)} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                  {isDeleting ? (
                    <div style={{ display: "flex", gap: 6, flex: 1 }}>
                      <button onClick={() => { setProducts(items.filter(x => x.id !== p.id)); setDeletingId(null); }} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "rgba(220,38,38,0.08)", color: "#DC2626", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                      <button onClick={() => setDeletingId(null)} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#FFFFFF", color: "#6B7280", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeletingId(p.id)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "transparent", color: "#9CA3AF", fontSize: 12, cursor: "pointer" }}>✕</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {items.length === 0 && !adding && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF" }}>
            <p style={{ fontSize: 15, fontWeight: 600 }}>No products yet</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Click &quot;Add Product&quot; to add your first item.</p>
          </div>
        )}
      </div>
    </div>
  );
}
