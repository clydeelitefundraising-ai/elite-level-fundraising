import { redirect } from "next/navigation";
import type { TeamOrderRow } from "@/lib/teamData";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function fmt(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export default async function ShopSuccessPage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { slug }       = await params;
  const { session_id } = await searchParams;

  if (!session_id) redirect(`/team/${slug}/shop`);

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) redirect(`/team/${slug}/shop`);

  // Fetch Stripe session
  const stripeRes = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${session_id}`,
    { headers: { Authorization: `Bearer ${secretKey}` }, cache: "no-store" },
  );
  if (!stripeRes.ok) redirect(`/team/${slug}/shop`);
  const session = await stripeRes.json();

  if (session.payment_status !== "paid") redirect(`/team/${slug}/shop`);

  const orderId      = session.metadata?.order_id as string | undefined;
  const campaignSlug = session.metadata?.campaign_slug as string | undefined;
  if (!orderId || campaignSlug !== slug) redirect(`/team/${slug}/shop`);

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const h   = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" };

  // Update order: status → paid, customer info (idempotent)
  await fetch(
    `${BASE}/rest/v1/team_orders?id=eq.${encodeURIComponent(orderId)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: h,
      body: JSON.stringify({
        status:         "paid",
        customer_name:  session.customer_details?.name  ?? null,
        customer_email: session.customer_details?.email ?? null,
      }),
    },
  );

  // Fetch order + items for display
  const orderRes = await fetch(
    `${BASE}/rest/v1/team_orders?id=eq.${encodeURIComponent(orderId)}&select=*,items:team_order_items(id,product_name,variant_name,price_cents,quantity)&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
  );
  const orders: TeamOrderRow[] = orderRes.ok ? await orderRes.json() : [];
  const order = orders[0] ?? null;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both", paddingTop: ".5rem" }}>
      {/* Hero */}
      <div style={{
        background: "#fff", borderRadius: 16, padding: "2rem 1.25rem 1.5rem",
        textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderTop: "4px solid #059669", marginBottom: ".75rem",
      }}>
        <div style={{ fontSize: "2.5rem", marginBottom: ".65rem" }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: "1.25rem", color: "#0b1e3d", marginBottom: ".35rem" }}>
          Order Confirmed!
        </div>
        <p style={{ margin: "0 0 .75rem", fontSize: ".85rem", color: "#6b7280", lineHeight: 1.6 }}>
          Thank you for your purchase. Your coach will be in touch about pickup or delivery.
        </p>
        {order?.customer_email && (
          <div style={{ fontSize: ".78rem", color: "#9ca3af" }}>
            Confirmation sent to <strong style={{ color: "#374151" }}>{order.customer_email}</strong>
          </div>
        )}
      </div>

      {/* Order summary */}
      {order && (
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".75rem" }}>
          <div style={{ padding: ".75rem 1.25rem .55rem", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Order Summary
            </div>
          </div>
          <div style={{ padding: ".25rem 0" }}>
            {order.items.map((item, i) => (
              <div key={item.id ?? i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: ".55rem 1.25rem",
                borderBottom: i < order.items.length - 1 ? "1px solid #f9fafb" : "none",
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: ".83rem", color: "#0b1e3d" }}>
                    {item.product_name}{item.variant_name ? ` — ${item.variant_name}` : ""}
                    {item.quantity > 1 && <span style={{ color: "#9ca3af", fontWeight: 400 }}> ×{item.quantity}</span>}
                  </div>
                </div>
                <div style={{ fontWeight: 800, fontSize: ".88rem", color: "#0b1e3d" }}>
                  {fmt(item.price_cents * item.quantity)}
                </div>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: ".6rem 1.25rem", background: "#f8f9fb",
            }}>
              <span style={{ fontWeight: 700, fontSize: ".85rem", color: "#374151" }}>Total</span>
              <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "#059669" }}>{fmt(order.total_cents)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Continue shopping */}
      <a
        href={`/team/${slug}/shop`}
        style={{
          display: "block", width: "100%", padding: ".75rem", boxSizing: "border-box",
          background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 12,
          fontSize: ".9rem", fontWeight: 700, textAlign: "center", textDecoration: "none",
        }}
      >
        ← Back to Shop
      </a>
    </div>
  );
}
