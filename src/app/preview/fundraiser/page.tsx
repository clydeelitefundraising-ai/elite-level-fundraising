import type { Metadata } from "next";
import "@/app/campaign/_shared/campaign.css";
import { SampleCampaign } from "@/components/marketing/demo/SampleCampaign";
import { SAMPLE_NOTICE } from "@/components/marketing/demo/fixtures";

// The fictional sample fundraiser shown (in a frame) on /fundraising. It is
// the real public campaign page component with sample data only — see
// SampleCampaign.tsx. Never indexed, never a real campaign, never a payment.
export const metadata: Metadata = {
  title: "Sample Fundraiser | Elite Level Fundraising",
  robots: { index: false, follow: false },
};

export default async function SampleFundraiserPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return (
    <>
      <div
        role="note"
        style={{
          position: "sticky", top: 0, zIndex: 1000, background: "#121110", color: "#FFCA2A",
          font: "700 12px/1.4 system-ui, sans-serif", letterSpacing: ".02em", textAlign: "center", padding: "7px 12px",
        }}
      >
        Preview · {SAMPLE_NOTICE} Donations are turned off.
      </div>
      <SampleCampaign view={view === "athlete" ? "athlete" : "team"} />
    </>
  );
}
