import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit, rateLimitKey } from "@/lib/rateLimit";

// 10 requests per 10 minutes per IP. Every attempt counts — this is an
// unauthenticated, public, payment-adjacent endpoint (creates a live Stripe
// Checkout Session per call), so throttling scripted flooding matters even
// though no charge occurs until Stripe's own hosted checkout is completed.
const LIMIT = { limit: 10, windowSeconds: 60 * 10 };

export async function POST(req: NextRequest) {
  const rl = await consumeRateLimit(rateLimitKey("checkout-create", req), LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const { amountCents, athleteName, athleteId, donorName, donationMessage, campaignSlug } =
    await req.json();

  if (!amountCents || amountCents < 100) {
    return NextResponse.json({ error: "Minimum donation is $1." }, { status: 400 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  if (!campaignSlug) {
    return NextResponse.json({ error: "campaignSlug is required." }, { status: 400 });
  }

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const campaignUrl = `${origin}/campaign/${campaignSlug}`;

  const productName = athleteName
    ? `Donation for ${athleteName}`
    : "Team Fundraiser Donation";

  const params = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": productName,
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][quantity]": "1",
    success_url: `${campaignUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: campaignUrl,
  });

  if (donorName)        params.set("metadata[donor_name]",        donorName);
  if (athleteName)      params.set("metadata[athlete_name]",      athleteName);
  if (athleteId)        params.set("metadata[athlete_id]",        athleteId);
  if (donationMessage)  params.set("metadata[donation_message]",  donationMessage);
  params.set("metadata[campaign_slug]", campaignSlug);

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const session = await stripeRes.json();

  if (!stripeRes.ok) {
    return NextResponse.json(
      { error: session.error?.message ?? "Stripe error." },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: session.url });
}
