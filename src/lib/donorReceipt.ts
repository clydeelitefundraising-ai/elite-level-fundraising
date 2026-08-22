// Centralizes donor-receipt delivery so both the Stripe webhook (primary
// path) and the /campaign/[slug]/success fallback send it identically —
// same content, same Resend Idempotency-Key. Whichever path runs first
// (or both, if they race) results in exactly one delivered email: Resend
// dedupes any second request carrying the same Idempotency-Key for 24h,
// which comfortably covers the gap between the two paths (the fallback
// only ever runs when the donor's browser loads /success, itself already
// within seconds/minutes of the webhook firing — nowhere near the 24h
// window). No new DB column/state is needed; the provider-level guarantee
// is sufficient — no schema change accompanies this.
// Relative (not @/) imports — matches this repo's convention for lib
// files that need to stay importable from the plain node:test runner,
// which doesn't resolve the @/ path alias the way Next's bundler does.
import { getCampaignSettings } from "./supabase.ts";
import { sendDonorReceipt } from "./email.ts";

/** Pure — one Resend Idempotency-Key per Stripe checkout session, shared
 *  by every path that might attempt to send this donor's receipt. */
export function receiptIdempotencyKey(stripeSessionId: string): string {
  return `donor-receipt:${stripeSessionId}`;
}

export interface ReceiptSessionInput {
  stripeSessionId: string;
  donorEmail:      string | null | undefined;
  donorName:       string | null | undefined;
  amountCents:     number;
  athleteName:     string | null | undefined;
  campaignSlug:    string | null | undefined;
}

/** Attempts to send the donor receipt for one Stripe session. Never
 *  throws — callers (webhook, success page) must never let a receipt
 *  failure affect donation recording, so all failure handling/logging
 *  happens in here. Returns true if an email was attempted (not
 *  necessarily delivered — Resend may have deduped it, which is the
 *  intended, successful outcome for a repeat attempt). */
export async function sendReceiptForSession(input: ReceiptSessionInput): Promise<boolean> {
  if (!input.donorEmail) return false;

  try {
    const slug     = input.campaignSlug ?? "";
    const settings = slug ? await getCampaignSettings(slug).catch(() => null) : null;
    const teamName = settings
      ? `${settings.school_name} ${settings.mascot} ${settings.sport_name}`.trim()
      : "the team";
    const appBase     = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const campaignUrl = slug ? `${appBase}/campaign/${slug}` : appBase;

    await sendDonorReceipt({
      to:             input.donorEmail,
      donorName:      input.donorName ?? null,
      amountCents:    input.amountCents,
      teamName,
      athleteName:    input.athleteName ?? null,
      campaignUrl,
      idempotencyKey: receiptIdempotencyKey(input.stripeSessionId),
    });
    return true;
  } catch (err) {
    console.error("[donorReceipt] sendReceiptForSession failed:", err);
    return false;
  }
}
