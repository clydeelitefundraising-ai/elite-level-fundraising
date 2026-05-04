import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { amountCents, athleteName, donorName, donationMessage, campaignSlug } =
    await req.json();

  if (!amountCents || amountCents < 100) {
    return NextResponse.json({ error: "Minimum donation is $1." }, { status: 400 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const slug = campaignSlug ?? "paradise-valley-track-field-live";
  const campaignUrl = `${origin}/campaign/${slug}`;

  const productName = athleteName
    ? `Donation for ${athleteName} — Paradise Valley Pumas`
    : "Donation — Paradise Valley Pumas Track & Field";

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
  if (donationMessage)  params.set("metadata[donation_message]",  donationMessage);
  params.set("metadata[campaign_slug]", slug);

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
