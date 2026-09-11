import { NextRequest, NextResponse } from "next/server";
import { validateAthleteForCampaign } from "@/lib/platform/athletes";
import { validateCoachForCampaign, getCoachById } from "@/lib/platform/coachFundraising";
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

  const { amountCents, athleteName, athleteId, coachId, donorName, donationMessage, campaignSlug } =
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

  // A donation is never attributed to both an athlete and a coach — reject
  // outright rather than silently picking one.
  if (athleteId && coachId) {
    return NextResponse.json({ error: "A donation cannot be credited to both an athlete and a coach." }, { status: 400 });
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

  // Coach attribution — same never-trust-the-client shape as athletes
  // above: re-validate the coach is an ACTIVE fundraising participant in
  // THIS campaign (allow_coach_fundraising must also be true) and derive
  // the display name server-side. An ineligible/deselected/stale coach id
  // is silently dropped, exactly like an invalid athleteId, rather than
  // failing checkout.
  let finalCoachId: string | null = null;
  let finalCoachName: string | null = null;
  if (coachId && !finalAthleteId) {
    const eligible = await validateCoachForCampaign(coachId, campaignSlug);
    if (eligible) {
      const coach = await getCoachById(coachId, campaignSlug);
      if (coach) {
        finalCoachId = coach.id;
        finalCoachName = coach.name;
      }
    }
  }

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const campaignUrl = `${origin}/campaign/${campaignSlug}`;

  const productName = finalAthleteName
    ? `Donation for ${finalAthleteName}`
    : finalCoachName
    ? `Donation for Coach ${finalCoachName}`
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
  if (finalCoachName)    params.set("metadata[coach_name]",        finalCoachName);
  if (finalCoachId)      params.set("metadata[coach_id]",          finalCoachId);
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
