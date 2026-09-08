import { redirect } from "next/navigation";
import { getMemberSession } from "@/lib/memberSession";
import ActivateAccountView from "./ActivateAccountView";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

// Identity Compatibility Phase — member-side counterpart to
// /coach-activate/[token]. No token in the URL: the caller's existing
// team_member cookie (verified by getMemberSession) IS the record-specific
// proof of identity, so this page simply requires that session to exist
// for this exact slug. Not linked from nav/AccountMenu yet — reachable by
// direct URL only in this phase; wiring a discoverable entry point is
// follow-up UI work, out of scope here.
export default async function ActivateAccountPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getMemberSession(slug);
  if (!session) redirect(`/team/${slug}`);

  const res = await fetch(
    `${BASE}/rest/v1/team_members?id=eq.${encodeURIComponent(session.id)}&select=email,account_id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows = res.ok ? await res.json() : [];
  const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as { email: string | null; account_id: string | null }) : null;

  return (
    <ActivateAccountView
      slug={slug}
      name={session.name}
      email={row?.email ?? ""}
      alreadyLinked={!!row?.account_id}
    />
  );
}
