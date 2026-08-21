// Pure donation-amount bounds — split out from api/checkout/route.ts so it
// can be unit tested without pulling in next/server (route.ts files aren't
// importable from the plain node:test runner used in this repo).

export const MIN_DONATION_CENTS = 100; // $1.00

// No product requirement defines a donation ceiling today. $10,000 is
// chosen as a sane default: high enough to never block a real major
// donor/booster in this school-sports-fundraising context, low enough to
// catch the two realistic failure modes at this layer — a fat-fingered
// extra zero from the donor, and a scripted/abusive Stripe Checkout
// Session flood (each session created here has a cost/fraud blast radius
// even before any card is charged). Revisit if a real large-gift flow is
// ever built (e.g. major-donor pledges), which should get its own
// deliberately higher-ceilinged path rather than raising this one.
export const MAX_DONATION_CENTS = 1_000_000; // $10,000.00

/** Returns an error message if amountCents is out of range, null if valid. */
export function getDonationAmountError(amountCents: unknown): string | null {
  if (typeof amountCents !== "number" || !amountCents || amountCents < MIN_DONATION_CENTS) {
    return "Minimum donation is $1.";
  }
  if (amountCents > MAX_DONATION_CENTS) {
    return `Maximum donation is $${(MAX_DONATION_CENTS / 100).toLocaleString()}. For a larger gift, please contact us directly.`;
  }
  return null;
}
