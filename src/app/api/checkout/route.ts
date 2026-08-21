import { NextRequest, NextResponse } from "next/server";
import { validateAthleteForCampaign } from "@/lib/platform/athletes";
import { consumeRateLimit, rateLimitKey } from "@/lib/rateLimit";
import { getDonationAmountError } from "@/lib/checkoutLimits";

export async function POST(req: NextRequest) {
  const rl = await consumeRateLimit(rateLimitKey("checkout", req), {
    limit: 10,
    windowSeconds: 600, // 10 requests / 10 minutes per IP
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const { amountCents, athleteName, athleteId, donorName, donationMessage, campaignSlug } =
    await req.json();

  const amountError = getDonationAmountError(amountCents);
  if (amountError) {
    return NextResponse.json({ error: amountError }, { status: 400 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  if (!campaignSlug) {
    return NextResponse.json({ error: "campaignSlug is required." }, { status: 400 });
  }

  // Phase 3A-1 share-path fix: a client-supplied athleteId (from a shared
  // athlete link's ?athlete=<id>) is never trusted blindly — re-validate it
  // belongs to THIS campaign using the same Phase 1A validator already
  // used by members/me and the join endpoints, and derive the canonical
  // name from that row rather than trusting client-supplied free text. An
  // invalid/cross-campaign/nonexistent id is silently dropped (falls back
  // to a general/name-only donation) rather than failing checkout — a
  // stale or tampered link should never block someone from donating.
  let finalAthleteId: string | null = null;
  let finalAthleteName: string | null = typeof athleteName === "string" && athleteName ? athleteName : null;
  if (athleteId) {
    const athlete = await validateAthleteForCampaign(athleteId, campaignSlug);
    if (athlete) {
      finalAthleteId = athlete.id;
      finalAthleteName = athlete.name;
    }
  }

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const campaignUrl = `${origin}/campaign/${campaignSlug}`;

  const productName = finalAthleteName
    ? `Donation for ${finalAthleteName}`
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

  if (donorName)         params.set("metadata[donor_name]",        donorName);
  if (finalAthleteName)  params.set("metadata[athlete_name]",      finalAthleteName);
  if (finalAthleteId)    params.set("metadata[athlete_id]",        finalAthleteId);
  if (donationMessage)   params.set("metadata[donation_message]",  donationMessage);
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
