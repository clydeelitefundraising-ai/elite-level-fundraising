import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

type CartInput = { product_id: string; variant_id?: string | null; quantity: number };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });

  const { cart }: { cart: CartInput[] } = await req.json();
  if (!Array.isArray(cart) || cart.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  // Fetch all visible products + variants for this slug
  const productsRes = await fetch(
    `${BASE}/rest/v1/team_products?campaign_slug=eq.${encodeURIComponent(slug)}&visible=eq.true&select=*,variants:team_product_variants(id,name,price_delta)`,
    { headers: h(), cache: "no-store" },
  );
  if (!productsRes.ok) return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  const products: Record<string, { name: string; price_cents: number; variants: { id: string; name: string; price_delta: number }[] }> =
    Object.fromEntries((await productsRes.json()).map((p: { id: string; name: string; price_cents: number; variants: { id: string; name: string; price_delta: number }[] }) => [p.id, p]));

  // Build validated line items and order item rows
  type LineItem  = { name: string; unit_cents: number; quantity: number };
  type OrderItem = { product_id: string; variant_id: string | null; product_name: string; variant_name: string | null; price_cents: number; quantity: number };

  const lineItems:  LineItem[]  = [];
  const orderItems: OrderItem[] = [];

  for (const item of cart) {
    const product = products[item.product_id];
    if (!product) return NextResponse.json({ error: "Product not found or unavailable" }, { status: 400 });

    let unitCents   = product.price_cents;
    let variantName: string | null = null;

    if (item.variant_id) {
      const v = product.variants?.find(v => v.id === item.variant_id);
      if (!v) return NextResponse.json({ error: "Variant not found" }, { status: 400 });
      unitCents  += v.price_delta;
      variantName = v.name;
    }

    const qty         = Math.max(1, Math.floor(item.quantity ?? 1));
    const displayName = variantName ? `${product.name} — ${variantName}` : product.name;

    lineItems.push({ name: displayName, unit_cents: unitCents, quantity: qty });
    orderItems.push({ product_id: item.product_id, variant_id: item.variant_id ?? null, product_name: product.name, variant_name: variantName, price_cents: unitCents, quantity: qty });
  }

  const totalCents = orderItems.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  const orderId    = crypto.randomUUID();

  // Build Stripe checkout session
  const origin = (req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const sp = new URLSearchParams({
    mode:              "payment",
    "payment_method_types[0]": "card",
    customer_creation: "always",
    success_url:       `${origin}/team/${slug}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:        `${origin}/team/${slug}/shop`,
    "metadata[order_id]":       orderId,
    "metadata[campaign_slug]":  slug,
  });

  lineItems.forEach((item, i) => {
    sp.set(`line_items[${i}][price_data][currency]`,              "usd");
    sp.set(`line_items[${i}][price_data][product_data][name]`,    item.name);
    sp.set(`line_items[${i}][price_data][unit_amount]`,           String(item.unit_cents));
    sp.set(`line_items[${i}][quantity]`,                          String(item.quantity));
  });

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: sp.toString(),
  });
  const session = await stripeRes.json();
  if (!stripeRes.ok) return NextResponse.json({ error: session.error?.message ?? "Stripe error" }, { status: 500 });

  // Create order record (pre-paid, status: pending)
  await fetch(`${BASE}/rest/v1/team_orders`, {
    method: "POST",
    headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ id: orderId, campaign_slug: slug, stripe_session_id: session.id, status: "pending", total_cents: totalCents }),
  });

  // Create order items in batch
  await fetch(`${BASE}/rest/v1/team_order_items`, {
    method: "POST",
    headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify(orderItems.map(item => ({ order_id: orderId, ...item }))),
  });

  return NextResponse.json({ url: session.url });
}
