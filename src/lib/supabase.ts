const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function headers(key: string, extra?: Record<string, string>) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export type DonationRow = {
  id: string;
  stripe_session_id: string;
  donor_name: string | null;
  amount_cents: number;
  athlete_name: string | null;
  donation_message: string | null;
  created_at: string;
};

export async function insertDonation(
  data: Omit<DonationRow, "id" | "created_at">,
): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${BASE}/rest/v1/donations?on_conflict=stripe_session_id`, {
    method: "POST",
    headers: headers(key, { Prefer: "resolution=ignore-duplicates" }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${msg}`);
  }
}

export async function getDonations(): Promise<DonationRow[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/donations?select=*&order=created_at.desc`,
    { headers: headers(key), cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase select failed (${res.status}): ${body}`);
  }
  return res.json();
}
