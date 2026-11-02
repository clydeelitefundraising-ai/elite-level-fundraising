import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimitStrict, identifierRateLimitKey, rateLimitKey } from "@/lib/rateLimit";
import { sendPreviewLeadNotification } from "@/lib/email";
import { previewLeadStore } from "@/lib/platform/previewLeads";
import { isBot, isSameOrigin, previewLeadReadiness, recordPreviewLead, validatePreviewLead } from "@/lib/marketing/previewLead";

// Fundraising-preview lead capture (name + email unlock a FICTIONAL sample
// fundraiser; marketing consent is separate and optional). Writes one CRM
// contact/activity and emails the configured business inbox only.
//
// Not an open CRM-writing endpoint:
//   - refuses everything (503) until previewLeadReadiness() is satisfied —
//     durable rate limiting, the business inbox and the explicit
//     MARKETING_PREVIEW_LEAD_GATE=on switch (set only after the consent
//     migration is applied to that environment);
//   - same-origin browser posts only;
//   - honeypot;
//   - rate limits per IP and per (hashed) email that FAIL CLOSED.

const IP_LIMIT = { limit: 5, windowSeconds: 60 * 60 };
const EMAIL_LIMIT = { limit: 3, windowSeconds: 60 * 60 };

export async function POST(req: NextRequest) {
  const readiness = previewLeadReadiness(process.env);
  if (!readiness.ready) {
    return NextResponse.json({ ok: false, error: "The preview sign-up isn't available right now." }, { status: 503 });
  }

  if (!isSameOrigin(req.headers.get("origin"), req.headers.get("host"))) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 403 });
  }
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  // Bots get a success-shaped answer and nothing is stored or sent.
  if (isBot(body)) return NextResponse.json({ ok: true });

  const ipLimit = await consumeRateLimitStrict(rateLimitKey("marketing-preview-lead", req), IP_LIMIT);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfter) } },
    );
  }

  const parsed = validatePreviewLead(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 400 });

  const emailHash = createHash("sha256").update(parsed.value.email).digest("hex");
  const emailLimit = await consumeRateLimitStrict(identifierRateLimitKey("marketing-preview-lead-email", emailHash), EMAIL_LIMIT);
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(emailLimit.retryAfter) } },
    );
  }

  try {
    await recordPreviewLead(parsed.value, {
      store: previewLeadStore,
      notify: sendPreviewLeadNotification,
      notifyTo: process.env.DEMO_NOTIFICATION_EMAIL as string,
    });
  } catch (err) {
    console.error("[preview-lead] could not record lead:", err);
    return NextResponse.json({ ok: false, error: "Something went wrong on our end. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
