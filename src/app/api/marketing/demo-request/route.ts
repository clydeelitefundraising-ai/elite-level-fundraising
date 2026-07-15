import { NextRequest, NextResponse } from "next/server";
import { restInsert } from "@/lib/platform/_client";
import { sendDemoRequestConfirmation, sendDemoRequestNotification } from "@/lib/email";
import { consumeRateLimit, getClientIp, rateLimitKey } from "@/lib/rateLimit";

// Isolated marketing lead-capture endpoint. Writes only to
// marketing_demo_requests (no FK relationship to any Team App table) and
// sends email via the existing Resend integration. Nothing here touches
// auth, Stripe, or campaign code.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD = 200;
const MAX_MESSAGE = 2000;

interface DemoRequestRow {
  id: string;
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  // Honeypot — a hidden field real visitors never fill in.
  if (clean(body.website, MAX_FIELD).length > 0) {
    // Report success to the bot without doing any work.
    return NextResponse.json({ ok: true });
  }

  const rl = await consumeRateLimit(rateLimitKey("marketing-demo-request", req), {
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const firstName = clean(body.firstName, MAX_FIELD);
  const lastName = clean(body.lastName, MAX_FIELD);
  const schoolName = clean(body.schoolName, MAX_FIELD);
  const sportProgram = clean(body.sportProgram, MAX_FIELD);
  const email = clean(body.email, MAX_FIELD);
  const role = clean(body.role, MAX_FIELD);
  const message = clean(body.message, MAX_MESSAGE);

  const errors: Record<string, string> = {};
  if (!firstName) errors.firstName = "First name is required.";
  if (!lastName) errors.lastName = "Last name is required.";
  if (!schoolName) errors.schoolName = "School or organization name is required.";
  if (!role) errors.role = "Please select your role.";
  if (!email) errors.email = "Email address is required.";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  let inserted: DemoRequestRow[];
  try {
    inserted = await restInsert<DemoRequestRow>("marketing_demo_requests", {
      first_name: firstName,
      last_name: lastName,
      school_name: schoolName,
      sport_program: sportProgram || null,
      email,
      role,
      message: message || null,
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent") ?? null,
    });
  } catch (err) {
    console.error("[demo-request] insert failed:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong on our end. Please try again or email us directly." },
      { status: 500 },
    );
  }

  // Lead is captured — email delivery is best-effort from here on.
  const notifyTo = process.env.DEMO_NOTIFICATION_EMAIL;
  if (notifyTo) {
    try {
      await sendDemoRequestNotification({
        to: notifyTo,
        firstName,
        lastName,
        schoolName,
        sportProgram: sportProgram || null,
        email,
        role,
        message: message || null,
      });
    } catch (err) {
      console.error("[demo-request] notification email failed:", err);
    }
  } else {
    console.error("[demo-request] DEMO_NOTIFICATION_EMAIL is not set — skipping notification email");
  }

  try {
    await sendDemoRequestConfirmation({ to: email, firstName });
  } catch (err) {
    console.error("[demo-request] confirmation email failed:", err);
  }

  return NextResponse.json({ ok: true, id: inserted[0]?.id });
}
