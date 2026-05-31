import Image from "next/image";
import { insertDonation, donationExists, getCampaignSettings } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function DonationSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { slug } = await params;
  const { session_id } = await searchParams;
  if (session_id) {
    await saveDonation(session_id, slug);
  }

  const settings = await getCampaignSettings(slug).catch(() => null);
  const teamName = settings
    ? `${settings.school_name} ${settings.mascot} ${settings.sport_name}`
    : "the team";

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <a href="/" style={styles.navLogo}>
          <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising" width={160} height={46} priority />
        </a>
      </nav>

      <main style={styles.main}>
        <div style={styles.card}>
          <div style={styles.iconWrap}>🎉</div>
          <h1 style={styles.heading}>Thank You!</h1>
          <p style={styles.sub}>
            Your donation to the <strong>{teamName}</strong> program has been received.
            Every dollar you contribute helps our student athletes compete and grow this season.
          </p>
          <div style={styles.divider} />
          <p style={styles.note}>
            A receipt has been sent to your email by Stripe. If you have any questions,
            contact us at{" "}
            <a href="mailto:support@elitelevelfundraising.com" style={styles.link}>
              support@elitelevelfundraising.com
            </a>.
          </p>
          <a href={`/campaign/${slug}`} style={styles.btn}>← Back to Campaign</a>
        </div>

        <div style={styles.poweredBy}>
          <Image src="/ELF.LOGO.png" alt="Elite Level Fundraising" width={90} height={26} />
          <span style={styles.poweredText}>Powered by Elite Level Fundraising</span>
        </div>
      </main>
    </div>
  );
}

async function saveDonation(sessionId: string, campaignSlug: string) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) { console.error("[success] STRIPE_SECRET_KEY not set"); return; }

    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );
    if (!res.ok) { console.error("[success] Stripe fetch failed", res.status); return; }

    const session = await res.json();
    if (session.payment_status !== "paid") return;

    const alreadySaved = await donationExists(sessionId);
    if (alreadySaved) return;

    await insertDonation({
      stripe_session_id: sessionId,
      donor_name:        session.metadata?.donor_name       ?? null,
      amount_cents:      session.amount_total,
      athlete_name:      session.metadata?.athlete_name     ?? null,
      athlete_id:        session.metadata?.athlete_id       ?? null,
      donation_message:  session.metadata?.donation_message ?? null,
      campaign_slug:     campaignSlug,
    });
  } catch (err) {
    console.error("[success] saveDonation error:", err);
  }
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--off-white)",
    display: "flex",
    flexDirection: "column",
  },
  nav: {
    background: "var(--navy)",
    padding: "0 2rem",
    height: 64,
    display: "flex",
    alignItems: "center",
  },
  navLogo: {
    display: "flex",
    alignItems: "center",
    textDecoration: "none",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "3rem 1.5rem",
  },
  card: {
    background: "#fff",
    borderRadius: "var(--card-radius)",
    padding: "3rem 2.5rem",
    maxWidth: 520,
    width: "100%",
    textAlign: "center",
    boxShadow: "0 4px 24px rgba(11,30,61,0.08)",
  },
  iconWrap:  { fontSize: "3rem", marginBottom: "1rem" },
  heading: {
    fontFamily: "var(--font-display)",
    fontSize: "2.8rem",
    color: "var(--navy)",
    letterSpacing: "0.04em",
    marginBottom: "0.75rem",
  },
  sub: {
    fontFamily: "var(--font-body)",
    fontSize: "1.05rem",
    color: "var(--navy)",
    lineHeight: 1.6,
    marginBottom: "1.5rem",
  },
  divider: { height: 1, background: "var(--gray-light)", margin: "1.5rem 0" },
  note: {
    fontSize: "0.9rem",
    color: "var(--gray)",
    lineHeight: 1.6,
    marginBottom: "2rem",
  },
  link: { color: "var(--gold)", textDecoration: "none" },
  btn: {
    display: "inline-block",
    background: "var(--navy)",
    color: "#fff",
    fontFamily: "var(--font-display)",
    fontSize: "1.1rem",
    letterSpacing: "0.06em",
    padding: "0.9rem 2rem",
    borderRadius: 10,
    textDecoration: "none",
  },
  poweredBy: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    marginTop: "2rem",
    opacity: 0.55,
  },
  poweredText: {
    fontFamily: "var(--font-body)",
    fontSize: "0.8rem",
    color: "var(--navy)",
  },
};
