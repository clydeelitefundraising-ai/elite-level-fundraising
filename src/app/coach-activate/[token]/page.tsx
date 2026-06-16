import { createHash } from "crypto";
import ActivateView from "./ActivateView";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export default async function CoachActivatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const tokenRes = await fetch(
    `${BASE}/rest/v1/coach_invite_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,coach_id,expires_at,used_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );

  if (!tokenRes.ok) {
    return <ActivateView status="error" token={token} />;
  }

  const tokenRows = await tokenRes.json();
  if (!Array.isArray(tokenRows) || tokenRows.length === 0) {
    return <ActivateView status="invalid" token={token} />;
  }

  const tokenRow = tokenRows[0] as {
    id:         string;
    coach_id:   string;
    expires_at: string;
    used_at:    string | null;
  };

  if (tokenRow.used_at) {
    return <ActivateView status="used" token={token} />;
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return <ActivateView status="expired" token={token} />;
  }

  // Fetch the coach
  const coachRes = await fetch(
    `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(tokenRow.coach_id)}&select=id,name,email,campaign_slug&limit=1`,
    { headers: h(), cache: "no-store" },
  );

  if (!coachRes.ok) {
    return <ActivateView status="error" token={token} />;
  }

  const coachRows = await coachRes.json();
  if (!Array.isArray(coachRows) || coachRows.length === 0) {
    return <ActivateView status="invalid" token={token} />;
  }

  const coach = coachRows[0] as {
    id:            string;
    name:          string;
    email:         string;
    campaign_slug: string;
  };

  // Check whether this email already has an elf_account
  const existingRes = await fetch(
    `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(coach.email.toLowerCase())}&select=id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const existingRows = existingRes.ok ? await existingRes.json() : [];
  const hasExistingAccount = Array.isArray(existingRows) && existingRows.length > 0;

  return (
    <ActivateView
      status="valid"
      token={token}
      coachName={coach.name}
      email={coach.email}
      campaignSlug={coach.campaign_slug}
      hasExistingAccount={hasExistingAccount}
    />
  );
}
