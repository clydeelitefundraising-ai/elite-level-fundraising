/**
 * Stripe webhook handler — POST /api/webhooks/stripe
 *
 * Donation recording flow (belt-and-suspenders):
 *
 *   Primary path (this file):
 *     Stripe fires checkout.session.completed → we verify signature → insert donation
 *     Covers: donor closes browser before /success loads, network issues, etc.
 *
 *   Fallback path (campaign/[slug]/success/page.tsx):
 *     Donor lands on /success → we re-fetch session from Stripe → insert donation
 *     Covers: webhook delivery delay or temporary failure
 *
 *   Idempotency (two layers):
 *     1. donationExists() — application-level guard, skips the insert if already saved
 *     2. Supabase on_conflict=stripe_session_id + resolution=ignore-duplicates —
 *        database-level guard, safe against concurrent races between webhook + fallback
 *
 *   Result: exactly-once semantics regardless of which path fires first.
 *
 *   Donor receipt email — mirrors the same belt-and-suspenders shape:
 *     Both this webhook and the /success fallback always attempt
 *     sendReceiptForSession() (src/lib/donorReceipt.ts), regardless of
 *     which one performed the donation insert. Idempotency lives at the
 *     provider: every attempt carries the same Resend Idempotency-Key
 *     (`donor-receipt:<stripe_session_id>`), so Resend collapses any
 *     repeat within its 24h dedupe window to a single delivered email —
 *     no DB column/state needed. This also means a transient Resend
 *     failure on whichever path ran first still gets a real second
 *     attempt from the other path, instead of being silently dropped.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY        — used by /api/checkout (not here)
 *   STRIPE_WEBHOOK_SECRET    — whsec_... from Stripe Dashboard → Webhooks
 */

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { insertDonation, donationExists } from "@/lib/supabase";
import { sendReceiptForSession } from "@/lib/donorReceipt";

// Force Node.js runtime — required for Node crypto (createHmac, timingSafeEqual)
// and to ensure req.text() returns the unmodified raw body Stripe signed.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verifies the Stripe-Signature header using HMAC-SHA256.
 *
 * Stripe signs webhooks with:
 *   Stripe-Signature: t=<unix-ts>,v1=<hex-hmac>[,v0=<old-hmac>]
 *
 * Algorithm:
 *   signedPayload = "<timestamp>.<rawBody>"
 *   expected      = HMAC-SHA256(webhookSecret, signedPayload)
 *   valid         = timingSafeEqual(expected, v1)
 *
 * Replay protection: reject events with a timestamp older than 5 minutes.
 */
function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
): boolean {
  const parts = sigHeader.split(",");
  const t  = parts.find(p => p.startsWith("t="))?.slice(2);
  const v1 = parts.find(p => p.startsWith("v1="))?.slice(3);

  if (!t || !v1) return false;

  // Replay protection — 5-minute tolerance matches Stripe's own CLI default
  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(t, 10));
  if (age > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`, "utf8")
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    // Buffer lengths differ — signature is malformed
    return false;
  }
}

// ---------------------------------------------------------------------------
// Stripe session type (only the fields we use)
// ---------------------------------------------------------------------------

interface StripeCheckoutSession {
  id:             string;
  payment_status: string;
  amount_total:   number;
  customer_details?: {
    email?: string;
    name?:  string;
  };
  metadata: {
    donor_name?:       string;
    athlete_name?:     string;
    athlete_id?:       string;
    donation_message?: string;
    campaign_slug?:    string;
  };
}

interface StripeEvent {
  type: string;
  data: { object: StripeCheckoutSession };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // ── 1. Read raw body — MUST use req.text(), not req.json().
  //       Stripe verifies the exact bytes it sent; parsing first corrupts them.
  const rawBody = await req.text();

  // ── 2. Validate required env var
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // ── 3. Verify signature
  const sigHeader = req.headers.get("stripe-signature") ?? "";
  if (!verifyStripeSignature(rawBody, sigHeader, webhookSecret)) {
    // Return 400, not 500 — this is not retryable; a bad signature means
    // the event is not from Stripe (or the secret is wrong).
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── 4. Parse event (safe now that signature is verified)
  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── 5. Ignore all event types except checkout.session.completed.
  //       Return 200 so Stripe stops retrying unhandled event types.
  if (event.type !== "checkout.session.completed") {
    console.log("[stripe-webhook] ignoring event type:", event.type);
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;

  // ── 6. Only record confirmed payments
  if (session.payment_status !== "paid") {
    console.log("[stripe-webhook] skipping session", session.id, "payment_status:", session.payment_status);
    return NextResponse.json({ received: true });
  }

  // ── 7. Idempotency — layer 1: application-level pre-check.
  //       Avoids a DB write (and log noise) when the /success fallback already saved it.
  //       Only skips the INSERT below — the receipt attempt still runs
  //       either way (see step 9), so a transient Resend failure on
  //       whichever path ran first still gets a second, safe-to-repeat
  //       attempt here rather than being silently dropped forever.
  let alreadySaved = false;
  try {
    alreadySaved = await donationExists(session.id);
  } catch (err) {
    // donationExists failure is non-fatal — proceed to insert.
    // The DB-level constraint (layer 2) will handle any race.
    console.error("[stripe-webhook] donationExists check failed:", err);
  }

  if (!alreadySaved) {
    // ── 8. Insert donation.
    //       Idempotency layer 2: Supabase on_conflict + resolution=ignore-duplicates
    //       makes this safe if webhook and fallback reach insertDonation concurrently.
    //
    //       Return 500 on failure → Stripe will retry with exponential backoff
    //       (up to 72 hours), giving the DB time to recover.
    try {
      await insertDonation({
        stripe_session_id: session.id,
        donor_name:        session.metadata?.donor_name       ?? null,
        amount_cents:      session.amount_total,
        athlete_name:      session.metadata?.athlete_name     ?? null,
        athlete_id:        session.metadata?.athlete_id       ?? null,
        donation_message:  session.metadata?.donation_message ?? null,
        campaign_slug:     session.metadata?.campaign_slug    ?? null,
      });
      console.log("[stripe-webhook] donation saved, session:", session.id, "amount:", session.amount_total);
    } catch (err) {
      console.error("[stripe-webhook] insertDonation failed:", err);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
  }

  // ── 9. Donor receipt email — fire-and-forget, never blocks Stripe's 200.
  //       Idempotency-keyed on stripe_session_id (see donorReceipt.ts), so
  //       this always runs — whether or not THIS request performed the
  //       insert above — safe to attempt even if the /success fallback
  //       already sent (or is concurrently sending) the same receipt.
  void sendReceiptForSession({
    stripeSessionId: session.id,
    donorEmail:      session.customer_details?.email,
    donorName:       session.metadata?.donor_name,
    amountCents:     session.amount_total,
    athleteName:     session.metadata?.athlete_name,
    campaignSlug:    session.metadata?.campaign_slug,
  });

  return NextResponse.json({ received: true, duplicate: alreadySaved });
}
