import { NextRequest, NextResponse } from "next/server";
import { generateAccountSalt, hashAccountPassword, makeAccountCookie, parseAccountId, verifyAccountCookie } from "@/lib/accountAuth";
import { generateMemberSalt } from "@/lib/memberAuth";
import { checkRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";
import { sendMemberWelcome } from "@/lib/email";

// The single, unified join backend — used by both /join/[code] (the link
// coaches actually share) and /enter-code. Every join, new or returning
// account, athlete or parent, goes through this one route. Replaces the old
// account-less /api/team/[slug]/join (see that file for the @deprecated note)
// so there is exactly one code path that creates team_members rows for new
// joiners, instead of two divergent ones.
//
// Every person gets exactly one elf_accounts row, keyed by email. Joining a
// team never creates a second account for an email that already has one —
// see the "existing account" branch below.

const LIMIT = { limit: 10, windowSeconds: 60 * 60 };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

const cookieOpts = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path:     "/",
  maxAge:   60 * 60 * 24 * 30,
};

export async function POST(req: NextRequest) {
  const key = rateLimitKey("account-join", req);
  const rl  = await checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { code, name, email, password, role, athlete_id, athlete_ids } = body as {
    code?: string; name?: string; email?: string; password?: string;
    role?: string; athlete_id?: string; athlete_ids?: string[];
  };

  if (!code?.trim()) return NextResponse.json({ error: "Team code is required." }, { status: 400 });
  if (!name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!["athlete", "parent", "booster"].includes(role ?? "")) {
    return NextResponse.json({ error: "Role must be athlete, parent, or booster." }, { status: 400 });
  }

  // ── Validate join code ──────────────────────────────────────────────────
  const upperCode = code.trim().toUpperCase();
  const codeRes = await fetch(
    `${BASE}/rest/v1/team_join_codes?code=eq.${encodeURIComponent(upperCode)}&revoked=eq.false&select=id,campaign_slug,expires_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!codeRes.ok) return NextResponse.json({ error: "Join failed. Please try again." }, { status: 500 });

  const codeRows = await codeRes.json();
  if (!Array.isArray(codeRows) || codeRows.length === 0) {
    await recordFailure(key, LIMIT);
    return NextResponse.json({ error: "Invalid or expired team code." }, { status: 400 });
  }
  const joinCode = codeRows[0];
  if (joinCode.expires_at && new Date(joinCode.expires_at) < new Date()) {
    await recordFailure(key, LIMIT);
    return NextResponse.json({ error: "This team code has expired." }, { status: 400 });
  }
  const campaign_slug = joinCode.campaign_slug as string;

  // ── Roster selection — required for athlete/parent, validated against this campaign ──
  let claimAthleteId: string | null = null;
  let parentAthleteIds: string[] = [];

  if (role === "athlete") {
    if (!athlete_id) return NextResponse.json({ error: "Please select yourself from the roster." }, { status: 400 });
    const aRes = await fetch(
      `${BASE}/rest/v1/athletes?id=eq.${encodeURIComponent(athlete_id)}&campaign_slug=eq.${encodeURIComponent(campaign_slug)}&select=id&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const aRows = aRes.ok ? await aRes.json() : [];
    if (!Array.isArray(aRows) || aRows.length === 0) {
      return NextResponse.json({ error: "That roster entry could not be found." }, { status: 400 });
    }
    claimAthleteId = athlete_id;
  }

  if (role === "parent") {
    if (!Array.isArray(athlete_ids) || athlete_ids.length === 0) {
      return NextResponse.json({ error: "Please select at least one athlete." }, { status: 400 });
    }
    const list = athlete_ids.map(id => encodeURIComponent(id)).join(",");
    const aRes = await fetch(
      `${BASE}/rest/v1/athletes?id=in.(${list})&campaign_slug=eq.${encodeURIComponent(campaign_slug)}&select=id`,
      { headers: h(), cache: "no-store" },
    );
    const aRows: { id: string }[] = aRes.ok ? await aRes.json() : [];
    parentAthleteIds = aRows.map(r => r.id);
    if (parentAthleteIds.length === 0) {
      return NextResponse.json({ error: "Selected athletes could not be found." }, { status: 400 });
    }
  }

  // ── Roster claim pre-check (athlete role only) — done BEFORE any identity
  // resolution/account creation below, specifically so a rejected claim can
  // never leave an orphaned elf_accounts row behind. The DB partial unique
  // index (team_members_athlete_claim_uniq) remains the authoritative race
  // backstop at insert time further down; this is the "don't even start
  // creating an account for a claim we already know is taken" fast path.
  let claimedByAccountId: string | null = null;
  if (role === "athlete" && claimAthleteId) {
    const claimRes = await fetch(
      `${BASE}/rest/v1/team_members?athlete_id=eq.${encodeURIComponent(claimAthleteId)}&role=eq.athlete&select=account_id&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const claimRows = claimRes.ok ? await claimRes.json() : [];
    if (Array.isArray(claimRows) && claimRows.length > 0) {
      claimedByAccountId = claimRows[0].account_id ?? "unlinked";
    }
  }
  const CLAIM_TAKEN_ERROR = "This athlete already has an account. If this is you, try logging in or use Forgot Password.";

  // ── Identity: reuse an already-logged-in session, or resolve by email ──────
  let accountId: string | null = null;
  let newCookieValue: string | null = null;
  let isNewAccount = false; // true only when this request creates the elf_accounts row itself

  const existingCookie = req.cookies.get("elf_session")?.value;
  if (existingCookie) {
    const parsedId = parseAccountId(existingCookie);
    if (parsedId) {
      const acctRes = await fetch(
        `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(parsedId)}&select=id,salt&limit=1`,
        { headers: h(), cache: "no-store" },
      );
      if (acctRes.ok) {
        const acctRows = await acctRes.json();
        if (Array.isArray(acctRows) && acctRows.length > 0 && verifyAccountCookie(existingCookie, acctRows[0].id, acctRows[0].salt)) {
          accountId = acctRows[0].id as string;
        }
      }
    }
    if (accountId && claimedByAccountId && claimedByAccountId !== accountId) {
      return NextResponse.json({ error: CLAIM_TAKEN_ERROR }, { status: 409 });
    }
  }

  if (!accountId) {
    if (!email?.trim()) return NextResponse.json({ error: "Email is required." }, { status: 400 });
    const normalizedEmail = email.trim().toLowerCase();

    const lookupRes = await fetch(
      `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(normalizedEmail)}&select=id,salt,password_hash&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const lookupRows = lookupRes.ok ? await lookupRes.json() : [];
    const existingAccount = Array.isArray(lookupRows) && lookupRows.length > 0 ? lookupRows[0] : null;

    if (existingAccount) {
      // "We found your existing ELF account" — authenticate inline, never
      // create a second account for this email.
      if (!password) {
        return NextResponse.json({ needsPassword: true, existingAccount: true });
      }
      if (hashAccountPassword(password, existingAccount.salt) !== existingAccount.password_hash) {
        await recordFailure(key, LIMIT);
        return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
      }
      if (claimedByAccountId && claimedByAccountId !== existingAccount.id) {
        return NextResponse.json({ error: CLAIM_TAKEN_ERROR }, { status: 409 });
      }
      accountId = existingAccount.id as string;
      newCookieValue = makeAccountCookie(existingAccount.id as string, existingAccount.salt as string);
    } else {
      if (!password || password.length < 8) {
        return NextResponse.json({ needsPassword: true, existingAccount: false });
      }
      // A brand-new account can never match an existing claim — reject
      // before creating anything if this athlete is already taken.
      if (claimedByAccountId) {
        return NextResponse.json({ error: CLAIM_TAKEN_ERROR }, { status: 409 });
      }
      const salt          = generateAccountSalt();
      const password_hash = hashAccountPassword(password, salt);

      const acctRes = await fetch(`${BASE}/rest/v1/elf_accounts`, {
        method:  "POST",
        headers: h({ Prefer: "return=representation" }),
        body:    JSON.stringify({ email: normalizedEmail, password_hash, salt, name: name.trim() }),
      });

      if (!acctRes.ok) {
        const msg = await acctRes.text();
        if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
          return NextResponse.json(
            { error: "An account with that email already exists. Please try again." },
            { status: 409 },
          );
        }
        return NextResponse.json({ error: "Account creation failed. Please try again." }, { status: 500 });
      }

      const acctRows = await acctRes.json();
      const acct     = acctRows[0];
      accountId      = acct.id as string;
      newCookieValue = makeAccountCookie(acct.id as string, acct.salt as string);
      isNewAccount   = true;
    }
  }

  // ── Coach/athlete conflict guard (pilot scope: athlete role only) ───────
  // A coach's own account must never also claim an athlete profile on the
  // same campaign — that's exactly what produced the Michael Owens incident:
  // a stray team_members(athlete) row on a coach's account shadowed his
  // team_coaches(head_coach) identity via getActorForAccount's
  // member-wins-over-coach precedence. That precedence is NOT changed here
  // (see accountSession.ts) — it's still correct for a legitimate coach+parent
  // account on the same campaign, which stays fully supported. Only
  // coach+self-as-athlete is nonsensical and is blocked before any write.
  // TODO(follow-up architecture): coach+parent on the same campaign still
  // resolves as "member" today because of that same precedence — fine for
  // now (parent view is a reasonable default for a coach who's also a
  // parent), but worth a deliberate design pass if staff-view access is
  // ever needed for that combination too.
  if (role === "athlete") {
    const coachConflictRes = await fetch(
      `${BASE}/rest/v1/team_coaches?account_id=eq.${encodeURIComponent(accountId)}&campaign_slug=eq.${encodeURIComponent(campaign_slug)}&select=id&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const coachConflictRows = coachConflictRes.ok ? await coachConflictRes.json() : [];
    if (Array.isArray(coachConflictRows) && coachConflictRows.length > 0) {
      return NextResponse.json(
        { error: "This account is already a coach on this team. A coach account can't also claim an athlete profile — the athlete needs to sign in or sign up with their own account." },
        { status: 409 },
      );
    }
  }

  // ── Roster claim uniqueness — freshness re-check ────────────────────────
  // The pre-check above already rejects the common case before any account
  // is created. This re-check catches a claim made by someone else in the
  // window between that pre-check and this point; the DB partial unique
  // index (team_members_athlete_claim_uniq) is still the final backstop for
  // a true simultaneous race, handled in the insert's error branch below.
  if (role === "athlete" && claimAthleteId) {
    const claimRes = await fetch(
      `${BASE}/rest/v1/team_members?athlete_id=eq.${encodeURIComponent(claimAthleteId)}&role=eq.athlete&select=account_id&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const claimRows = claimRes.ok ? await claimRes.json() : [];
    if (Array.isArray(claimRows) && claimRows.length > 0 && claimRows[0].account_id !== accountId) {
      return NextResponse.json({ error: CLAIM_TAKEN_ERROR }, { status: 409 });
    }
  }

  // ── team_members row — idempotent if this account already joined this team ──
  const existingMemberRes = await fetch(
    `${BASE}/rest/v1/team_members?campaign_slug=eq.${encodeURIComponent(campaign_slug)}&account_id=eq.${encodeURIComponent(accountId)}&select=id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const existingMemberRows = existingMemberRes.ok ? await existingMemberRes.json() : [];
  let memberId: string;
  let isNewMembership = false;

  if (Array.isArray(existingMemberRows) && existingMemberRows.length > 0) {
    memberId = existingMemberRows[0].id as string;
  } else {
    const memberSalt = generateMemberSalt();
    const memberRes = await fetch(`${BASE}/rest/v1/team_members`, {
      method:  "POST",
      headers: h({ Prefer: "return=representation" }),
      body: JSON.stringify({
        campaign_slug,
        role,
        name:       name.trim(),
        salt:       memberSalt,
        account_id: accountId,
        athlete_id: claimAthleteId,
      }),
    });
    if (!memberRes.ok) {
      const msg = await memberRes.text();
      const isClaimRace = msg.includes("team_members_athlete_claim_uniq") || msg.includes("23505");
      if (isClaimRace && role === "athlete") {
        return NextResponse.json({ error: CLAIM_TAKEN_ERROR }, { status: 409 });
      }
      return NextResponse.json({ error: `Failed to join team: ${msg}` }, { status: 500 });
    }
    const memberRows = await memberRes.json();
    memberId = memberRows[0].id as string;
    isNewMembership = true;
  }

  // Parent ↔ multiple-athletes links — additive, safe to re-run on idempotent re-join.
  if (role === "parent" && parentAthleteIds.length > 0) {
    await fetch(`${BASE}/rest/v1/team_member_athletes`, {
      method:  "POST",
      headers: h({ Prefer: "resolution=ignore-duplicates,return=minimal" }),
      body:    JSON.stringify(parentAthleteIds.map(aid => ({ team_member_id: memberId, athlete_id: aid }))),
    });
  }

  const response = NextResponse.json({ ok: true, campaign_slug });
  if (newCookieValue) response.cookies.set("elf_session", newCookieValue, cookieOpts);

  if (isNewMembership && email?.trim() && (role === "athlete" || role === "parent")) {
    // See src/app/api/auth/request-reset/route.ts for why this isn't a bare
    // `NEXT_PUBLIC_APP_URL || origin` fallback — that env var is set for
    // Preview too, so it would hard-code every preview deployment's welcome
    // link to the production host instead of the deployment that issued it.
    const appBase = process.env.VERCEL_ENV === "production"
      ? (process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin)
      : new URL(req.url).origin;
    const settingsRes = await fetch(
      `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(campaign_slug)}&select=school_name&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const settingsRows = settingsRes.ok ? await settingsRes.json() : [];
    const teamName = settingsRows[0]?.school_name || campaign_slug;

    sendMemberWelcome({
      to:         email.trim().toLowerCase(),
      name:       name.trim(),
      teamName,
      role,
      teamHubUrl: `${appBase}/team/${campaign_slug}/home`,
      isNewAccount,
    }).catch(err => console.error("[auth/join] welcome email failed:", err));
  }

  return response;
}
