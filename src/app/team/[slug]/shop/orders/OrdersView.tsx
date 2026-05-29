"use client";

import { useState } from "react";
import type { TeamOrderRow } from "@/lib/teamData";

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function dateStr(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_META = {
  paid:      { label: "Paid",      bg: "#dbeafe", color: "#1d4ed8" },
  fulfilled: { label: "Fulfilled", bg: "#d1fae5", color: "#065f46" },
  cancelled: { label: "Cancelled", bg: "#fee2e2", color: "#dc2626" },
} as const;

type Status = keyof typeof STATUS_META;

export default function OrdersView({
  slug,
  initialOrders,
  coachName,
}: {
  slug:          string;
  initialOrders: TeamOrderRow[];
  coachName:     string;
}) {
  const [orders,   setOrders]   = useState<TeamOrderRow[]>(initialOrders);
  const [updating, setUpdating] = useState<string | null>(null);

  const updateStatus = async (id: string, status: Status) => {
    setUpdating(id);
    const res = await fetch(`/api/team/${slug}/shop/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setUpdating(null);
    if (res.ok) setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };

  const paidCount      = orders.filter(o => o.status === "paid").length;
  const fulfilledCount = orders.filter(o => o.status === "fulfilled").length;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* Header */}
      <div style={{ marginBottom: ".75rem" }}>
        <a
          href={`/team/${slug}/shop`}
          style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", fontSize: ".78rem", fontWeight: 600, color: "#6b7280", textDecoration: "none", marginBottom: ".35rem" }}
        >
          ← Shop
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>Orders</h2>
          {orders.length > 0 && (
            <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {orders.length}
            </span>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {orders.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem", marginBottom: ".75rem" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: ".75rem 1rem", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0b1e3d" }}>{paidCount}</div>
            <div style={{ fontSize: ".68rem", color: "#9ca3af", marginTop: ".1rem" }}>To fulfil</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: ".75rem 1rem", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#059669" }}>
              {fmt(orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.total_cents, 0))}
            </div>
            <div style={{ fontSize: ".68rem", color: "#9ca3af", marginTop: ".1rem" }}>Total revenue</div>
          </div>
        </div>
      )}

      {/* Order list */}
      {orders.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, padding: "3rem 1.5rem", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
          <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .3 }}>📦</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151" }}>No orders yet</div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af", marginTop: ".3rem" }}>Orders appear here once customers complete checkout.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
          {orders.map(order => {
            const meta = STATUS_META[order.status as Status] ?? STATUS_META.paid;
            const busy = updating === order.id;
            return (
              <div
                key={order.id}
                style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}
              >
                {/* Order header */}
                <div style={{ padding: ".7rem 1rem .55rem", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#0b1e3d" }}>
                      {order.customer_name ?? "Customer"}
                    </div>
                    {order.customer_email && (
                      <div style={{ fontSize: ".68rem", color: "#9ca3af" }}>{order.customer_email}</div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ ...meta, fontSize: ".62rem", fontWeight: 700, borderRadius: 100, padding: ".18rem .5rem", display: "inline-block" }}>
                      {meta.label}
                    </span>
                    <div style={{ fontSize: ".65rem", color: "#9ca3af", marginTop: ".2rem" }}>{dateStr(order.created_at)}</div>
                  </div>
                </div>

                {/* Items */}
                <div style={{ padding: ".4rem 1rem" }}>
                  {order.items.map((item, i) => (
                    <div key={item.id ?? i} style={{ display: "flex", justifyContent: "space-between", padding: ".3rem 0", borderBottom: i < order.items.length - 1 ? "1px solid #f9fafb" : "none" }}>
                      <span style={{ fontSize: ".78rem", color: "#374151" }}>
                        {item.product_name}{item.variant_name ? ` — ${item.variant_name}` : ""}
                        {item.quantity > 1 && <span style={{ color: "#9ca3af" }}> ×{item.quantity}</span>}
                      </span>
                      <span style={{ fontSize: ".78rem", fontWeight: 700, color: "#0b1e3d" }}>{fmt(item.price_cents * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                {/* Total + actions */}
                <div style={{ padding: ".55rem 1rem .7rem", background: "#f9fafb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 800, fontSize: ".92rem", color: "#059669" }}>{fmt(order.total_cents)}</span>
                  <div style={{ display: "flex", gap: ".35rem" }}>
                    {order.status === "paid" && (
                      <button
                        onClick={() => updateStatus(order.id, "fulfilled")}
                        disabled={busy}
                        style={{ padding: ".35rem .75rem", background: "#059669", color: "#fff", border: "none", borderRadius: 8, fontSize: ".72rem", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}
                      >
                        {busy ? "…" : "Mark Fulfilled"}
                      </button>
                    )}
                    {order.status !== "cancelled" && (
                      <button
                        onClick={() => { if (confirm("Cancel this order?")) updateStatus(order.id, "cancelled"); }}
                        disabled={busy}
                        style={{ padding: ".35rem .75rem", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, fontSize: ".72rem", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? .6 : 1 }}
                      >
                        Cancel
                      </button>
                    )}
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
