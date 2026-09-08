import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseMemberId, verifyMemberCookie } from "@/lib/memberAuth";
import { generateAccountSalt, hashAccountPassword, makeAccountCookie } from "@/lib/accountAuth";
import { checkRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

const LIMIT = { limit: 10, windowSeconds: 60 * 15 };

// Identity Compatibility Phase — member-side equivalent of
// /api/auth/coach-activate. team_members.account_id has been nullable
// (and indexed) since before this phase; the gap this closes is that
// pre-modernization members (created via /api/team/[slug]/join, the
// legacy team-code path with no account_id set) had NO way to link into
// elf_accounts/elf_session, so getAccountTeams() — which resolves purely
// by account_id — could never see them or any other team they're on.
//
// Unlike the coach flow, this is NOT token-based. A legacy member doesn't
// re-enter credentials each visit; their only proof of identity is the
// long-lived team_member cookie already bound to one specific row (see
// memberAuth.ts's HMAC-style verifyMemberCookie). That cookie IS the
// single-record, already-authenticated identity this phase's "explicit,
// record-specific" linking requirement calls for — introducing a second,
// token-based mechanism on top of it would be redundant, not safer.
// Nothing here matches or merges by email in bulk: the target row is
// fixed by the verified cookie before any account lookup happens.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const key = rateLimitKey("member-activate", req);
  const rl  = await checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const store = await cookies();
  const cookieValue = store.get("team_member")?.value;
  const memberId = parseMemberId(cookieValue);
  if (!memberId) {
    return NextResponse.json({ error: "You must be signed in to this team to activate an ELF account." }, { status: 401 });
  }

  const memberRes = await fetch(
    `${BASE}/rest/v1/team_members?id=eq.${encodeURIComponent(memberId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,email,salt,account_id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!memberRes.ok) return NextResponse.json({ error: "Activation failed." }, { status: 500 });

  const memberRows = await memberRes.json();
  if (!Array.isArray(memberRows) || memberRows.length === 0) {
    return NextResponse.json({ error: "You must be signed in to this team to activate an ELF account." }, { status: 401 });
  }
  const member = memberRows[0] as { id: string; name: string; email: string | null; salt: string; account_id: string | null };

  if (!verifyMemberCookie(cookieValue, member.id, member.salt)) {
    return NextResponse.json({ error: "You must be signed in to this team to activate an ELF account." }, { status: 401 });
  }

  if (member.account_id) {
    return NextResponse.json({ ok: true, alreadyLinked: true });
  }

  const body = await req.json().catch(() => null);
  const submittedEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const onFileEmail    = member.email ? member.email.trim().toLowerCase() : "";

  // SECURITY: the existing-account lookup/link below must NEVER be driven by
  // a client-submitted email — only by the email already on this verified
  // team_members row. The verified team_member cookie proves the caller owns
  // *this* row, not any particular email address; if a client-chosen email
  // were allowed to steer which elf_accounts row gets linked, anyone holding
  // a valid (even low-privilege) team_member cookie could type in a
  // different real person's email and silently link their row to that
  // person's existing account with zero proof of ownership (no password
  // check happens in the link-to-existing-account branch, by design, same as
  // coach-activate). coach-activate avoids this because it only ever uses
  // the coach's own DB-verified email, never client input — mirror that here.
  // A client-submitted email is only ever used below to CREATE a brand-new
  // account when this member has no email on file — that can only create a
  // new row, never hijack an existing one, so it's safe.
  const targetEmail = onFileEmail || submittedEmail;
  if (!targetEmail) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const password = typeof body?.password === "string" ? body.password : undefined;

  // Check for an existing elf_accounts row — scoped to onFileEmail only
  // (never submittedEmail). If this member has no email on file, there is no
  // existing identity to protect, so we skip straight to account creation.
  let existingAccount: { id: string; salt: string } | null = null;
  if (onFileEmail) {
    const existingRes = await fetch(
      `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(onFileEmail)}&select=id,salt&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const existingRows = existingRes.ok ? await existingRes.json() : [];
    existingAccount = Array.isArray(existingRows) && existingRows.length > 0
      ? (existingRows[0] as { id: string; salt: string })
      : null;
  }

  let accountId: string;
  let newCookieValue: string | null = null;

  if (existingAccount) {
    // Link without minting a new session — the member must log in at
    // /login with their existing password, same as coach-activate.
    accountId = existingAccount.id;
  } else {
    if (!password || password.length < 8) {
      await recordFailure(key, LIMIT);
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    const salt          = generateAccountSalt();
    const password_hash = hashAccountPassword(password, salt);

    const acctRes = await fetch(`${BASE}/rest/v1/elf_accounts`, {
      method:  "POST",
      headers: h({ Prefer: "return=representation" }),
      body:    JSON.stringify({ email: targetEmail, name: member.name, password_hash, salt }),
    });
    if (!acctRes.ok) {
      const msg = await acctRes.text();
      if (msg.includes("23505") || msg.includes("unique")) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please log in instead." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Account creation failed." }, { status: 500 });
    }
    const acctRows = await acctRes.json();
    const newAcct  = acctRows[0] as { id: string; salt: string };
    accountId      = newAcct.id;
    newCookieValue = makeAccountCookie(newAcct.id, newAcct.salt);
  }

  // Atomic claim: only link if this exact row is still unlinked. Scoped to
  // member.id (the one row the verified cookie proved ownership of) — never
  // a bulk update, never matched by email. If a concurrent request already
  // linked it, this affects zero rows and the response below still reports
  // success rather than surfacing a confusing race error to the user.
  const linkRes = await fetch(
    `${BASE}/rest/v1/team_members?id=eq.${encodeURIComponent(member.id)}&account_id=is.null`,
    {
      method:  "PATCH",
      headers: h({ Prefer: "return=representation" }),
      body:    JSON.stringify({ account_id: accountId }),
    },
  );
  if (!linkRes.ok) return NextResponse.json({ error: "Activation failed." }, { status: 500 });

  const response = NextResponse.json({ ok: true, existingAccount: !!existingAccount });
  if (newCookieValue) {
    response.cookies.set("elf_session", newCookieValue, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "strict",
      path:     "/",
      maxAge:   60 * 60 * 24 * 30,
    });
  }
  return response;
}
